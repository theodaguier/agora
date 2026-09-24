/**
 * Server-side cache of logo.dev images: the browser only ever asks the API,
 * which fetches a brand once, keeps it in `brand_logo` and refreshes it after
 * a month. Unknown brands are remembered too, so they aren't asked again on
 * every render. The logo.dev key never leaves the server.
 */
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
