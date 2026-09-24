/**
 * "@handle" used to mention a colleague, the same in the app and in the agents'
 * context: their username, otherwise their first name ("@lea"), their full name
 * when the first name is shared ("@lea.test"), numbered if still taken ("@test2").
 */
export const slugHandle = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");

export function withHandles<T extends { id: string; name: string; username?: string | null }>(people: T[]): (T & { handle: string })[] {
  const first = (p: { name: string }) => slugHandle(p.name.split(/\s+/)[0] ?? "");
  // Stable order, so everyone computes the same handles whatever list they start from.
  const sorted = [...people].sort((a, b) => a.id.localeCompare(b.id));
  const used = new Set(sorted.map((p) => p.username?.toLowerCase()).filter(Boolean) as string[]);
  const handles = new Map<string, string>();
  for (const p of sorted) {
    if (p.username) {
      handles.set(p.id, p.username.toLowerCase());
      continue;
    }
    const short = first(p);
    const shared = sorted.some((o) => o.id !== p.id && !o.username && first(o) === short);
    const base = (shared || used.has(short) ? slugHandle(p.name) : short) || "membre";
    let handle = base;
    for (let n = 2; used.has(handle); n++) handle = `${base}${n}`;
    used.add(handle);
    handles.set(p.id, handle);
  }
  return people.map((p) => ({ ...p, handle: handles.get(p.id)! }));
}
