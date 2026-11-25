import { Stack } from "expo-router";
import { Intro, Section, SettingsRow, SettingsScroll } from "@/components/admin/ui";
import { useLanguageChoice } from "@/components/profile/language";
import { OptionPicker } from "@/components/menus";
import { setTheme, THEMES, useTheme, type Theme } from "@/components/profile/theme";
import { defineMessages } from "@/lib/i18n";

/* apps/web/src/components/Appearance.tsx: one « Interface » group, language and theme each a row with its select. */

const messages = defineMessages({
  en: {
    title: "Appearance",
    stored: "The theme is saved on this phone.",
    interface: "Interface",
    theme: "Theme",
    themes: { system: "System", light: "Light", dark: "Dark" } as Record<Theme, string>,
    themeHelp: "System follows your phone's setting.",
    language: "Language",
    org: (language: string | null) => `Organization${language ? ` (${language})` : ""}`,
    languageHelp: "The language agents reply in unless you write to them in another, and the web app's. This app follows your phone's language.",
  },
  fr: {
    title: "Apparence",
    stored: "Le thème est enregistré sur ce téléphone.",
    interface: "Interface",
    theme: "Thème",
    themes: { system: "Système", light: "Clair", dark: "Sombre" },
    themeHelp: "Système suit le réglage de ton téléphone.",
    language: "Langue",
    org: (language: string | null) => `Organisation${language ? ` (${language})` : ""}`,
    languageHelp: "La langue dans laquelle les agents te répondent, sauf si tu leur écris dans une autre, et celle de l'app web. Cette app suit la langue de ton téléphone.",
  },
});

export default function Appearance() {
  const t = messages;
  const theme = useTheme();
  const language = useLanguageChoice(t.org);

  return (
    <>
      <Stack.Screen.Title>{t.title}</Stack.Screen.Title>
      <SettingsScroll>
        <Intro>{t.stored}</Intro>
        <Section title={t.interface} footer={t.languageHelp}>
          <SettingsRow label={t.language}>
            <OptionPicker label={t.language} value={language.current} options={language.languages} onChange={language.choose} />
          </SettingsRow>
          <SettingsRow label={t.theme} hint={t.themeHelp}>
            <OptionPicker label={t.theme} value={theme} options={THEMES.map((value) => ({ value, label: t.themes[value] }))} onChange={setTheme} />
          </SettingsRow>
        </Section>
      </SettingsScroll>
    </>
  );
}
