import { mkdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { MAX_ATTACHMENT } from "@agora/core";
import { db, schema } from "./db";
import { env } from "./env";
import { profileHome } from "./hermes";

export const MAX_FILE = MAX_ATTACHMENT;

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

async function newFile(conversationId: string, directProfile: string | null, name: string) {
  const id = crypto.randomUUID();
  const dir = attachmentDir(conversationId, directProfile);
  await mkdir(dir, { recursive: true });
  return { id, path: join(dir, `${id}-${safeName(name)}`) };
}

async function saveRow(row: typeof schema.attachment.$inferInsert) {
  const [saved] = await db.insert(schema.attachment).values(row).returning();
  return saved!;
}

export async function storeAttachment(conversationId: string, directProfile: string | null, name: string, mime: string, content: Blob) {
  const { id, path } = await newFile(conversationId, directProfile, name);
  await Bun.write(path, content);
  return saveRow({ id, conversationId, name: name.slice(0, 200), mime, size: content.size, path });
}

/**
 * An upload, written to disk as it arrives (a video doesn't fit in memory). Past MAX_FILE
 * bytes it stops and the partial file goes: null.
 */
export async function streamAttachment(conversationId: string, directProfile: string | null, name: string, mime: string, body: ReadableStream<Uint8Array>) {
  const { id, path } = await newFile(conversationId, directProfile, name);
  // Flushed to disk every MiB.
  const sink = Bun.file(path).writer({ highWaterMark: 1024 * 1024 });
  let size = 0;
  try {
    for await (const chunk of body) {
      size += chunk.byteLength;
      if (size > MAX_FILE) break;
      sink.write(chunk);
    }
    await sink.end();
  } catch (err) {
    // The upload was cut off (cancelled, connection lost).
    await Promise.resolve(sink.end()).catch(() => {});
    await rm(path, { force: true });
    throw err;
  }
  if (size === 0 || size > MAX_FILE) {
    await rm(path, { force: true });
    return null;
  }
  return saveRow({ id, conversationId, name: name.slice(0, 200), mime, size, path });
}
