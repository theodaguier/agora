import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { env } from "./env";
import { grantMcp, internalMcp } from "./mcp-gateway";
import { hermesPython, oauthAccessToken } from "./mcp-oauth-token";

/*
 * Against Hermes's real OAuth code (its interpreter, found from HERMES_BIN): skipped where Hermes
 * isn't installed. The authorization server and the MCP server are fakes on 127.0.0.1.
 */
const python = await hermesPython().catch(() => null);
const home = mkdtempSync(join(tmpdir(), "agora-mcp-oauth-"));
const realHome = env.HERMES_HOME;

let server: ReturnType<typeof Bun.serve>;
let gateway: ReturnType<typeof Bun.serve>;
/** Refresh tokens the authorization server received, in order. */
const refreshes: string[] = [];
let valid = "";

beforeAll(() => {
  env.HERMES_HOME = home;
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/token") {
        const form = new URLSearchParams(await req.text());
        const used = form.get("refresh_token") ?? "";
        refreshes.push(used);
        const n = refreshes.length;
        // Single-use refresh tokens: an old one is refused.
        if (used !== `refresh-${n}`) return Response.json({ error: "invalid_grant" }, { status: 400 });
        valid = `access-${n + 1}`;
        return Response.json({ access_token: valid, token_type: "Bearer", expires_in: 3600, refresh_token: `refresh-${n + 1}` });
      }
      if (url.pathname === "/mcp") {
        if (req.headers.get("authorization") !== `Bearer ${valid}`) return new Response("unauthorized", { status: 401 });
        const mcp = new McpServer({ name: "oauth-demo", version: "1" });
        mcp.registerTool("whoami", { description: "token check" }, async () => ({ content: [{ type: "text", text: `ok ${valid}` }] }));
        const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
        await mcp.connect(transport);
        return transport.handleRequest(req);
      }
      return new Response("not found", { status: 404 });
    },
  });
  gateway = Bun.serve({ port: 0, fetch: new Hono().route("/api/internal/mcp", internalMcp).fetch });

  // What Hermes left after an authorization: an expired access token and its refresh token.
  const base = `http://127.0.0.1:${server.port}`;
  const tokens = join(home, "mcp-tokens");
  mkdirSync(tokens, { recursive: true });
  writeFileSync(join(tokens, "demo.json"), JSON.stringify({ access_token: "access-1", token_type: "Bearer", refresh_token: "refresh-1", expires_at: Date.now() / 1000 - 60 }));
  writeFileSync(join(tokens, "demo.client.json"), JSON.stringify({ client_id: "agora-test", redirect_uris: [`${base}/callback`], token_endpoint_auth_method: "none" }));
  writeFileSync(
    join(tokens, "demo.meta.json"),
    JSON.stringify({ issuer: base, authorization_endpoint: `${base}/authorize`, token_endpoint: `${base}/token`, response_types_supported: ["code"] }),
  );
});

afterAll(() => {
  server.stop(true);
  gateway.stop(true);
  env.HERMES_HOME = realHome;
});

const url = () => `http://127.0.0.1:${server.port}/mcp`;
const stored = () => JSON.parse(readFileSync(join(home, "mcp-tokens", "demo.json"), "utf8"));

describe.skipIf(!python)("OAuth connectors through Hermes", () => {
  test("refreshes an expired token once, under Hermes's lock, and stores the new pair for Hermes", async () => {
    expect(await oauthAccessToken("demo", url(), {})).toBe("access-2");
    expect(refreshes).toEqual(["refresh-1"]);
    expect(stored()).toMatchObject({ access_token: "access-2", refresh_token: "refresh-2" });
    // Still valid: served from memory, no new refresh.
    expect(await oauthAccessToken("demo", url(), {})).toBe("access-2");
    expect(refreshes).toHaveLength(1);
  }, 60_000);

  test("refreshes a token the server refused before its expiry", async () => {
    expect(await oauthAccessToken("demo", url(), {}, "access-2")).toBe("access-3");
    expect(refreshes).toEqual(["refresh-1", "refresh-2"]);
    expect(stored().refresh_token).toBe("refresh-3");
  }, 60_000);

  test("serves the connector to an engine, renewing the token the server revoked", async () => {
    // Revoked on the server's side: the gateway gets a 401, has Hermes refresh, and retries.
    valid = "revoked-elsewhere";
    refreshes.length = 0;
    refreshes.push("refresh-1", "refresh-2");
    const grant = grantMcp("default", [{ name: "demo", url: url(), oauth: {} }]);
    const client = new Client({ name: "engine", version: "1" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${gateway.port}/api/internal/mcp/demo`), {
        requestInit: { headers: { Authorization: `Bearer ${grant.token}` } },
      }),
    );
    const result: any = await client.callTool({ name: "whoami", arguments: {} });
    expect(result.content[0].text).toBe("ok access-4");
    await client.close();
    await grant.revoke();
  }, 60_000);
});
