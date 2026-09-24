/**
 * The public models.dev registry (the one Hermes uses too): release dates of the
 * models every provider lists, and Anthropic's models. Fetched, cached for an hour;
 * when it can't be reached, the last copy is kept, or lists stay in their own order.
 */
export type CatalogModel = { id: string; name: string; reasoning?: boolean; release_date?: string };
type Registry = Record<string, { models?: Record<string, CatalogModel> }>;

const TTL = 60 * 60_000;
let cache: { at: number; registry: Promise<Registry> } | null = null;
let last: Registry | null = null;

function registry(): Promise<Registry> {
  if (!cache || Date.now() - cache.at > TTL) {
    const registry = fetch("https://models.dev/api.json", { signal: AbortSignal.timeout(10_000) })
      .then((res) => {
        if (!res.ok) throw new Error(`models.dev ${res.status}`);
        return res.json() as Promise<Registry>;
      })
      .then(
        (r) => (last = r),
        (err) => {
          cache = null;
          if (last) return last;
          throw err;
        },
      );
    cache = { at: Date.now(), registry };
  }
  return cache.registry;
}

/** Anthropic models listed by the registry. */
export async function anthropicModels(): Promise<CatalogModel[]> {
  const r = await registry();
  return Object.values(r.anthropic?.models ?? {}).filter((m) => m.id?.startsWith("claude-") && m.name);
}

/** Release date by model id, all providers merged ("openai/gpt-4.1" also counts as "gpt-4.1"); the earliest wins. */
async function releaseDates() {
  const dates = new Map<string, string>();
  for (const provider of Object.values(await registry())) {
    for (const m of Object.values(provider.models ?? {})) {
      if (!m.id || !m.release_date) continue;
      for (const id of new Set([m.id, m.id.split("/").pop()!])) {
        const known = dates.get(id);
        if (!known || m.release_date < known) dates.set(id, m.release_date);
      }
    }
  }
  return dates;
}

/**
 * Newest first, by release date. A model the registry doesn't know yet (often
 * the latest one) goes on top; the registry unreachable: order unchanged.
 */
export async function newestFirst<T extends { id: string }>(models: T[], date?: (m: T) => string | undefined): Promise<T[]> {
  const dates = await releaseDates().catch((err) => (console.error("models.dev: release dates", err), null));
  if (!dates) return models;
  // "[1m]": same model with a larger context.
  const of = (m: T) => date?.(m) ?? dates.get(m.id.replace(/\[1m\]$/, ""));
  return [...models].sort((a, b) => (of(b) ?? "9999").localeCompare(of(a) ?? "9999"));
}
