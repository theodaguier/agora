import { Hono } from "hono";
import { integrationConfig } from "../app-integrations";
import { brandKey, getBrandLogo, getFavicon } from "../brand-logos";
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
    const [logoDev, maps, types, servers] = await Promise.all([
      integrationConfig("logodev"),
      integrationConfig("googlemaps"),
      db.select({ server: schema.mcpIntegration.server }).from(schema.mcpIntegration),
      db.select({ name: schema.mcpServer.name, url: schema.mcpServer.url }).from(schema.mcpServer),
    ]);
    const domains: Record<string, string | null> = Object.fromEntries(types.map((t) => [t.server, null]));
    for (const s of servers) domains[s.name] = brandDomain(s.url);
    return c.json({ logos: !!logoDev?.publishableKey, maps: !!maps?.mapsKey, servers: domains });
  })

  /**
   * A map of places, from Google's Maps Static API (the key stays here): `?p=lat,lng;lat,lng` (8 at
   * most), `w` and `h` in CSS pixels, `dark=1` for the dark style. Numbered red pins, retina scale.
   */
  .get("/map", async (c) => {
    const maps = await integrationConfig("googlemaps");
    if (!maps?.mapsKey) return c.json({ error: "maps_not_configured" }, 404);
    const points = (c.req.query("p") ?? "")
      .split(";")
      .slice(0, 8)
      .map((s) => s.split(",").map(Number))
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat!) <= 90 && Math.abs(lng!) <= 180);
    if (!points.length) return c.json({ error: "invalid_points" }, 400);
    const w = Math.min(640, Math.max(64, Number(c.req.query("w")) || 600));
    const h = Math.min(640, Math.max(64, Number(c.req.query("h")) || 200));
    const url = new URL("https://maps.googleapis.com/maps/api/staticmap");
    url.searchParams.set("size", `${w}x${h}`);
    url.searchParams.set("scale", "2");
    url.searchParams.set("key", maps.mapsKey);
    if (points.length === 1) url.searchParams.set("zoom", "16");
    points.forEach(([lat, lng], i) => url.searchParams.append("markers", `color:red|label:${i + 1}|${lat},${lng}`));
    // Google's own night style, quieted: the points of interest hidden, so the pins are what shows.
    const styles = [
      "feature:poi|visibility:off",
      "feature:transit|visibility:off",
      ...(c.req.query("dark") === "1"
        ? [
            "element:geometry|color:0x1d1e21",
            "element:labels.text.fill|color:0x8a8b91",
            "element:labels.text.stroke|color:0x1d1e21",
            "feature:road|element:geometry|color:0x2c2d31",
            "feature:road.arterial|element:geometry|color:0x34353a",
            "feature:road.highway|element:geometry|color:0x3d3e44",
            "feature:water|element:geometry|color:0x111214",
            "feature:landscape|element:geometry|color:0x1d1e21",
          ]
        : []),
    ];
    for (const st of styles) url.searchParams.append("style", st);
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (!res?.ok) return c.json({ error: "maps_unavailable" }, 502);
    return new Response(new Uint8Array(await res.arrayBuffer()), {
      headers: { "Content-Type": res.headers.get("content-type") ?? "image/png", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
    });
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
  })

  /** A public site's favicon (Coffre-fort logins), fetched by the server and cached: `?domain=`. */
  .get("/favicon", async (c) => {
    const icon = await getFavicon(c.req.query("domain") ?? "");
    const cache = { "Cache-Control": `private, max-age=${icon ? 7 * 86_400 : 86_400}` };
    if (!icon) return c.body(null, 404, cache);
    return new Response(new Uint8Array(icon.data), { headers: { "Content-Type": icon.mime, "X-Content-Type-Options": "nosniff", ...cache } });
  });
