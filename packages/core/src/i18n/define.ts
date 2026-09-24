import type { Locale } from "../soul";

export type { Locale };

export const LOCALES: Locale[] = ["en", "fr"];

export const isLocale = (value: unknown): value is Locale => value === "en" || value === "fr";

export type Messages<T> = Record<Locale, T>;

/**
 * `en` is the reference shape and `fr` must match it exactly (same keys, same function
 * signatures), so a missing translation is a type error. Messages are plain strings or
 * functions for anything with parameters or plurals.
 */
export const defineMessages = <T>(messages: { en: T; fr: NoInfer<T> }): Messages<T> => messages;
