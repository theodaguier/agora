import type { Locale, Messages } from "@agora/core/i18n";
import { getLocales } from "expo-localization";

/**
 * The app follows the phone's language: French, otherwise English (same pair as the web app).
 * Read from the phone's preferred languages (expo-localization) rather than Hermes' `Intl`
 * default, which on iOS can report the app's development language instead.
 */
export const locale: Locale = getLocales()[0]?.languageCode === "fr" ? "fr" : "en";

/** BCP 47 tag for Intl formatters and speech recognition (same mapping as the web app). */
export const intlLocale = locale === "fr" ? "fr-FR" : "en-US";

/** Messages in the phone's language: for a catalog shared with the web (`@agora/core/i18n`). */
export const tr = <T,>(messages: Messages<T>): T => messages[locale];

/** Messages only this app shows; same `{ en, fr }` contract as the shared catalogs. */
export const defineMessages = <T,>(messages: { en: T; fr: NoInfer<T> }): T => messages[locale];
