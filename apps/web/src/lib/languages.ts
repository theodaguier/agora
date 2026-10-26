import type { Locale } from "@/i18n";

export type { Locale };

/** Available languages (interface and agents), with their flag. Language names stay in their own language. */
export const LANGUAGES: Record<Locale, { flag: string; label: string }> = {
  fr: { flag: "🇫🇷", label: "Français" },
  en: { flag: "🇬🇧", label: "English" },
};

export const languageLabel = (l: Locale) => `${LANGUAGES[l].flag}\u00a0${LANGUAGES[l].label}`;

export const languageOptions = (Object.keys(LANGUAGES) as Locale[]).map((l) => ({ value: l, label: languageLabel(l) }));
