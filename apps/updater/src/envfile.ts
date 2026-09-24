import { chmod, chown, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config";

const path = () => join(config.projectDir, ".env");

export async function readEnv() {
  const text = await Bun.file(path()).text();
  const values: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) values[m[1]!] = m[2]!;
  }
  return values;
}

/**
 * Rewrites a key in the production .env (atomic write). The new file keeps the
 * old one's owner and mode: the updater runs as root, and a plain write would
 * leave the instance's secrets world-readable (644) and owned by root, out of
 * reach of `agora` run by the admin (backup-offsite).
 */
export async function setEnv(key: string, value: string) {
  const text = await Bun.file(path()).text();
  const { uid, gid, mode } = await stat(path());
  const re = new RegExp(`^${key}=.*$`, "m");
  const next = re.test(text) ? text.replace(re, `${key}=${value}`) : `${text.replace(/\n?$/, "\n")}${key}=${value}\n`;
  const tmp = `${path()}.tmp`;
  await writeFile(tmp, next, { mode: 0o600 });
  await chmod(tmp, mode & 0o777 & ~0o077);
  await chown(tmp, uid, gid);
  await rename(tmp, path());
}
