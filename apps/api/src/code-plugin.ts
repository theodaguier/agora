import { randomBytes } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { env } from "./env";
import { hermesCli, installHermesPlugin, restartGateway } from "./hermes-admin";

/**
 * The agora_code Hermes plugin (infra/hermes-plugins/agora_code): the tools a
 * bot uses to start and follow Claude Code sessions (code-sessions.ts).
 *
 * It calls this API on 127.0.0.1 (same network as the gateway) with a token
 * written, at each start of the API, next to the profiles, readable by the
 * gateway's user only. Installed in every profile but off: an admin turns the
 * `agora_code` toolset on for the bots that code (Admin › Agents › Tools).
 */
const PLUGIN = "agora_code";
const PLATFORMS = ["api_server", "cron"];
/** Profiles where the toolset was turned off once, at install: an admin's later choice stays. */
const KEY = "code.plugin.installed";

let token: string | null = null;
export const internalToken = () => token;

async function writeToken() {
  token = randomBytes(32).toString("hex");
  const dir = join(env.HERMES_HOME, "agora-code");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const tmp = join(dir, ".api.json.tmp");
  await writeFile(tmp, JSON.stringify({ url: `http://127.0.0.1:${env.PORT}/api/internal/code`, token }), { mode: 0o600 });
  await rename(tmp, join(dir, "api.json"));
}

async function installed(): Promise<string[]> {
  const [row] = await db.select({ value: schema.setting.value }).from(schema.setting).where(eq(schema.setting.key, KEY));
  try {
    return row ? JSON.parse(row.value) : [];
  } catch {
    return [];
  }
}

/** Links the plugin into the profile; the first time, its toolset starts off. True when the gateway must reload plugins. */
export async function installCodePlugin(profile: string, done?: string[]) {
  const enabled = await installHermesPlugin(profile, PLUGIN);
  const list = done ?? (await installed());
  if (list.includes(profile)) return enabled;
  for (const platform of PLATFORMS) await hermesCli(["tools", "disable", PLUGIN, "--platform", platform], { profile, timeoutMs: 60_000 });
  const value = JSON.stringify([...new Set([...(await installed()), profile])].sort());
  await db.insert(schema.setting).values({ key: KEY, value }).onConflictDoUpdate({ target: schema.setting.key, set: { value } });
  return enabled;
}

export async function setupCodePlugin() {
  if (!env.HERMES_HOME) return;
  await writeToken();
  const { profiles } = await import("./memory");
  const done = await installed();
  let restart = false;
  for (const p of await profiles()) {
    restart = (await installCodePlugin(p, done).catch((err) => console.error(`code plugin: ${p}`, err))) || restart;
  }
  if (restart) await restartGateway().catch((err) => console.error("code plugin: gateway restart", err));
}
