import { Hono } from "hono";
import { integrationConfig } from "../app-integrations";
import { brandKey, getBrandLogo } from "../brand-logos";
import { db, schema } from "../db";
import { requireUser, type AppEnv } from "../middleware";

/** "mcp.pennylane.com" → "pennylane.com": the brand behind a hosted MCP server. */
export function brandDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "localhost" || /^[\d.]+$|:/.test(host) || !host.includes(".")) return null;
    return host.replace(/^(?:mcp|api|app|www|server)[-.]/, "");
  } catch {
    return null;
  }
}

/** What the chat needs to draw brand logos: whether logo.dev is set up, and each MCP server's domain when known. */
export const integrations = new Hono<AppEnv>()
  .use(requireUser)
  .get("/brands", async (c) => {
    const [logoDev, types, servers] = await Promise.all([
      integrationConfig("logodev"),
      db.select({ server: schema.mcpIntegration.server }).from(schema.mcpIntegration),
      db.select({ name: schema.mcpServer.name, url: schema.mcpServer.url }).from(schema.mcpServer),
    ]);
    const domains: Record<string, string | null> = Object.fromEntries(types.map((t) => [t.server, null]));
    for (const s of servers) domains[s.name] = brandDomain(s.url);
    return c.json({ logos: !!logoDev?.publishableKey, servers: domains });
  })

  /** A brand's logo, from the server's cache (brand-logos.ts): `?domain=` or `?name=`. */
  .get("/logo", async (c) => {
    const domain = c.req.query("domain");
    const name = c.req.query("name");
    const key = domain ? brandKey({ domain }) : name ? brandKey({ name }) : null;
    if (!key) return c.json({ error: "invalid_brand" }, 400);
    const logo = await getBrandLogo(key);
    // The browser keeps the answer too, missing logos included: a list of connectors asks once.
    const cache = { "Cache-Control": `private, max-age=${logo ? 7 * 86_400 : 86_400}` };
    if (!logo) return c.body(null, 404, cache);
    return new Response(new Uint8Array(logo.data), { headers: { "Content-Type": logo.mime, "X-Content-Type-Options": "nosniff", ...cache } });
  });
