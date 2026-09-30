/**
 * Files a bot sends with its reply (`MEDIA:<path>` tags, @agora/core media.ts): each one it
 * may send is copied into the conversation's files and joined to its message.
 *
 * A path comes from the model, so from whoever steers it (a prompt injection in a web page or
 * a file included): it is only followed into the places where the bot's own work lands, never
 * elsewhere on the server (profiles' keys, config.yaml, the database's files):
 * - the media its Hermes tools produce (speech, screenshots, images from connectors), in its
 *   profile's caches;
 * - the working directories of this conversation's Claude Code sessions;
 * - the conversation's outbox, where a bot with a terminal writes what it renders itself.
 */
import { eq } from "drizzle-orm";
import { realpath, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, sep } from "node:path";
import { storeAttachment } from "./attachments";
import { db, schema } from "./db";
import { env } from "./env";
import { profileHome } from "./hermes";

/** Larger than an upload (attachments.ts): a rendered video easily weighs tens of megabytes. */
export const MAX_BOT_FILE = 100 * 1024 * 1024;
/** Files joined to one reply at most. */
const MAX_FILES = 10;

/** Hermes's media caches in a profile (gateway/platforms/base.py MEDIA_DELIVERY_SAFE_ROOTS): canonical and legacy layouts. */
const HERMES_CACHES = [
  ...["images", "audio", "videos", "documents", "screenshots"].map((d) => join("cache", d)),
  "image_cache",
  "audio_cache",
  "video_cache",
  "document_cache",
  "browser_screenshots",
];

/** Where a bot that renders a file itself (terminal, code) writes it to send it: shared by the API and Hermes. */
export const outboxDir = (conversationId: string) => join(env.HERMES_HOME || join(homedir(), ".agora"), "agora-outbox", conversationId);

export function mediaPrompt(conversationId: string) {
  return [
    "# Envoyer un fichier",
    "Pour envoyer un fichier que tu as produit (vidéo, son, image, PDF, document…), écris dans ta réponse, sur sa propre ligne : `MEDIA:/chemin/absolu/du/fichier`. L'app le joint à ton message : lecteur pour une vidéo ou un son, aperçu pour une image, téléchargement sinon.",
    "- Les chemins `MEDIA:` que te rendent tes outils (synthèse vocale, captures, connecteurs) s'envoient ainsi, tels quels.",
    "- Un fichier produit par une session Claude Code de cette conversation (rendu vidéo, export…) : demande-lui son chemin absolu, puis envoie-le.",
    `- Un fichier que tu écris toi-même (terminal, code) : écris-le dans \`${outboxDir(conversationId)}/\` (crée le dossier au besoin), il en sort une fois envoyé.`,
    "- Rien d'autre ne part : n'invente jamais de chemin. 100 Mo au plus par fichier, 10 fichiers par réponse. Pas de balise `MEDIA:` dans un bloc de code.",
  ].join("\n");
}

const within = (path: string, root: string) => path === root || path.startsWith(root.endsWith(sep) ? root : root + sep);

/** The places this bot may send from, resolved (symlinks followed), those that exist. */
async function allowedRoots(ctx: { conversationId: string; profile: string }) {
  const sessions = await db.select({ cwd: schema.codeSession.cwd }).from(schema.codeSession).where(eq(schema.codeSession.conversationId, ctx.conversationId));
  const caches = env.HERMES_HOME ? HERMES_CACHES.map((d) => join(profileHome(ctx.profile), d)) : [];
  const roots = [...caches, ...sessions.map((s) => s.cwd), outboxDir(ctx.conversationId)];
  const resolved = await Promise.all(roots.map((r) => realpath(r).catch(() => null)));
  return { roots: resolved.filter((r): r is string => !!r), outbox: resolved.at(-1) ?? null };
}

export type SentFile = { id: string; name: string; mime: string; size: number };

/**
 * Joins the files of `paths` the bot may send to the conversation (in the bot's profile in a
 * direct conversation, like an upload). Returns those saved, and the paths they came from:
 * a refused path keeps its tag in the text.
 */
export async function saveBotFiles(paths: string[], ctx: { conversationId: string; profile: string; directProfile: string | null }) {
  const saved: SentFile[] = [];
  const sent = new Set<string>();
  if (!paths.length) return { saved, sent };
  const { roots, outbox } = await allowedRoots(ctx);
  for (const path of paths.slice(0, MAX_FILES)) {
    const real = await realpath(path.replace(/^~(?=\/)/, homedir())).catch(() => null);
    const info = real ? await stat(real).catch(() => null) : null;
    if (!real || !info?.isFile() || !roots.some((r) => within(real, r))) {
      console.error("bot-files: refused", path);
      continue;
    }
    if (!info.size || info.size > MAX_BOT_FILE) {
      console.error("bot-files: size", path, info.size);
      continue;
    }
    const file = Bun.file(real);
    const row = await storeAttachment(ctx.conversationId, ctx.directProfile, basename(real), file.type || "application/octet-stream", file).catch((err) => {
      console.error("bot-files: save", err);
      return null;
    });
    if (!row) continue;
    saved.push({ id: row.id, name: row.name, mime: row.mime, size: row.size });
    sent.add(path);
    // Out of the outbox once sent: it is a way out, not a store.
    if (outbox && within(real, outbox)) await rm(real, { force: true }).catch(() => {});
  }
  return { saved, sent };
}
