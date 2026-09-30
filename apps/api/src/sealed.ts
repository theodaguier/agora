import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "./env";

/**
 * Secrets the app keeps in its database (integrations' keys, repositories' credentials): encrypted
 * with a key derived from BETTER_AUTH_SECRET, so a database dump alone doesn't leak them.
 * AES-256-GCM, "iv.tag.ciphertext" in base64url.
 */

const cryptoKey = () => createHash("sha256").update(`agora-integrations:${env.BETTER_AUTH_SECRET}`).digest();

export function seal(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cryptoKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

/** Throws when it can't be read (BETTER_AUTH_SECRET changed). */
export function unseal(sealed: string) {
  const [iv, tag, data] = sealed.split(".").map((s) => Buffer.from(s, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", cryptoKey(), iv!);
  decipher.setAuthTag(tag!);
  return Buffer.concat([decipher.update(data!), decipher.final()]).toString("utf8");
}
