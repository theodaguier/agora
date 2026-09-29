import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { db, schema } from "./db";
import { env } from "./env";
import { profileHome } from "./hermes";

export const MAX_FILE = 25 * 1024 * 1024;

const safeName = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 120) || "fichier";

/**
 * Where a conversation's files go: the bot's Hermes profile in a direct
 * conversation with it (`directProfile`, readable by its file tools), a
 * per-conversation shared folder otherwise (groups, colleague to colleague).
 */
function attachmentDir(conversationId: string, directProfile: string | null) {
  if (directProfile) {
    if (!env.HERMES_HOME) throw new Error("hermes_home_missing");
    return join(profileHome(directProfile), "attachments", "agora");
  }
  return join(env.HERMES_HOME || join(homedir(), ".agora"), "agora-attachments", conversationId);
}

export async function storeAttachment(conversationId: string, directProfile: string | null, name: string, mime: string, content: Blob) {
  const id = crypto.randomUUID();
  const dir = attachmentDir(conversationId, directProfile);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${id}-${safeName(name)}`);
  await Bun.write(path, content);
  const row = { id, conversationId, name: name.slice(0, 200), mime, size: content.size, path };
  const [saved] = await db.insert(schema.attachment).values(row).returning();
  return saved!;
}
