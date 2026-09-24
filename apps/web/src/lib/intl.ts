import { getLocale, intlLocale } from "@/i18n";

/*
 * Intl formatters, built once per locale and options: constructing one loads locale data, which
 * adds up when a list formats a date per row. The locale is read at call time, so a language
 * switch picks up the right formatter without reloading.
 */
const cache = new Map<string, unknown>();

function formatter<T, O>(Ctor: new (locale: string, options?: O) => T, kind: string, options: O | undefined, locale: string): T {
  const key = `${kind}|${locale}|${JSON.stringify(options ?? {})}`;
  let f = cache.get(key) as T | undefined;
  if (!f) {
    f = new Ctor(locale, options);
    cache.set(key, f);
  }
  return f;
}

export const dateFormat = (options?: Intl.DateTimeFormatOptions, locale = intlLocale(getLocale())) =>
  formatter(Intl.DateTimeFormat, "date", options, locale);

export const numberFormat = (options?: Intl.NumberFormatOptions, locale = intlLocale(getLocale())) =>
  formatter(Intl.NumberFormat, "number", options, locale);

export const relativeTimeFormat = (options?: Intl.RelativeTimeFormatOptions, locale = intlLocale(getLocale())) =>
  formatter(Intl.RelativeTimeFormat, "relative", options, locale);

export const listFormat = (options?: Intl.ListFormatOptions, locale = intlLocale(getLocale())) =>
  formatter(Intl.ListFormat, "list", options, locale);
