/**
 * Hermes instance administration: headless dashboard (MCP, skills),
 * CLI (plugins, toolsets, default model) and gateway restart.
 */
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { lstat, mkdir, readdir, readFile, readlink, rename, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { env } from "./env";
import { isDefaultProfile, profileHome, profileKey } from "./hermes";
import { restartGatewayProcess } from "./hermes-process";
import { errors } from "./errors.messages";
import { defineMessages, tr } from "./i18n";
import { hermesEnv } from "./harden";

const messages = defineMessages({
  en: {
    dashboardNotConfigured: "The Hermes dashboard isn't configured",
    cliFailed: (code: number) => `hermes failed (${code})`,
    unexpectedCliOutput: "Unexpected response from the Hermes CLI",
    gatewayNotRunning: "The Hermes gateway isn't running",
    defaultProfileMcp: "For the default profile, turn the server on or off in the MCP tab.",
  },
  fr: {
    dashboardNotConfigured: "Le dashboard Hermes n'est pas configuré",
    cliFailed: (code: number) => `hermes a échoué (${code})`,
    unexpectedCliOutput: "Réponse inattendue de la CLI Hermes",
    gatewayNotRunning: "Le gateway Hermes ne tourne pas",
    defaultProfileMcp: "Pour le profil par défaut, active ou coupe le serveur dans l'onglet MCP.",
  },
});

export class HermesError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

/** Call to the Hermes dashboard (loopback + session token set at launch). */
export async function dashboard<T>(path: string, init?: RequestInit & { profile?: string }): Promise<T> {
  if (!env.HERMES_DASHBOARD_URL || !env.HERMES_DASHBOARD_TOKEN) {
    throw new HermesError(tr(messages).dashboardNotConfigured, 503);
  }
  const url = new URL(path, env.HERMES_DASHBOARD_URL);
  if (init?.profile && !isDefaultProfile(init.profile)) url.searchParams.set("profile", init.profile);
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", "X-Hermes-Session-Token": env.HERMES_DASHBOARD_TOKEN, ...init?.headers },
  });
  const body = await res.text();
  if (!res.ok) {
    let detail = body;
    try {
      detail = JSON.parse(body).detail ?? body;
    } catch {}
    throw new HermesError(typeof detail === "string" ? detail : JSON.stringify(detail), res.status >= 500 ? 502 : res.status);
  }
  return (body ? JSON.parse(body) : undefined) as T;
}

/** Runs the `hermes` CLI on the instance, without a shell (arguments passed as is). */
export async function hermesCli(args: string[], opts: { profile?: string; timeoutMs?: number } = {}) {
  if (!env.HERMES_HOME) throw new HermesError(tr(errors).hermesHomeNotConfigured, 503);
  const full = opts.profile && !isDefaultProfile(opts.profile) ? ["-p", opts.profile, ...args] : args;
  const proc = Bun.spawn([env.HERMES_BIN, ...full], {
    env: hermesEnv(),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const timer = setTimeout(() => proc.kill(), opts.timeoutMs ?? 120_000);
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  clearTimeout(timer);
  if (code !== 0) throw new HermesError((stderr || stdout).trim().split("\n").slice(-3).join("\n") || tr(messages).cliFailed(code));
  return stdout;
}

/**
 * Deletes a profile's Hermes sessions whose id starts with `prefix` (all
 * revisions and generations of a conversation), with those compression
 * continued them in: once a conversation is gone from the app, the bot can no
 * longer find it with session_search.
 */
export async function forgetSessions(profile: string, prefix: string) {
  const path = join(profileHome(profile), "state.db");
  if (!existsSync(path)) return 0;
  const sqlite = new Database(path, { readonly: true });
  let ids: string[];
  try {
    ids = sqlite
      .query<{ id: string }, [string]>(
        `with recursive tree(id) as (
           select id from sessions where id like ? escape '\\'
           union select s.id from sessions s join tree t on s.parent_session_id = t.id
         ) select id from tree`,
      )
      .all(`${prefix.replace(/[\\%_]/g, "\\$&")}%`)
      .map((r) => r.id);
  } finally {
    sqlite.close();
  }
  for (const id of ids) await hermesCli(["sessions", "delete", "--yes", id], { profile, timeoutMs: 30_000 });
  return ids.length;
}

export async function hermesCliJson<T>(args: string[], opts?: { profile?: string; timeoutMs?: number }) {
  const out = await hermesCli(args, opts);
  const start = out.search(/[[{]/);
  if (start === -1) throw new HermesError(tr(messages).unexpectedCliOutput);
  return JSON.parse(out.slice(start)) as T;
}

/**
 * Clean gateway restart (SIGUSR1): it finishes in-flight replies then exits;
 * the supervisor (dev script, Docker, systemd) starts it again.
 * Required after an MCP or plugin change.
 */
export async function restartGateway() {
  if (!env.HERMES_HOME) throw new HermesError(tr(errors).hermesHomeNotConfigured, 503);
  // Outside Docker nothing may relaunch it: the api makes sure it comes back.
  if (!env.UPDATER_URL) {
    void restartGatewayProcess().catch((err) => console.error("hermes: restart", err));
    return;
  }
  const pid = await gatewayPid();
  if (!pid) throw new HermesError(tr(messages).gatewayNotRunning, 503);
  process.kill(pid, "SIGUSR1");
}

let pendingRestart: ReturnType<typeof setTimeout> | undefined;

/**
 * Restart a few seconds after the last change: an admin turning a connector
 * on for several agents in a row causes a single restart, and nobody has to
 * think of the restart banner for the agents to get their tools.
 */
export function scheduleGatewayRestart(delayMs = 3000) {
  clearTimeout(pendingRestart);
  pendingRestart = setTimeout(() => {
    pendingRestart = undefined;
    restartGateway().catch((err) => console.error("hermes: scheduled restart", err));
  }, delayMs);
}

/** Live gateway pid. When the stack starts, s6 launches the gateway alongside the api: wait for it up to a minute. */
async function gatewayPid() {
  for (let i = 0; i < 60; i++) {
    const raw = await readFile(join(env.HERMES_HOME!, "gateway.pid"), "utf8").catch(() => null);
    const pid = raw ? (JSON.parse(raw) as { pid: number }).pid : null;
    if (pid && isAlive(pid)) return pid;
    await Bun.sleep(1000);
  }
  return null;
}

function isAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Links one of the app's Hermes plugins (infra/hermes-plugins/<name>) into the
 * profile and lists it in `plugins.enabled`. True when it was just enabled:
 * the gateway loads plugins at startup.
 */
export async function installHermesPlugin(profile: string, name: string) {
  const source = resolve(import.meta.dir, "../../../infra/hermes-plugins", name);
  const home = profileHome(profile);
  const link = join(home, "plugins", name);
  const current = await lstat(link).catch(() => null);
  if (!current) {
    await mkdir(dirname(link), { recursive: true });
    await symlink(source, link);
  } else if (current.isSymbolicLink() && resolve(dirname(link), await readlink(link)) !== source) {
    // Link points to an old copy of the repo: recreate it.
    await rm(link);
    await symlink(source, link);
  }
  const { parse } = await import("yaml");
  const config = parse(await readFile(join(home, "config.yaml"), "utf8").catch(() => "")) ?? {};
  if ((config.plugins?.enabled ?? []).includes(name)) return false;
  await hermesCli(["plugins", "enable", name], { profile });
  return true;
}

/**
 * Creates the Hermes profile for a new agent, cloned from the default profile
 * (model, provider keys, tools, skills), with its own API key.
 */
export async function createProfile(profile: string, description: string) {
  // Already there: a setup interrupted after the clone picks up from here (every step below can run again).
  if (!existsSync(join(profileHome(profile), "config.yaml"))) {
    await hermesCli(["profile", "create", profile, "--no-alias", "--clone-from", "default", "--description", description]);
  }
  const envPath = join(profileHome(profile), ".env");
  const current = await readFile(envPath, "utf8").catch(() => "");
  const lines = current.split("\n").filter((l) => l && !/^API_SERVER_(KEY|ENABLED|PORT|HOST)=/.test(l));
  lines.push(`API_SERVER_KEY=${profileKey(profile)}`);
  await writeFile(envPath, `${lines.join("\n")}\n`, { mode: 0o600 });
  // Company memory: the new agent reads and feeds the shared wiki.
  await (await import("./memory")).installWikiPlugin(profile).catch((err) => console.error("memory: plugin", err));
  // Agent screen: members can watch the browser it drives. A new profile's manager loads it on first use.
  await (await import("./screen")).installScreenPlugin(profile).catch((err) => console.error("screen: plugin", err));
  // Claude Code sessions, off until an admin turns them on for this agent (code-plugin.ts).
  const code = await import("./code-plugin");
  const linked = await code.linkCodePlugin(profile).then(
    () => true,
    (err) => (console.error("code plugin", err), false),
  );
  // Without terminal, code, file writes or local browser until an admin decides otherwise (sandbox.ts).
  // The code toolset goes off in the same CLI calls: each one is a Hermes start.
  await (await import("./sandbox")).confineNewProfile(profile, linked ? [code.CODE_TOOLSET] : []);
  if (linked) await code.markCodePluginInstalled(profile).catch((err) => console.error("code plugin", err));
  // OAuth connectors authorized for the instance work for the new agent too.
  await shareMcpTokens(profile).catch((err) => console.error("mcp tokens", err));
  // Skills written by the bots and shared with all of them.
  await (await import("./skill-requests")).shareSkillsWith(profile).catch((err) => console.error("shared skills", err));
}

/** Profiles being set up without anyone waiting (POST /agents): a turn of theirs waits for it (profileReady). */
const settingUp = new Map<string, Promise<void>>();
/** Setups that failed: the next turn runs them again. */
const unfinished = new Set<string>();

/**
 * Sets the profile up in the background: the few Hermes CLI starts it takes
 * (several seconds) happen while the admin reads the greeting.
 */
export function createProfileInBackground(profile: string, description: string) {
  const setup = createProfile(profile, description).then(
    () => void unfinished.delete(profile),
    (err) => {
      unfinished.add(profile);
      throw err;
    },
  );
  settingUp.set(profile, setup);
  void setup.finally(() => settingUp.delete(profile)).catch((err) => console.error(`hermes: profile ${profile}`, err));
  return setup;
}

/**
 * Before a turn: the profile exists and is confined. A setup that failed, or
 * that a restart interrupted before the clone, starts again.
 */
export async function profileReady(profile: string, description: string) {
  const pending = settingUp.get(profile);
  if (pending) return pending;
  if (isDefaultProfile(profile) || (!unfinished.has(profile) && existsSync(join(profileHome(profile), "config.yaml")))) return;
  return createProfileInBackground(profile, description);
}

/* ---------- per-agent MCP ---------- */
/*
 * The (multiplex) gateway runs MCP discovery once per profile, inside that
 * profile's home: a profile only exposes the servers declared in ITS OWN
 * config.yaml, with the env variables of its own .env and the OAuth tokens of
 * its own mcp-tokens/. Enabling an MCP for an agent = copying the instance's
 * declaration there (plus the env variables it references), with the
 * profile's mcp-tokens/ pointing at the instance's (shareMcpTokens).
 */

export type McpConfig = Record<string, unknown> & { enabled?: boolean };

async function loadYaml(path: string) {
  const { parseDocument } = await import("yaml");
  const text = await readFile(path, "utf8").catch(() => "");
  return parseDocument(text);
}

async function instanceMcpServers(): Promise<Record<string, McpConfig>> {
  const doc = await loadYaml(join(env.HERMES_HOME, "config.yaml"));
  return (doc.toJS()?.mcp_servers ?? {}) as Record<string, McpConfig>;
}

export async function agentMcpServers(profile: string) {
  const instance = await instanceMcpServers();
  const own = isDefaultProfile(profile)
    ? instance
    : (((await loadYaml(join(profileHome(profile), "config.yaml"))).toJS()?.mcp_servers ?? {}) as Record<string, McpConfig>);
  return Object.entries(instance).map(([name, cfg]) => ({
    name,
    url: typeof cfg.url === "string" ? cfg.url : undefined,
    command: typeof cfg.command === "string" ? cfg.command : undefined,
    instanceEnabled: cfg.enabled !== false,
    enabled: !!own[name] && own[name]!.enabled !== false && cfg.enabled !== false,
  }));
}

export async function setAgentMcp(profile: string, server: string, enabled: boolean) {
  if (isDefaultProfile(profile)) {
    throw new HermesError(tr(messages).defaultProfileMcp, 400);
  }
  const instance = await instanceMcpServers();
  const cfg = instance[server];
  if (!cfg) throw new HermesError(tr(errors).unknownMcpServer, 404);

  const path = join(profileHome(profile), "config.yaml");
  const doc = await loadYaml(path);
  if (enabled) doc.setIn(["mcp_servers", server], doc.createNode({ ...cfg, enabled: true }));
  else doc.deleteIn(["mcp_servers", server]);
  await writeFile(path, doc.toString());

  if (enabled) {
    await copyReferencedEnv(JSON.stringify(cfg), profile);
    await shareMcpTokens(profile);
  }
}

/**
 * OAuth is authorized once, from the dashboard, which stores the tokens in the
 * instance's mcp-tokens/. A profile's discovery only reads its own: without
 * this link, an OAuth server enabled for an agent stays parked ("hermes mcp
 * login") and the agent never gets its tools. A directory link rather than
 * copies: Hermes rewrites a token file atomically on refresh, and a rotated
 * refresh token would invalidate every other copy. True when the link was just made.
 */
export async function shareMcpTokens(profile: string) {
  if (isDefaultProfile(profile) || !env.HERMES_HOME) return false;
  const shared = join(env.HERMES_HOME, "mcp-tokens");
  const link = join(profileHome(profile), "mcp-tokens");
  const target = relative(dirname(link), shared);
  const current = await lstat(link).catch(() => null);
  if (current?.isSymbolicLink() && (await readlink(link)) === target) return false;
  await mkdir(shared, { recursive: true, mode: 0o700 });
  if (current?.isDirectory()) {
    // Tokens from a login run in the profile itself: kept unless the instance already has that server's.
    for (const file of await readdir(link)) {
      if (!existsSync(join(shared, file))) await rename(join(link, file), join(shared, file));
    }
  }
  if (current) await rm(link, { recursive: true, force: true });
  await symlink(target, link);
  return true;
}

/** At startup: every agent's profile shares the instance's OAuth tokens. */
export async function shareMcpTokensWithAll() {
  if (!env.HERMES_HOME) return;
  const names = await readdir(join(env.HERMES_HOME, "profiles")).catch(() => [] as string[]);
  let linked = false;
  for (const p of names) {
    if (!existsSync(join(env.HERMES_HOME, "profiles", p, "config.yaml"))) continue;
    try {
      linked = (await shareMcpTokens(p)) || linked;
    } catch (err) {
      console.error(`mcp tokens: ${p}`, err);
    }
  }
  // Discovery only runs when the gateway starts: parked servers need a restart to connect.
  if (linked) await restartGateway().catch((err) => console.error("mcp tokens: gateway restart", err));
}

/**
 * OAuth redirect URI for an instance server. The dashboard only listens
 * locally: the provider therefore sends the browser back to the app, which relays.
 */
export async function setMcpRedirectUri(server: string, redirectUri: string) {
  await setMcpOAuth(server, { redirect_uri: redirectUri });
}

/**
 * `oauth:` block of an instance server (Hermes tools/mcp_oauth.py): redirect URI, and a
 * pre-registered client for providers without dynamic registration. Values may be
 * `${VAR}` references to Hermes's .env, which Hermes resolves before connecting.
 */
export async function setMcpOAuth(server: string, fields: Record<string, string | undefined>) {
  const path = join(env.HERMES_HOME, "config.yaml");
  const doc = await loadYaml(path);
  if (!doc.hasIn(["mcp_servers", server])) throw new HermesError(tr(errors).unknownMcpServer, 404);
  for (const [key, value] of Object.entries(fields)) {
    if (value) doc.setIn(["mcp_servers", server, "oauth", key], value);
    else doc.deleteIn(["mcp_servers", server, "oauth", key]);
  }
  await writeFile(path, doc.toString());
}

/**
 * Copies the ${VAR} variables used by the declaration into the profile's .env.
 * `overwrite`: the instance's value replaces the profile's (a rotated secret).
 */
async function copyReferencedEnv(serialized: string, profile: string, { overwrite = false } = {}) {
  const names = new Set([...serialized.matchAll(/\$\{([A-Z][A-Z0-9_]*)\}/g)].map((m) => m[1]!));
  if (!names.size) return;
  const source = await readFile(join(env.HERMES_HOME, ".env"), "utf8").catch(() => "");
  const target = join(profileHome(profile), ".env");
  const current = await readFile(target, "utf8").catch(() => "");
  const lines = source.split("\n").filter((l) => names.has(l.split("=")[0]!));
  const replaced = new Set(overwrite ? lines.map((l) => l.split("=")[0]!) : []);
  const kept = current.split("\n").filter((l) => l && !replaced.has(l.split("=")[0]!));
  const present = new Set(kept.map((l) => l.split("=")[0]));
  const additions = lines.filter((l) => !present.has(l.split("=")[0]!));
  if (!additions.length) return;
  await writeFile(target, `${[...kept, ...additions].join("\n")}\n`, { mode: 0o600 });
}

/**
 * A reconfigured server: every agent that had it gets the new declaration and
 * its new secrets, keeping its own on/off. Without this an agent keeps the
 * copy made when it was enabled, old key included.
 */
export async function refreshAgentMcp(server: string) {
  const cfg = (await instanceMcpServers())[server];
  if (!cfg) return;
  const profiles = await readdir(join(env.HERMES_HOME, "profiles")).catch(() => [] as string[]);
  for (const profile of profiles) {
    const path = join(profileHome(profile), "config.yaml");
    if (!existsSync(path)) continue;
    const doc = await loadYaml(path);
    const own = doc.getIn(["mcp_servers", server, "enabled"]);
    if (!doc.hasIn(["mcp_servers", server])) continue;
    doc.setIn(["mcp_servers", server], doc.createNode({ ...cfg, enabled: own !== false }));
    await writeFile(path, doc.toString());
    await copyReferencedEnv(JSON.stringify(cfg), profile, { overwrite: true });
  }
}

/** A server's declaration and the .env values it references, to put back if a reconfiguration fails. */
export type McpSnapshot = { cfg: McpConfig; env: Record<string, string> };

export async function snapshotMcpServer(server: string): Promise<McpSnapshot | null> {
  const cfg = (await instanceMcpServers())[server];
  if (!cfg) return null;
  const names = new Set([...JSON.stringify(cfg).matchAll(/\$\{([A-Z][A-Z0-9_]*)\}/g)].map((m) => m[1]!));
  const values: Record<string, string> = {};
  for (const key of names) {
    const res = await dashboard<{ value: string }>("/api/env/reveal", { method: "POST", body: JSON.stringify({ key }) }).catch(() => null);
    if (res) values[key] = res.value;
  }
  return { cfg, env: values };
}

export async function restoreMcpServer(server: string, snapshot: McpSnapshot) {
  for (const [key, value] of Object.entries(snapshot.env)) {
    await dashboard("/api/env", { method: "PUT", body: JSON.stringify({ key, value }) });
  }
  const path = join(env.HERMES_HOME, "config.yaml");
  const doc = await loadYaml(path);
  doc.setIn(["mcp_servers", server], doc.createNode(snapshot.cfg));
  await writeFile(path, doc.toString());
}

/** After a new declaration: the admin's on/off and tool selection of the previous one still apply. */
export async function carryMcpSettings(server: string, previous: McpConfig) {
  if (previous.enabled !== false && previous.tools === undefined) return;
  const path = join(env.HERMES_HOME, "config.yaml");
  const doc = await loadYaml(path);
  if (!doc.hasIn(["mcp_servers", server])) return;
  if (previous.enabled === false) doc.setIn(["mcp_servers", server, "enabled"], false);
  if (previous.tools !== undefined) doc.setIn(["mcp_servers", server, "tools"], doc.createNode(previous.tools));
  await writeFile(path, doc.toString());
}

/**
 * Hermes instance settings the app expects, applied at startup (idempotent):
 * a single gateway serves every profile, declared explicitly for Hermes 9.x.
 */
export async function ensureHermesInstance() {
  if (!env.HERMES_HOME) return;
  const config = await readFile(join(env.HERMES_HOME, "config.yaml"), "utf8").catch(() => "");
  if (/^\s*multiplex_profiles:\s*true/m.test(config)) return;
  await hermesCli(["config", "set", "gateway.multiplex_profiles", "true"]);
}
