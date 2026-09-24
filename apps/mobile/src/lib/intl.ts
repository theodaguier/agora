/* Intl formatters are costly to build: each one is made once per locale and options, then reused. */

const cache = new Map<string, unknown>();

function cached<T>(kind: string, locale: string, options: object | undefined, make: () => T): T {
  const key = `${kind}|${locale}|${JSON.stringify(options ?? {})}`;
  let formatter = cache.get(key) as T | undefined;
  if (!formatter) cache.set(key, (formatter = make()));
  return formatter;
}

export const dateFormat = (locale: string, options?: Intl.DateTimeFormatOptions) =>
  cached("date", locale, options, () => new Intl.DateTimeFormat(locale, options));

export const numberFormat = (locale: string, options?: Intl.NumberFormatOptions) =>
  cached("number", locale, options, () => new Intl.NumberFormat(locale, options));

export const listFormat = (locale: string, options?: Intl.ListFormatOptions) =>
  cached("list", locale, options, () => new Intl.ListFormat(locale, options));
