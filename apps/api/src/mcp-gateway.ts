import { randomBytes } from "node:crypto";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { FetchLike, Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { Hono } from "hono";
import type { EngineMcpServer } from "./engine-mcp";
import { env } from "./env";
import { profileHome } from "./hermes";
import { oauthAccessToken } from "./mcp-oauth-token";

/**
 * MCP gateway: the bots' connectors, served to the engines that aren't Hermes (Claude Code, Codex,
 * Cursor) on 127.0.0.1.
 *
 * An engine run receives a grant (a token and the connectors enabled for its bot) and, for each
 * connector, a local streamable-HTTP address. The gateway relays its JSON-RPC to the real server,
 * which it reaches the way Hermes declares it: a local command, a remote server with its headers,
 * or with the instance's OAuth token (mcp-oauth-token.ts). So the engines never hold a secret, every
 * transport works on every engine, and Hermes's tool selection applies on all of them.
 *
 * One upstream connection per MCP session the engine opens, closed with it or with the grant at the
 * end of the run (a warm code session keeps its connectors as long as its process).
 */

type Json = Record<string, any>;
type Id = string | number;

type Grant = { profile: string; servers: Map<string, EngineMcpServer>; sessions: Set<string> };

type Session = {
  id: string;
  token: string;
  server: EngineMcpServer;
  upstream: Transport;
  pending: Map<Id, (msg: JSONRPCMessage) => void>;
  /** The engine's open response streams: notifications from the server go to them. */
  streams: Set<(msg: JSONRPCMessage) => void>;
  closed: boolean;
  /** Last lines a local server wrote on stderr, for its errors. */
  stderr: string;
};

const grants = new Map<string, Grant>();
const sessions = new Map<string, Session>();

export const gatewayUrl = (server: string) => `http://127.0.0.1:${env.PORT}/api/internal/mcp/${encodeURIComponent(server)}`;

/** Gives an engine run its connectors until `revoke`. */
export function grantMcp(profile: string, servers: EngineMcpServer[]) {
  const token = randomBytes(32).toString("hex");
  grants.set(token, { profile, servers: new Map(servers.map((s) => [s.name, s])), sessions: new Set() });
  return {
    token,
    revoke: async () => {
      const grant = grants.get(token);
      grants.delete(token);
      await Promise.all([...(grant?.sessions ?? [])].map((id) => closeSession(id)));
    },
  };
}

async function closeSession(id: string) {
  const s = sessions.get(id);
  if (!s) return;
  sessions.delete(id);
  grants.get(s.token)?.sessions.delete(id);
  s.closed = true;
  for (const [rid, resolve] of s.pending) resolve(rpcError(rid, -32000, "Connector session closed"));
  s.pending.clear();
  if (s.upstream instanceof StreamableHTTPClientTransport) await s.upstream.terminateSession().catch(() => {});
  await s.upstream.close().catch(() => {});
}

const rpcError = (id: Id, code: number, message: string): JSONRPCMessage => ({ jsonrpc: "2.0", id, error: { code, message } }) as JSONRPCMessage;

/* ---------- Hermes's tool selection ---------- */

/** fnmatch, as Hermes matches `tools.include` / `tools.exclude` entries. */
const globRegex = (glob: string) =>
  new RegExp(
    `^${glob
      .split("")
      .map((c) => (c === "*" ? ".*" : c === "?" ? "." : /[\\^$.|+(){}]/.test(c) ? `\\${c}` : c))
      .join("")}$`,
  );

export function toolAllowed(server: Pick<EngineMcpServer, "include" | "exclude">, tool: string) {
  const match = (list: string[]) => list.some((g) => globRegex(g).test(tool));
  if (server.include) return match(server.include);
  return !server.exclude?.length || !match(server.exclude);
}

/* ---------- upstream ---------- */

/** Every request to the server carries its headers, and the OAuth token, renewed once if refused. */
function serverFetch(s: EngineMcpServer): FetchLike {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    for (const [k, v] of Object.entries(s.headers ?? {})) headers.set(k, v);
    if (!s.oauth) return fetch(input, { ...init, headers });
    let token = await oauthAccessToken(s.name, s.url!, s.oauth);
    headers.set("Authorization", `Bearer ${token}`);
    const res = await fetch(input, { ...init, headers });
    if (res.status !== 401) return res;
    token = await oauthAccessToken(s.name, s.url!, s.oauth, token);
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };
}

function upstreamOf(s: EngineMcpServer, profile: string): Transport {
  if (s.command) {
    return new StdioClientTransport({
      command: s.command,
      args: s.args ?? [],
      // Its declared variables over a minimal environment (PATH, HOME…), never the API's.
      env: s.env,
      // Where Hermes runs it: its profile's home.
      cwd: env.HERMES_HOME ? profileHome(profile) : undefined,
      stderr: "pipe",
    });
  }
  const url = new URL(s.url!);
  return s.sse ? new SSEClientTransport(url, { fetch: serverFetch(s) }) : new StreamableHTTPClientTransport(url, { fetch: serverFetch(s) });
}

async function openSession(token: string, grant: Grant, server: EngineMcpServer): Promise<Session> {
  const upstream = upstreamOf(server, grant.profile);
  const s: Session = {
    id: crypto.randomUUID(),
    token,
    server,
    upstream,
    pending: new Map(),
    streams: new Set(),
    closed: false,
    stderr: "",
  };
  if (upstream instanceof StdioClientTransport) {
    upstream.stderr?.on("data", (chunk: Buffer) => {
      s.stderr = (s.stderr + chunk.toString()).slice(-2000);
    });
  }
  upstream.onmessage = (msg: Json) => {
    if ("id" in msg && msg.id !== null && ("result" in msg || "error" in msg)) {
      const resolve = s.pending.get(msg.id);
      s.pending.delete(msg.id);
      resolve?.(msg as JSONRPCMessage);
      return;
    }
    // The server asks something of the client: only a ping is answered, nothing else is relayed.
    if ("id" in msg && "method" in msg) {
      const reply = msg.method === "ping" ? { jsonrpc: "2.0", id: msg.id, result: {} } : rpcError(msg.id, -32601, `${msg.method} is not available through Agora`);
      void upstream.send(reply as JSONRPCMessage).catch(() => {});
      return;
    }
    for (const write of s.streams) write(msg as JSONRPCMessage);
  };
  upstream.onclose = () => {
    if (s.closed) return;
    const why = s.stderr.trim().split("\n").at(-1);
    for (const [rid, resolve] of s.pending) resolve(rpcError(rid, -32000, `Connector ${server.name} stopped${why ? `: ${why}` : ""}`));
    s.pending.clear();
    void closeSession(s.id);
  };
  upstream.onerror = (err) => {
    if (!s.closed) console.error(`mcp gateway: ${server.name}`, err.message);
  };
  await upstream.start();
  sessions.set(s.id, s);
  grant.sessions.add(s.id);
  return s;
}

/** One request relayed, its answer back: refused here when Hermes's selection leaves the tool out. */
async function relay(s: Session, msg: Json): Promise<JSONRPCMessage> {
  if (msg.method === "tools/call" && !toolAllowed(s.server, String(msg.params?.name ?? ""))) {
    return rpcError(msg.id, -32602, `Unknown tool: ${msg.params?.name}`);
  }
  if (s.closed) return rpcError(msg.id, -32000, "Connector session closed");
  const answer = await new Promise<JSONRPCMessage>((resolve) => {
    s.pending.set(msg.id, resolve);
    s.upstream.send(msg as JSONRPCMessage).catch((err: Error) => {
      s.pending.delete(msg.id);
      resolve(rpcError(msg.id, -32000, `Connector ${s.server.name}: ${err.message}`));
    });
  });
  const result = (answer as Json).result;
  if (msg.method === "tools/list" && Array.isArray(result?.tools)) {
    return { ...answer, result: { ...result, tools: result.tools.filter((t: Json) => toolAllowed(s.server, String(t.name))) } } as JSONRPCMessage;
  }
  if (msg.method === "initialize" && result?.protocolVersion) s.upstream.setProtocolVersion?.(String(result.protocolVersion));
  return answer;
}

/* ---------- the engines' side: streamable HTTP ---------- */

const isRequest = (m: Json) => typeof m.method === "string" && "id" in m && m.id !== null;

/** Answers as an event stream: kept alive while a long tool call runs, notifications included. */
function respond(s: Session, requests: Json[]) {
  const encoder = new TextEncoder();
  let open = true;
  let ping: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (text: string) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          open = false;
        }
      };
      const write = (m: JSONRPCMessage) => send(`event: message\ndata: ${JSON.stringify(m)}\n\n`);
      ping = setInterval(() => send(": ping\n\n"), 20_000);
      s.streams.add(write);
      try {
        await Promise.all(requests.map(async (r) => write(await relay(s, r))));
      } finally {
        clearInterval(ping);
        s.streams.delete(write);
        if (open) controller.close();
        open = false;
      }
    },
    cancel() {
      open = false;
      clearInterval(ping);
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Mcp-Session-Id": s.id } });
}

const bearer = (header: string | undefined) => (header?.startsWith("Bearer ") ? header.slice(7) : "");

export const internalMcp = new Hono<{ Variables: { grant: Grant; token: string } }>()
  .use(async (c, next) => {
    // Only the engines on this machine: nothing that came through the proxy, and a live grant.
    const token = bearer(c.req.header("authorization"));
    const grant = token ? grants.get(token) : undefined;
    if (c.req.header("x-forwarded-for") || !grant) return c.json({ error: "forbidden" }, 403);
    c.set("grant", grant);
    c.set("token", token);
    await next();
  })
  .post("/:server", async (c) => {
    const grant = c.get("grant");
    const server = grant.servers.get(c.req.param("server"));
    if (!server) return c.json({ error: "unknown_server" }, 404);
    const body = await c.req.json().catch(() => null);
    const messages: Json[] = (Array.isArray(body) ? body : [body]).filter((m) => m && typeof m === "object");
    if (!messages.length) return c.json(rpcError(null as never, -32700, "Parse error"), 400);

    let s: Session | undefined;
    const sid = c.req.header("mcp-session-id");
    if (messages.some((m) => m.method === "initialize")) {
      try {
        s = await openSession(c.get("token"), grant, server);
      } catch (err) {
        const init = messages.find((m) => m.method === "initialize")!;
        console.error(`mcp gateway: ${server.name} start`, (err as Error).message);
        return c.json(rpcError(init.id, -32000, `Connector ${server.name} unavailable: ${(err as Error).message}`), 200);
      }
    } else {
      s = sid ? sessions.get(sid) : undefined;
      // Unknown or closed session: the engine opens a new one (streamable HTTP).
      if (!s || s.token !== c.get("token") || s.server !== server) return c.json({ error: "session_not_found" }, sid ? 404 : 400);
    }
    const requests = messages.filter(isRequest);
    for (const m of messages.filter((m) => !isRequest(m))) {
      await s.upstream.send(m as JSONRPCMessage).catch((err: Error) => console.error(`mcp gateway: ${server.name}`, err.message));
    }
    if (!requests.length) return c.body(null, 202, { "Mcp-Session-Id": s.id });
    return respond(s, requests);
  })
  // No stream opened by the server: everything comes back on the answers.
  .get("/:server", (c) => c.body(null, 405, { Allow: "POST, DELETE" }))
  .delete("/:server", async (c) => {
    const s = sessions.get(c.req.header("mcp-session-id") ?? "");
    if (s && s.token === c.get("token")) await closeSession(s.id);
    return c.body(null, 200);
  });
