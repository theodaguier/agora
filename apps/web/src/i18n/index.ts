import { useSyncExternalStore } from "react";

/**
 * Interface translations. Each area of the app declares its own messages with
 * `defineMessages({ en, fr })` (see `@agora/core/i18n`, where the catalogs shared with
 * the mobile app live).
 *
 *   const messages = defineMessages({ en: { title: "Members", count: (n: number) => ... }, fr: { ... } });
 *   const t = useT(messages);  // in a component: re-renders when the language changes
 *   tr(messages).title;        // outside React (event handlers, helpers)
 */
import { isLocale, type Locale, type Messages } from "@agora/core/i18n";

export { defineMessages, isLocale, LOCALES, type Locale, type Messages } from "@agora/core/i18n";

const STORAGE_KEY = "agora.locale";

export const browserLocale = (): Locale => (navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en");

function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {}
  return browserLocale();
}

export function hasStoredLocale() {
  try {
    return isLocale(localStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

let current: Locale = initialLocale();
const listeners = new Set<() => void>();
document.documentElement.lang = current;

/** Switches the interface language (remembered in this browser to avoid a flash on the next load). */
export function setLocale(locale: Locale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {}
  if (locale === current) return;
  current = locale;
  document.documentElement.lang = locale;
  listeners.forEach((l) => l());
}

export const getLocale = () => current;

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useLocale = () => useSyncExternalStore(subscribe, getLocale);

export const useT = <T>(messages: Messages<T>): T => messages[useLocale()];

export const tr = <T>(messages: Messages<T>): T => messages[current];

/** BCP 47 tag for Intl formatters. */
export const intlLocale = (locale: Locale = current) => (locale === "fr" ? "fr-FR" : "en-US");
