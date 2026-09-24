import { rename } from "node:fs/promises";
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

/** Rewrites a key in the production .env (atomic write). */
export async function setEnv(key: string, value: string) {
  const text = await Bun.file(path()).text();
  const re = new RegExp(`^${key}=.*$`, "m");
  const next = re.test(text) ? text.replace(re, `${key}=${value}`) : `${text.replace(/\n?$/, "\n")}${key}=${value}\n`;
  const tmp = `${path()}.tmp`;
  await Bun.write(tmp, next);
  await rename(tmp, path());
}
