/** What ordering a thread needs from a message: dates are ISO strings, which sort as dates. */
type Timed = { id: string; createdAt: string };

// Older responses used JS milliseconds; newer ones preserve Postgres microseconds.
const timestamp = (value: string) => value.replace(/(?:\.(\d+))?Z$/, (_, fraction = "") => `.${fraction.padEnd(6, "0")}Z`);
const compare = (a: Timed, b: Timed) => {
  const at = timestamp(a.createdAt), bt = timestamp(b.createdAt);
  return at < bt ? -1 : at > bt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

/**
 * `list` with `message` at its place by date, as GET /messages orders them; unchanged if it is
 * already there. Two messages saved at once can reach the stream in the other order: appended,
 * the later one showed above the earlier until the next refetch put them back.
 */
export function insertMessage<T extends Timed>(list: T[], message: T): T[] {
  if (list.some((m) => m.id === message.id)) return list;
  let i = list.length;
  while (i > 0 && compare(list[i - 1]!, message) > 0) i--;
  return [...list.slice(0, i), message, ...list.slice(i)];
}

/**
 * A refetch of the thread, with what the stream added while it was on its way: a message saved
 * after the request left is missing from its answer and would disappear.
 */
export function mergeMessages<T extends Timed>(fresh: T[], cached: T[] | undefined, before?: T[]): T[] {
  const present = new Set((cached ?? []).map((m) => m.id));
  const initial = before && new Set(before.map((m) => m.id));
  const removed = new Set((before ?? []).filter((m) => !present.has(m.id)).map((m) => m.id));
  const result = fresh.filter((m) => !removed.has(m.id));
  const newest = fresh.at(-1);
  // A request snapshot distinguishes deletion from a message streamed during the fetch.
  // Legacy callers without a snapshot retain equal-date messages as well.
  return (cached ?? []).filter((m) => initial ? !initial.has(m.id) : !newest || timestamp(m.createdAt) >= timestamp(newest.createdAt)).reduce(insertMessage, result);
}

/**
 * `list` without the message deleted for everyone, nor the quote the replies kept of it
 * (the server drops it too); unchanged if it wasn't there.
 */
export function removeMessage<T extends Timed & { data?: { replyTo?: { id: string } } | null }>(list: T[], id: string): T[] {
  if (!list.some((m) => m.id === id || m.data?.replyTo?.id === id)) return list;
  return list.flatMap((m) => {
    if (m.id === id) return [];
    if (m.data?.replyTo?.id !== id) return [m];
    const { replyTo: _, ...data } = m.data;
    return [{ ...m, data }];
  });
}
