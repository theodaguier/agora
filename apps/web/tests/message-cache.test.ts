import { afterEach, expect, mock, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

mock.module("../src/i18n", () => ({ defineMessages: (m: unknown) => m, getLocale: () => "fr", tr: (m: any) => m.fr }));
const { messagesQuery } = await import("../src/lib/queries");
const originalFetch = globalThis.fetch;
const clients: QueryClient[] = [];
afterEach(() => { globalThis.fetch = originalFetch; clients.splice(0).forEach((client) => client.clear()); });

const a = { id: "a", createdAt: "2026-10-26T12:00:00.123000Z" };
const b = { id: "b", createdAt: a.createdAt };

function pending() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  let respond!: (r: Response) => void;
  let signal: AbortSignal | null | undefined;
  globalThis.fetch = ((_: unknown, init: RequestInit) => {
    signal = init.signal;
    return new Promise<Response>((resolve) => { respond = resolve; });
  }) as typeof fetch;
  const options = messagesQuery("conversation");
  return { client, options, respond: (rows: unknown[]) => respond(Response.json(rows)), signal: () => signal };
}

test("an actual REST refetch retains a same-date message streamed while it waited", async () => {
  const p = pending();
  p.client.setQueryData(p.options.queryKey, [a]);
  const request = p.client.fetchQuery(p.options);
  p.client.setQueryData(p.options.queryKey, [a, b]);
  p.respond([a]);
  expect((await request).map((m) => m.id)).toEqual(["a", "b"]);
});

test("the request snapshot prevents resurrection of a deleted message", async () => {
  const p = pending();
  p.client.setQueryData(p.options.queryKey, [a, b]);
  const request = p.client.fetchQuery(p.options);
  p.client.setQueryData(p.options.queryKey, [a]);
  p.respond([a, b]);
  expect((await request).map((m) => m.id)).toEqual(["a"]);
});

test("canceling a stale request aborts its signal without rolling back a stream update", async () => {
  const p = pending();
  p.client.setQueryData(p.options.queryKey, [a, b]);
  const request = p.client.fetchQuery(p.options).catch(() => null);
  await p.client.cancelQueries({ queryKey: p.options.queryKey, exact: true }, { revert: false });
  p.client.setQueryData(p.options.queryKey, [a]);
  expect(p.signal()?.aborted).toBe(true);
  p.respond([a, b]);
  await request;
  expect(p.client.getQueryData(p.options.queryKey)).toEqual([a]);
});
