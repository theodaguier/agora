import { randomBytes } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "./env";
import { installHermesPlugin, restartGateway } from "./hermes-admin";

/**
 * The agora_vault Hermes plugin (infra/hermes-plugins/agora_vault): the tools a bot uses to read
 * the Coffre-fort (vaults.ts) on behalf of the person who started its turn.
 *
 * Same scheme as agora_code (code-plugin.ts): it calls this API on 127.0.0.1 with a token written,
 * at each start of the API, next to the profiles, readable by the gateway's user only. Installed and
 * on in every profile: what a bot reads is decided per vault, by its members.
 */
const PLUGIN = "agora_vault";

let token: string | null = null;
export const vaultInternalToken = () => token;

async function writeToken() {
  token = randomBytes(32).toString("hex");
  const dir = join(env.HERMES_HOME, "agora-vault");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const tmp = join(dir, ".api.json.tmp");
  await writeFile(tmp, JSON.stringify({ url: `http://127.0.0.1:${env.PORT}/api/internal/vault`, token }), { mode: 0o600 });
  await rename(tmp, join(dir, "api.json"));
}

/** Symlink + `plugins.enabled`. True when the gateway must reload plugins. */
export const installVaultPlugin = (profile: string) => installHermesPlugin(profile, PLUGIN);

export async function setupVaultPlugin() {
  if (!env.HERMES_HOME) return;
  await writeToken();
  const { profiles } = await import("./memory");
  let restart = false;
  for (const p of await profiles()) {
    restart = (await installVaultPlugin(p).catch((err) => console.error(`vault plugin: ${p}`, err))) || restart;
  }
  if (restart) await restartGateway().catch((err) => console.error("vault plugin: gateway restart", err));
}
