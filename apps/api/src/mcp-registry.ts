/**
 * Official MCP registry (registry.modelcontextprotocol.io): search, and translation
 * of an entry into a Hermes custom MCP server. Hermes only accepts a URL (no auth,
 * Bearer token or OAuth) or a stdio command: entries that require anything else
 * (arbitrary headers, Docker image, mandatory arguments) are not offered.
 */

import { defineMessages, tr } from "./i18n";

const messages = defineMessages({
  en: {
    notInstallable: "This server can't be installed in Hermes.",
    accessTokenRequired: "Access token required.",
    requiredVariables: (names: string) => `Required variables: ${names}`,
  },
  fr: {
    notInstallable: "Ce serveur ne peut pas être installé dans Hermes.",
    accessTokenRequired: "Jeton d'accès requis.",
    requiredVariables: (names: string) => `Variables requises : ${names}`,
  },
});

const BASE = "https://registry.modelcontextprotocol.io/v0";

type Input = { name: string; description?: string; isRequired?: boolean; isSecret?: boolean; value?: string; default?: string };
type Remote = { type: string; url: string; headers?: Input[] };
type Package = {
  registryType: string;
  identifier: string;
  version?: string;
  transport?: { type: string };
  environmentVariables?: Input[];
  packageArguments?: Input[];
  runtimeArguments?: Input[];
};
type Server = {
  name: string;
  title?: string;
  description?: string;
  version?: string;
  websiteUrl?: string;
  repository?: { url?: string };
  remotes?: Remote[];
  packages?: Package[];
};

export type RegistryEnv = { name: string; description?: string; required: boolean; secret: boolean };

/** What Hermes will receive, recomputed server-side at install time: never supplied by the client. */
type Plan =
  | { kind: "remote"; url: string; bearer: boolean }
  | { kind: "stdio"; command: string; args: string[]; env: RegistryEnv[] };

export type RegistryServer = {
  id: string;
  name: string;
  hermesName: string;
  description: string;
  url?: string;
  /** Publisher with a verified domain (com.notion/…), as opposed to io.github.<account>/…. */
  verified: boolean;
  transport: "remote" | "stdio";
  bearer: boolean;
  env: RegistryEnv[];
  command?: string;
};

const hasTemplate = (s: string) => /\{[^}]+\}/.test(s);

function plan(s: Server): Plan | null {
  for (const r of s.remotes ?? []) {
    if (!["streamable-http", "sse"].includes(r.type) || hasTemplate(r.url)) continue;
    const required = (r.headers ?? []).filter((h) => h.isRequired || h.isSecret);
    const bearer = required.find((h) => h.name.toLowerCase() === "authorization" && /^bearer\s/i.test(h.value ?? "Bearer "));
    if (required.some((h) => h !== bearer)) continue;
    return { kind: "remote", url: r.url, bearer: !!bearer };
  }
  for (const p of s.packages ?? []) {
    if ((p.transport?.type ?? "stdio") !== "stdio") continue;
    if ([...(p.packageArguments ?? []), ...(p.runtimeArguments ?? [])].some((a) => a.isRequired && !a.value && !a.default)) continue;
    const version = p.version && p.version !== "latest" ? p.version : undefined;
    const env = (p.environmentVariables ?? []).map((e) => ({
      name: e.name,
      description: e.description,
      required: !!e.isRequired,
      secret: !!e.isSecret,
    }));
    if (env.some((e) => !/^[A-Z][A-Z0-9_]*$/.test(e.name))) continue;
    if (p.registryType === "npm") return { kind: "stdio", command: "npx", args: ["-y", version ? `${p.identifier}@${version}` : p.identifier], env };
    if (p.registryType === "pypi") return { kind: "stdio", command: "uvx", args: [version ? `${p.identifier}==${version}` : p.identifier], env };
  }
  return null;
}

/** Publisher: `com.notion/mcp` → notion, `io.github.octo/x` → octo. */
const publisher = (id: string) => {
  const ns = (id.split("/")[0] ?? "").split(".");
  return (ns[0] === "io" && ns[1] === "github" ? ns[2] : ns[1]) ?? ns[0] ?? "";
};

/** Server name in Hermes: last segment, or the publisher when that segment is generic (`com.notion/mcp`). */
export const hermesName = (id: string) => {
  const last = id.split("/").pop() ?? id;
  const raw = /^(mcp|server|mcp-server|remote)$/i.test(last) ? publisher(id) : last;
  return raw.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "mcp";
};

function toServer(s: Server): RegistryServer | null {
  const p = plan(s);
  if (!p) return null;
  return {
    id: s.name,
    name: s.title || hermesName(s.name),
    hermesName: hermesName(s.name),
    description: s.description ?? "",
    url: s.websiteUrl || s.repository?.url || undefined,
    verified: !s.name.startsWith("io.github.") && !s.name.startsWith("ai.smithery/"),
    transport: p.kind,
    bearer: p.kind === "remote" && p.bearer,
    env: p.kind === "stdio" ? p.env : [],
    command: p.kind === "stdio" ? [p.command, ...p.args].join(" ") : undefined,
  };
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`MCP registry ${res.status}`);
  return res.json() as Promise<T>;
}

export async function searchRegistry(q: string): Promise<RegistryServer[]> {
  const data = await get<{ servers: { server: Server }[] }>(`/servers?search=${encodeURIComponent(q)}&version=latest&limit=100`);
  // The publisher itself first (com.stripe for "stripe"), then verified domains, then remote servers.
  const needle = q.toLowerCase().replace(/[^a-z0-9]/g, "");
  const rank = (s: RegistryServer) =>
    (publisher(s.id).toLowerCase().replace(/[^a-z0-9]/g, "") === needle ? 0 : 4) + (s.verified ? 0 : 2) + (s.transport === "remote" ? 0 : 1);
  return data.servers
    // Smithery proxies require a Smithery account and key.
    .filter(({ server }) => !server.name.startsWith("ai.smithery/"))
    .map(({ server }) => toServer(server))
    .filter((s): s is RegistryServer => !!s)
    .sort((a, b) => rank(a) - rank(b));
}

/** Body for the Hermes dashboard's POST /api/mcp/servers, rebuilt from the registry. */
export async function registryInstallBody(id: string, values: { env: Record<string, string>; bearer_token?: string; oauth?: boolean }) {
  const { server } = await get<{ server: Server }>(`/servers/${encodeURIComponent(id)}/versions/latest`);
  const p = plan(server);
  if (!p) throw new Error(tr(messages).notInstallable);
  const name = hermesName(server.name);
  if (p.kind === "remote") {
    if (p.bearer && !values.bearer_token) throw new Error(tr(messages).accessTokenRequired);
    if (p.bearer) return { name, url: p.url, auth: "header", bearer_token: values.bearer_token };
    return { name, url: p.url, ...(values.oauth ? { auth: "oauth" } : {}) };
  }
  const missing = p.env.filter((e) => e.required && !values.env[e.name]);
  if (missing.length) throw new Error(tr(messages).requiredVariables(missing.map((e) => e.name).join(", ")));
  const env = Object.fromEntries(p.env.filter((e) => values.env[e.name]).map((e) => [e.name, values.env[e.name]!]));
  return { name, command: p.command, args: p.args, env };
}
