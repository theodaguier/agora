/**
 * Artifacts written by a bot in an ```artifact block (@agora/core previews.ts; ```preview still reads).
 * The app renders them while they stream; at the end of the reply each becomes an HTML file of the
 * conversation (shown with the message and in its files, downloadable, readable by the bots' file
 * tools) and the next version of the artifact its slug names (artifacts.ts), which can be shared.
 */
import { artifactSlug, previewFileName, type LivePreview, type PreviewRef } from "@agora/core";
import { ARTIFACT_SCRIPT_HOSTS, recordVersion } from "./artifacts";
import { MAX_FILE, storeAttachment } from "./attachments";

export const PREVIEW_PROMPT = [
  "# Artefacts (pages HTML)",
  "Quand on te demande une page, une maquette, un écran, un mini-outil, un tableau de bord ou un document à voir ou à partager, écris la page complète dans ce bloc, dans ta réponse : l'app l'affiche en direct pendant que tu l'écris, la garde comme artefact de la conversation, et la personne peut la partager par lien.",
  "```artifact slug=nom-court",
  '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>…</title><style>…</style></head><body>…<script>…</script></body></html>',
  "```",
  "- `slug` : un identifiant court en minuscules et tirets, propre à cette page (`tableau-ventes-q3`). Pour la modifier, renvoie la page entière modifiée avec le même slug : elle devient la version suivante du même artefact, et son lien de partage montre la nouvelle. Un autre slug crée un autre artefact. Plusieurs pages : un bloc chacune.",
  `- Un seul fichier autonome. Le JavaScript s'exécute une fois le bloc fermé (scripts dans la page ou bibliothèques depuis ${ARTIFACT_SCRIPT_HOSTS.join(", ")}, avec une version exacte). Rien d'autre n'est chargé : pas d'autre domaine de script. Les images, styles et polices en \`https://\` s'affichent ; \`fetch\` vers une API publique en https fonctionne, sans cookies ni accès à l'app.`,
  "- La page s'exécute isolée : pas de `localStorage` fiable, pas de formulaire envoyé ailleurs. Garde l'état en mémoire.",
  "- Commence par `<head>` et le `<style>`, puis la page de haut en bas : elle se construit sous les yeux de la personne. Mets les scripts à la fin.",
  "- `<title>` : le nom de l'artefact (« Tableau des ventes — T3 »).",
  "- Écris-la toi-même dans ce bloc : pas de fichier sur disque, de sous-agent, de dépôt ni de lien à la place. Ton texte autour reste court, ne répète pas la page et ne mentionne pas le bloc.",
].join("\n");

/**
 * Saves the pages of a reply as files of the conversation (in the bot's profile in a direct
 * conversation, like an upload) and as versions of their artifacts. One that can't be saved is
 * left out; one saved without its version stays a plain mockup.
 */
export async function savePreviews(previews: LivePreview[], ctx: { conversationId: string; turnId: string; directProfile: string | null }) {
  const saved: { attachment: { id: string; name: string; mime: string; size: number }; preview: PreviewRef }[] = [];
  for (const [index, p] of previews.entries()) {
    const body = new Blob([p.html], { type: "text/html" });
    // Same index as in the streamed reply: the app follows the page by it.
    if (!p.html.trim() || body.size > MAX_FILE) continue;
    const row = await storeAttachment(ctx.conversationId, ctx.directProfile, previewFileName(p.title), "text/html", body).catch((err) => {
      console.error("previews: save", err);
      return null;
    });
    if (!row) continue;
    const slug = p.slug || artifactSlug(p.title) || `page-${index + 1}`;
    const version = await recordVersion(ctx.conversationId, slug, p.title, row.id).catch((err) => {
      console.error("previews: artifact version", err);
      return null;
    });
    saved.push({
      attachment: { id: row.id, name: row.name, mime: row.mime, size: row.size },
      preview: { id: row.id, title: p.title, key: `${ctx.turnId}:${index}`, ...version },
    });
  }
  return saved;
}
