/**
 * Agent confinement. Whoever talks to an agent steers its tools, a prompt
 * injection hidden in a web page or a file included. Some of Hermes's
 * toolsets hand the whole server over to them:
 * - terminal, code_execution: commands as the gateway user, next to every
 *   profile's keys and the API's database;
 * - file: writes anywhere, e.g. an MCP server declared in another profile's
 *   config.yaml, whose command Hermes runs on the next restart;
 * - browser: a local Chromium that reaches 127.0.0.1, where the Hermes
 *   dashboard hands its session token to any page that loads it;
 * - computer_use: the host's mouse, keyboard and screen.
 *
 * Every profile therefore starts without them, once: they are removed from the
 * app's sessions (api_server) and from cron jobs, and put in
 * `agent.disabled_toolsets`, the one list a cron job created by the agent
 * cannot widen. An admin can turn one back on for a given agent (Admin ›
 * Agent › Tools), knowingly; that choice is not undone at the next startup.
 * Attachments stay readable through the agora_files plugin (read-only, only
 * the current conversation's files).
 */
import { eq } from "drizzle-orm";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { db, schema } from "./db";
import { env } from "./env";
import { profileHome } from "./hermes";
import { hermesCli, installHermesPlugin, restartGateway } from "./hermes-admin";

export const RISKY_TOOLSETS = ["terminal", "code_execution", "file", "browser", "computer_use"];
/** Read-only attachments (infra/hermes-plugins/agora_files). */
const FILES_PLUGIN = "agora_files";
/** Where the agent's tools apply: the app's conversations and the cron jobs it schedules. */
const PLATFORMS = ["api_server", "cron"];
/** Per profile, the risky toolsets already turned off once (JSON object): an admin's later choice stays. */
const KEY = "sandbox.confined";

export const isRisky = (toolset: string) => RISKY_TOOLSETS.includes(toolset);

async function confined(): Promise<Record<string, string[]>> {
  const [row] = await db.select({ value: schema.setting.value }).from(schema.setting).where(eq(schema.setting.key, KEY));
  try {
    return row ? JSON.parse(row.value) : {};
  } catch {
    return {};
  }
}

async function saveConfined(profile: string, toolsets: string[]) {
  const all = await confined();
  all[profile] = [...new Set([...(all[profile] ?? []), ...toolsets])].sort();
  const value = JSON.stringify(all);
  await db.insert(schema.setting).values({ key: KEY, value }).onConflictDoUpdate({ target: schema.setting.key, set: { value } });
}

/** Adds or removes toolsets from the profile's `agent.disabled_toolsets` (config.yaml, re-read by Hermes on every turn). */
async function setDenied(profile: string, toolsets: string[], denied: boolean) {
  const { parseDocument } = await import("yaml");
  const path = join(profileHome(profile), "config.yaml");
  const doc = parseDocument(await readFile(path, "utf8").catch(() => ""));
  const current = doc.toJS()?.agent?.disabled_toolsets;
  const list = new Set<string>(Array.isArray(current) ? current.map(String) : []);
  for (const t of toolsets) denied ? list.add(t) : list.delete(t);
  doc.setIn(["agent", "disabled_toolsets"], [...list]);
  await writeFile(path, doc.toString());
}

/** Toolsets the profile's config.yaml denies whatever the platform says. */
export async function deniedToolsets(profile: string) {
  const { parse } = await import("yaml");
  const config = parse(await readFile(join(profileHome(profile), "config.yaml"), "utf8").catch(() => "")) ?? {};
  const list = config.agent?.disabled_toolsets;
  return new Set<string>(Array.isArray(list) ? list.map(String) : []);
}

async function setPlatforms(profile: string, toolsets: string[], enabled: boolean) {
  for (const platform of PLATFORMS) {
    await hermesCli(["tools", enabled ? "enable" : "disable", ...toolsets, "--platform", platform], { profile, timeoutMs: 60_000 });
  }
}

/** Admin › Agent › Tools: a risky toolset goes on or off everywhere, config.yaml's list included. */
export async function setRiskyToolset(profile: string, toolset: string, enabled: boolean) {
  await setDenied(profile, [toolset], !enabled);
  await setPlatforms(profile, [toolset], enabled);
}

/** Turns off the risky toolsets this profile was never confined from (all of them for a new profile). */
async function confine(profile: string, done: string[] = []) {
  const todo = RISKY_TOOLSETS.filter((t) => !done.includes(t));
  if (!todo.length) return todo;
  await setDenied(profile, todo, true);
  await setPlatforms(profile, todo, false);
  await saveConfined(profile, todo);
  return todo;
}

/** Read-only attachments tool. True when the plugin was just enabled (the gateway loads plugins at startup). */
async function installFilesPlugin(profile: string) {
  const enabled = await installHermesPlugin(profile, FILES_PLUGIN);
  if (enabled) await setPlatforms(profile, [FILES_PLUGIN], true);
  return enabled;
}

/** For a new profile (createProfile): confined right away, before its first conversation. */
export async function confineNewProfile(profile: string) {
  await installFilesPlugin(profile);
  await confine(profile);
}

/** At startup: every profile gets the attachments tool, and loses the risky toolsets it was never confined from. */
export async function setupSandbox() {
  if (!env.HERMES_HOME) return;
  const { profiles } = await import("./memory");
  const done = await confined();
  let restart = false;
  for (const p of await profiles()) {
    try {
      restart = (await installFilesPlugin(p)) || restart;
      const off = await confine(p, done[p]);
      if (off.length) console.log(`sandbox: ${p} confined (${off.join(", ")} off)`);
    } catch (err) {
      console.error(`sandbox: ${p}`, err);
    }
  }
  if (restart) await restartGateway().catch((err) => console.error("sandbox: gateway restart", err));
}
