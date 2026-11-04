/**
 * Server-side cache of logo.dev images: the browser only ever asks the API,
 * which fetches a brand once, keeps it in `brand_logo` and refreshes it after
 * a month. Unknown brands are remembered too, so they aren't asked again on
 * every render. The logo.dev key never leaves the server.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { eq } from "drizzle-orm";
import { integrationConfig } from "./app-integrations";
import { db, schema } from "./db";

const { brandLogo } = schema;

const DAY = 86_400_000;
const FRESH_MS = 30 * DAY;
/** An unknown brand may get a logo later: asked again sooner. */
const MISSING_MS = 7 * DAY;

export type Brand = { domain: string } | { name: string };
export type Logo = { mime: string; data: Buffer } | null;

const DOMAIN = /^(?=.{1,253}$)[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** Cache key of a valid brand, null otherwise (anything else never reaches logo.dev). */
export function brandKey(brand: Brand): string | null {
  if ("domain" in brand) {
    const d = brand.domain.trim().toLowerCase();
    return DOMAIN.test(d) ? `d:${d}` : null;
  }
  const n = brand.name.trim().toLowerCase().replace(/\s+/g, " ");
  return /^[\p{L}\p{N} .&'-]{1,80}$/u.test(n) ? `n:${n}` : null;
}

const upstream = (key: string, token: string) => {
  const path = key.startsWith("d:") ? encodeURIComponent(key.slice(2)) : `name/${encodeURIComponent(key.slice(2))}`;
  return `https://img.logo.dev/${path}?token=${encodeURIComponent(token)}&size=128&format=png&retina=true&fallback=404`;
};

/** undefined = logo.dev couldn't answer (no key, network, quota): nothing is cached. */
async function fetchLogo(key: string): Promise<Logo | undefined> {
  const token = (await integrationConfig("logodev"))?.publishableKey;
  if (!token) return undefined;
  const res = await fetch(upstream(key, token), { signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!res) return undefined;
  if (res.status === 404) return null;
  const mime = res.headers.get("content-type") ?? "";
  if (!res.ok || !mime.startsWith("image/")) return undefined;
  return { mime, data: Buffer.from(await res.arrayBuffer()) };
}

/** One logo.dev request per brand at a time, however many images ask for it. */
const inflight = new Map<string, Promise<Logo>>();

export async function getBrandLogo(key: string): Promise<Logo> {
  const [row] = await db.select().from(brandLogo).where(eq(brandLogo.key, key));
  const cached: Logo = row?.data && row.mime ? { mime: row.mime, data: row.data } : null;
  if (row && Date.now() - row.fetchedAt.getTime() < (cached ? FRESH_MS : MISSING_MS)) return cached;

  let pending = inflight.get(key);
  if (!pending) {
    pending = (async () => {
      const fresh = await fetchLogo(key);
      // logo.dev unavailable: keep serving what we had.
      if (fresh === undefined) return cached;
      const values = { mime: fresh?.mime ?? null, data: fresh?.data ?? null, fetchedAt: new Date() };
      await db.insert(brandLogo).values({ key, ...values }).onConflictDoUpdate({ target: brandLogo.key, set: values });
      return fresh;
    })().finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return pending;
}

/** After the logo.dev key changed or was removed: logos are fetched again with the new one. */
export async function clearBrandLogos() {
  await db.delete(brandLogo);
}

/* ---------- Site favicons (Coffre-fort logins) ---------- */

const ICON_MAX = 256 * 1024;

/** An address on a private, loopback or link-local network: never fetched from the server. */
export function privateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::" || v.startsWith("fe80") || v.startsWith("fc") || v.startsWith("fd")) return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    return mapped ? privateAddress(mapped[1]!) : false;
  }
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/** A public site only: the host must resolve, and to public addresses alone. */
async function publicHost(host: string): Promise<boolean> {
  if (!DOMAIN.test(host)) return false;
  const addresses = await lookup(host, { all: true }).catch(() => []);
  return addresses.length > 0 && addresses.every((a) => !privateAddress(a.address));
}

/** Fetches a public URL, following up to 3 redirects, each checked again. */
async function fetchPublic(url: string): Promise<Response | null> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    const u = new URL(current);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!(await publicHost(u.hostname))) return null;
    const res = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(6000), headers: { "User-Agent": "Mozilla/5.0 (Agora favicon)" } }).catch(() => null);
    if (!res) return null;
    const next = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!next) return res;
    current = new URL(next, u).toString();
  }
  return null;
}

/** The site's own icons, largest first: apple-touch-icon, then sized icons, then /favicon.ico. */
function iconCandidates(html: string, base: string): string[] {
  const found: { href: string; score: number }[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = /\brel=["']?([^"'>]+)/i.exec(tag)?.[1]?.toLowerCase() ?? "";
    const href = /\bhref=["']?([^"'\s>]+)/i.exec(tag)?.[1];
    if (!href || !/\bicon\b/.test(rel)) continue;
    const size = Number(/\bsizes=["']?(\d+)/i.exec(tag)?.[1] ?? 0);
    found.push({ href, score: (rel.includes("apple-touch") ? 1000 : 0) + size });
  }
  const urls = found.sort((a, b) => b.score - a.score).map((f) => new URL(f.href, base).toString());
  return [...urls, new URL("/favicon.ico", base).toString()];
}

async function fetchFavicon(domain: string): Promise<Logo | undefined> {
  const page = await fetchPublic(`https://${domain}/`);
  const html = page?.ok && (page.headers.get("content-type") ?? "").includes("html") ? (await page.text()).slice(0, 200_000) : "";
  const base = page?.url || `https://${domain}/`;
  for (const url of iconCandidates(html, base).slice(0, 4)) {
    const res = await fetchPublic(url);
    const mime = res?.headers.get("content-type")?.split(";")[0] ?? "";
    if (!res?.ok || !(mime.startsWith("image/") || url.endsWith(".ico"))) continue;
    const data = Buffer.from(await res.arrayBuffer());
    if (data.length && data.length <= ICON_MAX) return { mime: mime.startsWith("image/") ? mime : "image/x-icon", data };
  }
  return page ? null : undefined;
}

/** A site's favicon, cached like the logos (key `f:<domain>`). */
export async function getFavicon(domain: string): Promise<Logo> {
  const d = domain.trim().toLowerCase().replace(/^www\./, "");
  if (!DOMAIN.test(d)) return null;
  const key = `f:${d}`;
  const [row] = await db.select().from(brandLogo).where(eq(brandLogo.key, key));
  const cached: Logo = row?.data && row.mime ? { mime: row.mime, data: row.data } : null;
  if (row && Date.now() - row.fetchedAt.getTime() < (cached ? FRESH_MS : MISSING_MS)) return cached;
  let pending = inflight.get(key);
  if (!pending) {
    pending = (async () => {
      const fresh = await fetchFavicon(d);
      if (fresh === undefined) return cached;
      const values = { mime: fresh?.mime ?? null, data: fresh?.data ?? null, fetchedAt: new Date() };
      await db.insert(brandLogo).values({ key, ...values }).onConflictDoUpdate({ target: brandLogo.key, set: values });
      return fresh;
    })().finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return pending;
}
