import { expect, mock, test } from "bun:test";
import { Hono } from "hono";

// No database: the organization language comes from this stub.
let orgLang: "en" | "fr" = "en";
mock.module("./org", () => ({ getOrg: async () => ({ name: "Acme", locale: orgLang, timezone: "UTC", setupCompleted: true }) }));

const { defineMessages, localeMiddleware, orgLocale, tr, withLocale } = await import("./i18n");

const messages = defineMessages({
  en: { hello: "Hello", count: (n: number) => `${n} items` },
  fr: { hello: "Bonjour", count: (n: number) => `${n} éléments` },
});

const app = new Hono().use(localeMiddleware).get("/", async (c) => {
  // Async hop: the language must survive awaits and timers.
  await new Promise((r) => setTimeout(r, 5));
  await Promise.resolve();
  return c.text(tr(messages).hello);
});

test("tr follows the X-Agora-Locale header across an async hop", async () => {
  orgLang = "en";
  const res = await app.request("/", { headers: { "X-Agora-Locale": "fr" } });
  expect(await res.text()).toBe("Bonjour");
});

test("without a valid header, the request uses the organization language", async () => {
  orgLang = "fr";
  expect(await (await app.request("/")).text()).toBe("Bonjour");
  expect(await (await app.request("/", { headers: { "X-Agora-Locale": "de" } })).text()).toBe("Bonjour");
  orgLang = "en";
  expect(await (await app.request("/")).text()).toBe("Hello");
});

test("concurrent requests keep their own language", async () => {
  const [a, b] = await Promise.all([
    app.request("/", { headers: { "X-Agora-Locale": "fr" } }),
    app.request("/", { headers: { "X-Agora-Locale": "en" } }),
  ]);
  expect([await a.text(), await b.text()]).toEqual(["Bonjour", "Hello"]);
});

test("withLocale sets the language for background work; outside, the last known org language", async () => {
  orgLang = "fr";
  await orgLocale();
  expect(tr(messages).hello).toBe("Bonjour");
  const inside = await withLocale("en", async () => {
    await new Promise((r) => setTimeout(r, 1));
    return tr(messages).count(3);
  });
  expect(inside).toBe("3 items");
  expect(tr(messages, "en").hello).toBe("Hello");
});
