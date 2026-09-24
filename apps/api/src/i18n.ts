import { AsyncLocalStorage } from "node:async_hooks";
import { createMiddleware } from "hono/factory";
import { getOrg, type Locale } from "./org";

/**
 * Translations for text the API sends to people: error messages, system events,
 * status lines shown in the admin. Same pattern as the web app: `en` is the
 * reference shape, `fr` must match it.
 *
 *   const messages = defineMessages({ en: { notFound: "Not found." }, fr: { notFound: "Introuvable." } });
 *   tr(messages).notFound;  // in the language of the current request
 *
 * The request language comes from the web app's `X-Agora-Locale` header (the
 * interface language), otherwise the organization's. Outside a request (bot turns,
 * background jobs) `tr` falls back to the organization's language, loaded by
 * `withLocale` or `orgLocale()`.
 */
export type { Locale };

export type Messages<T> = Record<Locale, T>;

export const defineMessages = <T>(messages: { en: T; fr: NoInfer<T> }): Messages<T> => messages;

export const isLocale = (value: unknown): value is Locale => value === "en" || value === "fr";

const storage = new AsyncLocalStorage<Locale>();

/** Last known organization language, for code running outside a request. */
let fallback: Locale = "fr";

export async function orgLocale(): Promise<Locale> {
  fallback = (await getOrg()).locale;
  return fallback;
}

export const currentLocale = (): Locale => storage.getStore() ?? fallback;

export const tr = <T>(messages: Messages<T>, locale: Locale = currentLocale()): T => messages[locale];

/** Runs `fn` with `locale` as the current language (e.g. a background job for one person). */
export const withLocale = <R>(locale: Locale, fn: () => R): R => storage.run(locale, fn);

export const localeMiddleware = createMiddleware(async (c, next) => {
  const header = c.req.header("x-agora-locale");
  const locale = isLocale(header) ? header : await orgLocale();
  await storage.run(locale, next);
});
