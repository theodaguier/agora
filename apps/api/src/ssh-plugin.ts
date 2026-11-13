import { randomBytes } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "./env";
import { installHermesPlugin, restartGateway } from "./hermes-admin";

/**
 * The agora_ssh Hermes plugin (infra/hermes-plugins/agora_ssh): the tools a bot uses to run commands
 * on the Machines SSH (ssh.ts).
 *
 * Same scheme as agora_vault (vault-plugin.ts): it calls this API on 127.0.0.1 with a token written,
 * at each start of the API, next to the profiles, readable by the gateway's user only. Installed and
 * on in every profile: which bots reach a machine is decided per machine, in Settings › Machines.
 */
const PLUGIN = "agora_ssh";

let token: string | null = null;
export const sshInternalToken = () => token;

async function writeToken() {
  token = randomBytes(32).toString("hex");
  const dir = join(env.HERMES_HOME, "agora-ssh");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const tmp = join(dir, ".api.json.tmp");
  await writeFile(tmp, JSON.stringify({ url: `http://127.0.0.1:${env.PORT}/api/internal/ssh`, token }), { mode: 0o600 });
  await rename(tmp, join(dir, "api.json"));
}

/** Symlink + `plugins.enabled`. True when the gateway must reload plugins. */
export const installSshPlugin = (profile: string) => installHermesPlugin(profile, PLUGIN);

export async function setupSshPlugin() {
  if (!env.HERMES_HOME) return;
  await writeToken();
  const { profiles } = await import("./memory");
  let restart = false;
  for (const p of await profiles()) {
    restart = (await installSshPlugin(p).catch((err) => console.error(`ssh plugin: ${p}`, err))) || restart;
  }
  if (restart) await restartGateway().catch((err) => console.error("ssh plugin: gateway restart", err));
}
