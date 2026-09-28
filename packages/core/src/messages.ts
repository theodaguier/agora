/** What ordering a thread needs from a message: dates are ISO strings, which sort as dates. */
type Timed = { id: string; createdAt: string };

/**
 * `list` with `message` at its place by date, as GET /messages orders them; unchanged if it is
 * already there. Two messages saved at once can reach the stream in the other order: appended,
 * the later one showed above the earlier until the next refetch put them back.
 */
export function insertMessage<T extends Timed>(list: T[], message: T): T[] {
  if (list.some((m) => m.id === message.id)) return list;
  let i = list.length;
  while (i > 0 && list[i - 1]!.createdAt > message.createdAt) i--;
  return [...list.slice(0, i), message, ...list.slice(i)];
}

/**
 * A refetch of the thread, with what the stream added while it was on its way: a message saved
 * after the request left is missing from its answer and would disappear.
 */
export function mergeMessages<T extends Timed>(fresh: T[], cached: T[] | undefined): T[] {
  const newest = fresh[fresh.length - 1]?.createdAt ?? "";
  return (cached ?? []).filter((m) => m.createdAt > newest).reduce(insertMessage, fresh);
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
