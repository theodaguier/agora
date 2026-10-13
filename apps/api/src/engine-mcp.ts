import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { env } from "./env";
import { enabledMcpConfigs, type McpConfig } from "./hermes-admin";
import { gatewayUrl, grantMcp } from "./mcp-gateway";
import { parseEnv } from "./vault";

/**
 * A bot's MCP connectors on the engines that aren't Hermes (Claude Code, Codex, Cursor).
 *
 * The connectors stay Hermes's: installed once on the instance, enabled per agent, their secrets in
 * its .env and their OAuth tokens in its mcp-tokens/. An engine run gets the servers enabled for
 * the bot, served by the MCP gateway (mcp-gateway.ts) under a token valid for that run only: the
 * engine sees local addresses, never a secret. A connection is made once, in Agora, and every bot
 * that has it enabled gets it, whatever its engine.
 */

export type EngineMcpServer = {
  name: string;
  /** Local server. */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  /** Remote server. */
  url?: string;
  sse?: boolean;
  headers?: Record<string, string>;
  /** Remote server authorized with OAuth: its `oauth:` block (pre-registered client, redirect URI). */
  oauth?: Record<string, unknown>;
  /** Hermes's tool selection (`tools.include` / `tools.exclude`): exact names or fnmatch globs. */
  include?: string[];
  exclude?: string[];
};

export type EngineMcp = { profile: string; servers: EngineMcpServer[] };

export const noMcp = (profile = "default"): EngineMcp => ({ profile, servers: [] });

const VAR = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

const names = (value: unknown) =>
  typeof value === "string" ? [value] : Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : undefined;

const strings = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).filter((e): e is [string, string] => typeof e[1] === "string" || typeof e[1] === "number").map(([k, v]) => [k, String(v)]))
    : {};

/** One Hermes declaration, its `${VAR}` resolved; null when it declares no server or a variable is missing. */
export function toEngineServer(name: string, cfg: McpConfig, vars: Map<string, string>): EngineMcpServer | null {
  const missing = new Set<string>();
  const resolve = (s: string) =>
    s.replace(VAR, (_, key: string) => {
      const value = vars.get(key);
      if (value === undefined) missing.add(key);
      return value ?? "";
    });
  const resolveAll = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, resolve(v)]));
  const tools = (cfg.tools ?? {}) as Record<string, unknown>;
  const filter = { include: names(tools.include), exclude: names(tools.exclude) };
  let server: EngineMcpServer;
  if (typeof cfg.url === "string") {
    server = {
      name,
      url: resolve(cfg.url),
      sse: cfg.transport === "sse",
      headers: resolveAll(strings(cfg.headers)),
      ...(cfg.auth === "oauth" && { oauth: resolveAll(strings(cfg.oauth)) }),
      ...filter,
    };
  } else if (typeof cfg.command === "string") {
    server = { name, command: resolve(cfg.command), args: (names(cfg.args) ?? []).map(resolve), env: resolveAll(strings(cfg.env)), ...filter };
  } else {
    return null;
  }
  if (missing.size) {
    console.error(`engine mcp: ${name} left out, missing ${[...missing].join(", ")}`);
    return null;
  }
  return server;
}

/** The servers enabled for the agent, as its gateway runs them. */
export async function engineMcp(profile: string): Promise<EngineMcp> {
  const { servers, envFiles } = await enabledMcpConfigs(profile);
  const vars = new Map<string, string>();
  for (const file of envFiles) {
    for (const e of parseEnv(await readFile(file, "utf8").catch(() => "")).entries) vars.set(e.key, e.value);
  }
  return { profile, servers: servers.map(([name, cfg]) => toEngineServer(name, cfg, vars)).filter((s): s is EngineMcpServer => !!s) };
}

/** Same as engineMcp, but a broken Hermes config only costs the connectors, never the turn. */
export const engineMcpOrNone = (profile: string) =>
  engineMcp(profile).catch((err) => {
    console.error(`engine mcp: ${profile}`, err);
    return noMcp(profile);
  });

/* ---------- Claude Code ---------- */

/** Next to the attachments: config files carrying a run's gateway token. */
const configDir = () => join(env.HERMES_HOME || join(homedir(), ".agora"), "agora-mcp");
let swept = false;

export function claudeMcpServers(mcp: EngineMcp, token: string) {
  return Object.fromEntries(mcp.servers.map((s) => [s.name, { type: "http", url: gatewayUrl(s.name), headers: { Authorization: `Bearer ${token}` } }]));
}

/**
 * `--mcp-config` for a Claude Code run, in a file only the API reads (in the arguments, the token
 * would show in the process list), and the connectors' tools allowed (`-p` refuses the others; the
 * gateway applies Hermes's selection). `dispose`, once the process has exited, ends the grant.
 */
export async function claudeMcpConfig(mcp: EngineMcp, extra: Record<string, unknown> = {}) {
  const allowed = mcp.servers.map((s) => `mcp__${s.name}`);
  if (!mcp.servers.length && !Object.keys(extra).length) return { args: [] as string[], allowed, dispose: async () => {} };
  const grant = mcp.servers.length ? grantMcp(mcp.profile, mcp.servers) : null;
  const dir = configDir();
  // Files a crashed run left behind.
  if (!swept) {
    swept = true;
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, `${crypto.randomUUID()}.json`);
  await writeFile(path, JSON.stringify({ mcpServers: { ...(grant && claudeMcpServers(mcp, grant.token)), ...extra } }), { mode: 0o600 });
  return {
    args: ["--mcp-config", path],
    allowed,
    dispose: async () => {
      await rm(path, { force: true }).catch(() => {});
      await grant?.revoke();
    },
  };
}

/* ---------- Codex ---------- */

const TOKEN_VAR = "AGORA_MCP_TOKEN";

/**
 * `-c mcp_servers.*` overrides for a Codex run, the gateway token in its environment
 * (`bearer_token_env_var`), never in its arguments. `dispose` ends the grant.
 */
export function codexMcpArgs(mcp: EngineMcp) {
  if (!mcp.servers.length) return { args: [] as string[], env: {} as Record<string, string>, dispose: async () => {} };
  const grant = grantMcp(mcp.profile, mcp.servers);
  const args = mcp.servers.flatMap((s) => {
    const key = `mcp_servers.${s.name}`;
    return [
      "-c", `${key}.url=${JSON.stringify(gatewayUrl(s.name))}`,
      "-c", `${key}.bearer_token_env_var="${TOKEN_VAR}"`,
      // Nobody is there to approve a call: the admin's choice of connector is the approval.
      "-c", `${key}.default_tools_approval_mode="approve"`,
      // A local server's first start can download its package.
      "-c", `${key}.startup_timeout_sec=120`,
    ];
  });
  return { args, env: { [TOKEN_VAR]: grant.token }, dispose: grant.revoke };
}

/* ---------- Cursor ---------- */

/**
 * Cursor reads its MCP servers from the workspace's `.cursor/mcp.json`: the connectors are added
 * to it for the run (`--approve-mcps`: nobody is there to approve them), and the file is put back
 * as it was afterwards. The token stays in Cursor's environment (`${env:…}` in the header). A file
 * the repository tracks is left alone, an untracked one is excluded from git.
 */
export async function cursorMcpConfig(mcp: EngineMcp, cwd: string, untracked: (file: string) => Promise<boolean>) {
  const none = { args: [] as string[], env: {} as Record<string, string>, dispose: async () => {} };
  if (!mcp.servers.length) return none;
  const path = join(cwd, ".cursor", "mcp.json");
  if (!(await untracked(".cursor/mcp.json"))) {
    console.error("engine mcp: .cursor/mcp.json is tracked in the repository, no connectors for Cursor");
    return none;
  }
  const original = await readFile(path, "utf8").catch(() => null);
  let current: Json = {};
  try {
    current = original ? JSON.parse(original) : {};
  } catch {
    console.error("engine mcp: .cursor/mcp.json is not valid JSON, no connectors for Cursor");
    return none;
  }
  const grant = grantMcp(mcp.profile, mcp.servers);
  const added = Object.fromEntries(mcp.servers.map((s) => [s.name, { url: gatewayUrl(s.name), headers: { Authorization: `Bearer \${env:${TOKEN_VAR}}` } }]));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({ ...current, mcpServers: { ...(current.mcpServers ?? {}), ...added } }, null, 2), { mode: 0o600 });
  return {
    args: ["--approve-mcps"],
    env: { [TOKEN_VAR]: grant.token },
    dispose: async () => {
      if (original === null) await rm(path, { force: true }).catch(() => {});
      else await writeFile(path, original).catch(() => {});
      await grant.revoke();
    },
  };
}

type Json = Record<string, any>;

/* ---------- what the bot is told ---------- */

/** The connectors section of the bot's context on an engine other than Hermes. */
export function engineConnectorsLines(engine: "claude-code" | "codex", mcp: EngineMcp) {
  const name = engine === "codex" ? "Codex" : "Claude Code";
  if (!mcp.servers.length) return [`Tu tournes sur le moteur ${name}. Aucun connecteur n'est activé pour toi.`];
  const tools = (server: string) => (engine === "codex" ? "ses outils" : `outils \`mcp__${server}__*\``);
  return [`Tu tournes sur le moteur ${name}. Connecteurs activés pour toi : ${mcp.servers.map((s) => `\`${s.name}\` (${tools(s.name)})`).join(", ")}.`];
}
