import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import type { EngineMcpServer } from "./engine-mcp";
import { env } from "./env";
import { grantMcp, internalMcp, toolAllowed } from "./mcp-gateway";

// A scratch instance: local servers run in the profile's home.
const home = mkdtempSync(join(tmpdir(), "agora-mcp-gateway-"));
const realHome = env.HERMES_HOME;
env.HERMES_HOME = home;

/** A server with three tools, each answering with its name and what the server received. */
function demoServer(seen: () => string) {
  const server = new McpServer({ name: "demo", version: "1" });
  for (const tool of ["read_page", "delete_page", "ping"]) {
    server.registerTool(tool, { description: tool }, async () => ({ content: [{ type: "text", text: `${tool} ${seen()}` }] }));
  }
  return server;
}

const STDIO_SERVER = String.raw`
const { McpServer } = await import(process.env.SDK + "/server/mcp.js");
const { StdioServerTransport } = await import(process.env.SDK + "/server/stdio.js");
const server = new McpServer({ name: "local", version: "1" });
server.registerTool("whoami", { description: "env check" }, async () => ({ content: [{ type: "text", text: "secret=" + process.env.LOCAL_SECRET + " cwd=" + process.cwd() }] }));
server.registerTool("drop_all", { description: "excluded" }, async () => ({ content: [{ type: "text", text: "dropped" }] }));
await server.connect(new StdioServerTransport());
`;

let http: ReturnType<typeof Bun.serve>;
let sse: HttpServer;
let gateway: ReturnType<typeof Bun.serve>;
let lastAuth = "";

beforeAll(async () => {
  // Remote streamable-HTTP server that wants a Bearer token.
  http = Bun.serve({
    port: 0,
    async fetch(req) {
      lastAuth = req.headers.get("authorization") ?? "";
      if (lastAuth !== "Bearer remote-secret") return new Response("unauthorized", { status: 401 });
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      await demoServer(() => lastAuth).connect(transport);
      return transport.handleRequest(req);
    },
  });
  // Legacy SSE server.
  const transports = new Map<string, SSEServerTransport>();
  sse = createServer(async (req, res) => {
    const url = new URL(req.url!, "http://x");
    if (req.method === "GET" && url.pathname === "/sse") {
      const transport = new SSEServerTransport("/messages", res);
      transports.set(transport.sessionId, transport);
      await demoServer(() => "over sse").connect(transport);
    } else if (req.method === "POST" && url.pathname === "/messages") {
      await transports.get(url.searchParams.get("sessionId") ?? "")?.handlePostMessage(req, res);
    } else {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => sse.listen(0, "127.0.0.1", resolve));
  gateway = Bun.serve({ port: 0, fetch: new Hono().route("/api/internal/mcp", internalMcp).fetch, idleTimeout: 60 });
});

afterAll(() => {
  http.stop(true);
  sse.close();
  gateway.stop(true);
  env.HERMES_HOME = realHome;
});

const sdk = join(import.meta.dir, "..", "node_modules", "@modelcontextprotocol", "sdk", "dist", "esm");

function servers(): EngineMcpServer[] {
  const dir = mkdtempSync(join(tmpdir(), "agora-local-mcp-"));
  writeFileSync(join(dir, "server.mjs"), STDIO_SERVER);
  return [
    { name: "local", command: process.execPath, args: [join(dir, "server.mjs")], env: { LOCAL_SECRET: "s3cret", SDK: sdk }, exclude: ["drop_*"] },
    { name: "remote", url: `http://127.0.0.1:${http.port}/mcp`, headers: { Authorization: "Bearer remote-secret" }, include: ["read_page", "ping"] },
    { name: "legacy", url: `http://127.0.0.1:${(sse.address() as AddressInfo).port}/sse`, sse: true },
  ];
}

/** An engine's side: an MCP client on the gateway, with the run's token. */
async function connect(name: string, token: string) {
  const client = new Client({ name: "engine", version: "1" });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${gateway.port}/api/internal/mcp/${name}`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return client;
}

const text = (result: any) => result.content?.[0]?.text as string;

describe("MCP gateway", () => {
  test("serves a local server with its declared environment, in the profile's home", async () => {
    const grant = grantMcp("default", servers());
    const client = await connect("local", grant.token);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(["whoami"]);
    const out = text(await client.callTool({ name: "whoami", arguments: {} }));
    expect(out).toContain("secret=s3cret");
    expect(out).toContain(`cwd=${realpathSync(home)}`);
    // Left out by Hermes's selection: refused even when called by name.
    await expect(client.callTool({ name: "drop_all", arguments: {} })).rejects.toThrow(/Unknown tool/);
    await client.close();
    await grant.revoke();
  });

  test("serves a remote server with its headers, and only the selected tools", async () => {
    const grant = grantMcp("default", servers());
    const client = await connect("remote", grant.token);
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual(["read_page", "ping"]);
    expect(text(await client.callTool({ name: "read_page", arguments: {} }))).toBe("read_page Bearer remote-secret");
    await client.close();
    await grant.revoke();
  });

  test("serves an SSE server over streamable HTTP", async () => {
    const grant = grantMcp("default", servers());
    const client = await connect("legacy", grant.token);
    expect(text(await client.callTool({ name: "ping", arguments: {} }))).toBe("ping over sse");
    await client.close();
    await grant.revoke();
  });

  test("refuses another token, a revoked grant and a server it doesn't hold", async () => {
    const grant = grantMcp("default", servers());
    await expect(connect("local", "nope")).rejects.toThrow();
    await expect(connect("unknown", grant.token)).rejects.toThrow();
    const client = await connect("remote", grant.token);
    await grant.revoke();
    await expect(client.listTools()).rejects.toThrow();
    await expect(connect("remote", grant.token)).rejects.toThrow();
  });

  test("refuses what came through the proxy", async () => {
    const grant = grantMcp("default", servers());
    const res = await fetch(`http://127.0.0.1:${gateway.port}/api/internal/mcp/local`, {
      method: "POST",
      headers: { Authorization: `Bearer ${grant.token}`, "X-Forwarded-For": "1.2.3.4", "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
    });
    expect(res.status).toBe(403);
    await grant.revoke();
  });

  test("tells why a server can't start", async () => {
    const grant = grantMcp("default", [{ name: "broken", command: "/nonexistent/bin" }]);
    await expect(connect("broken", grant.token)).rejects.toThrow(/broken/);
    await grant.revoke();
  });
});

describe("toolAllowed", () => {
  test("matches Hermes's include and exclude globs", () => {
    expect(toolAllowed({ include: ["read_*"] }, "read_page")).toBe(true);
    expect(toolAllowed({ include: ["read_*"] }, "delete_page")).toBe(false);
    expect(toolAllowed({ include: [] }, "read_page")).toBe(false);
    expect(toolAllowed({ exclude: ["delete_?age"] }, "delete_page")).toBe(false);
    expect(toolAllowed({ exclude: ["a.b"] }, "aXb")).toBe(true);
    expect(toolAllowed({}, "anything")).toBe(true);
  });
});
