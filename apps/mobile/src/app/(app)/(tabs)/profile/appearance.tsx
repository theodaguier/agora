import { isLocale, type Locale } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Stack } from "expo-router";
import { Label, Radio, RadioGroup, Separator, Surface } from "heroui-native";
import { Fragment } from "react";
import { ScrollView } from "react-native";
import { useMeProfile } from "@/components/profile/me";
import { Segmented } from "@/components/profile/native-pickers";
import { Section, useFeedback } from "@/components/profile/settings";
import { setTheme, THEMES, useTheme } from "@/components/profile/theme";
import { api } from "@/lib/api";
import { defineMessages } from "@/lib/i18n";
import { sessionQuery } from "@/lib/queries";

/* apps/web/src/components/Appearance.tsx: the theme in HeroUI Tabs, the language in a HeroUI RadioGroup. */

const messages = defineMessages({
  en: {
    title: "Appearance",
    theme: "Theme",
    themes: { system: "System", light: "Light", dark: "Dark" },
    themeHelp: "System follows your phone's setting. Saved on this phone.",
    language: "Language",
    org: (language: string | null) => `The organization's${language ? ` (${language})` : ""}`,
    languageHelp: "The language agents reply in unless you write to them in another, and the web app's. This app follows your phone's language.",
  },
  fr: {
    title: "Apparence",
    theme: "Thème",
    themes: { system: "Système", light: "Clair", dark: "Sombre" },
    themeHelp: "Système suit le réglage de ton téléphone. Enregistré sur ce téléphone.",
    language: "Langue",
    org: (language: string | null) => `Celle de l'organisation${language ? ` (${language})` : ""}`,
    languageHelp: "La langue dans laquelle les agents te répondent, sauf si tu leur écris dans une autre, et celle de l'app web. Cette app suit la langue de ton téléphone.",
  },
});

/** apps/web/src/lib/languages.ts: language names stay in their own language. */
const LANGUAGES: Record<Locale, { flag: string; label: string }> = {
  fr: { flag: "🇫🇷", label: "Français" },
  en: { flag: "🇬🇧", label: "English" },
};
const languageLabel = (l: Locale) => `${LANGUAGES[l].flag}  ${LANGUAGES[l].label}`;

const orgQuery = { queryKey: ["org"], queryFn: () => api<{ name: string; locale: Locale; image: string | null }>("/org"), staleTime: 5 * 60_000 };

export default function Appearance() {
  const t = messages;
  const theme = useTheme();
  const me = useMeProfile();
  const qc = useQueryClient();
  const feedback = useFeedback();
  const org = useQuery(orgQuery);
  const save = useMutation({
    mutationFn: (locale: Locale | null) => api("/me/locale", { method: "PUT", body: JSON.stringify({ locale }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: sessionQuery.queryKey }),
    onError: feedback.failed,
  });
  const current = save.isPending ? (save.variables ?? "org") : isLocale(me.locale) ? me.locale : "org";
  const languages: { value: Locale | "org"; label: string }[] = [
    { value: "org", label: t.org(org.data ? languageLabel(org.data.locale) : null) },
    ...(Object.keys(LANGUAGES) as Locale[]).map((l) => ({ value: l, label: languageLabel(l) })),
  ];

  return (
    <>
      <Stack.Screen.Title>{t.title}</Stack.Screen.Title>
      <ScrollView contentInsetAdjustmentBehavior="automatic" className="bg-background" contentContainerClassName="gap-8 px-4 pb-12 pt-4">
        {/* Three exclusive choices side by side: HeroUI Tabs. */}
        <Section header={t.theme} footer={t.themeHelp} bare>
          <Segmented
            label={t.theme}
            value={theme}
            onChange={(value) => {
              Haptics.selectionAsync();
              setTheme(value);
            }}
            options={THEMES.map((value) => ({ value, label: t.themes[value] }))}
          />
        </Section>

        {/* One language among a few: a HeroUI RadioGroup in a Surface, as its "basic" example. */}
        <Section header={t.language} footer={t.languageHelp} bare>
          <Surface>
            <RadioGroup
              value={current}
              isDisabled={save.isPending}
              onValueChange={(value) => {
                Haptics.selectionAsync();
                save.mutate(isLocale(value) ? value : null);
              }}
            >
              {languages.map((l, i) => (
                <Fragment key={l.value}>
                  {i > 0 && <Separator className="my-1" />}
                  <RadioGroup.Item value={l.value}>
                    <Label className="flex-1">{l.label}</Label>
                    <Radio />
                  </RadioGroup.Item>
                </Fragment>
              ))}
            </RadioGroup>
          </Surface>
        </Section>
      </ScrollView>
    </>
  );
}
