/** Palette entries ("/" menus) for a query: names starting with it first, then those containing it (in the name or the description). */
export function rankByQuery<T extends { name: string; description: string }>(all: T[], query: string): T[] {
  const q = query.toLowerCase();
  if (!q) return all;
  const starts = all.filter((i) => i.name.toLowerCase().startsWith(q));
  const first = new Set(starts);
  const contains = all.filter((i) => !first.has(i) && `${i.name} ${i.description}`.toLowerCase().includes(q));
  return [...starts, ...contains];
}
