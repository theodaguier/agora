import { isLocale, type Locale } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { Intro, Section, SettingsRow, SettingsScroll, useAdminToast } from "@/components/admin/ui";
import { OptionPicker } from "@/components/menus";
import { useMeProfile } from "@/components/profile/me";
import { setTheme, THEMES, useTheme, type Theme } from "@/components/profile/theme";
import { api } from "@/lib/api";
import { defineMessages } from "@/lib/i18n";
import { sessionQuery } from "@/lib/queries";

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

/** apps/web/src/lib/languages.ts: language names only, in their own language (a flag stands for a country). */
const LANGUAGES: Record<Locale, string> = { fr: "Français", en: "English" };

const orgQuery = { queryKey: ["org"], queryFn: () => api<{ name: string; locale: Locale; image: string | null }>("/org"), staleTime: 5 * 60_000 };

export default function Appearance() {
  const t = messages;
  const theme = useTheme();
  const me = useMeProfile();
  const qc = useQueryClient();
  const toast = useAdminToast();
  const org = useQuery(orgQuery);
  const save = useMutation({
    mutationFn: (locale: Locale | null) => api("/me/locale", { method: "PUT", body: JSON.stringify({ locale }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: sessionQuery.queryKey }),
    onError: (e) => toast.failed(e),
  });
  const current = save.isPending ? (save.variables ?? "org") : isLocale(me.locale) ? me.locale : "org";
  const languages: { value: Locale | "org"; label: string }[] = [
    { value: "org", label: t.org(org.data ? LANGUAGES[org.data.locale] : null) },
    ...(Object.keys(LANGUAGES) as Locale[]).map((l) => ({ value: l, label: LANGUAGES[l] })),
  ];

  return (
    <>
      <Stack.Screen.Title>{t.title}</Stack.Screen.Title>
      <SettingsScroll>
        <Intro>{t.stored}</Intro>
        <Section title={t.interface} footer={t.languageHelp}>
          <SettingsRow label={t.language}>
            <OptionPicker label={t.language} value={current} options={languages} onChange={(value) => !save.isPending && save.mutate(isLocale(value) ? value : null)} />
          </SettingsRow>
          <SettingsRow label={t.theme} hint={t.themeHelp}>
            <OptionPicker label={t.theme} value={theme} options={THEMES.map((value) => ({ value, label: t.themes[value] }))} onChange={setTheme} />
          </SettingsRow>
        </Section>
      </SettingsScroll>
    </>
  );
}
