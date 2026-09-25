import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext, useRouter } from "@tanstack/react-router";
import { OptionSelect } from "@/components/Pickers";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { defineMessages, isLocale, setLocale, useT, type Locale } from "@/i18n";
import { api } from "@/lib/api";
import { languageLabel, languageOptions } from "@/lib/languages";
import { orgQuery } from "@/lib/org";
import { setTheme, useTheme, type Theme } from "@/lib/theme";

const messages = defineMessages({
  en: {
    title: "Appearance",
    language: {
      label: "Language",
      org: (language: string | null) => `The organization's${language ? ` (${language})` : ""}`,
      help: "The interface language, and the one agents reply in unless you write to them in another.",
    },
    theme: {
      label: "Theme",
      options: { system: "System", light: "Light", dark: "Dark" } as Record<Theme, string>,
      help: "System follows your device's setting. Saved in this browser.",
    },
  },
  fr: {
    title: "Apparence",
    language: {
      label: "Langue",
      org: (language: string | null) => `Celle de l'organisation${language ? ` (${language})` : ""}`,
      help: "La langue de l'interface, et celle dans laquelle les agents te répondent, sauf si tu leur écris dans une autre.",
    },
    theme: {
      label: "Thème",
      options: { system: "Système", light: "Clair", dark: "Sombre" },
      help: "Système suit le réglage de ton appareil. Enregistré dans ce navigateur.",
    },
  },
});

const THEMES: Theme[] = ["system", "light", "dark"];

/** Settings › Appearance: language and theme, for the signed-in account. */
export function Appearance() {
  const t = useT(messages);
  return (
    <>
      <h2 className="mb-7 text-lg font-semibold tracking-tight">{t.title}</h2>
      <FieldGroup>
        <AccountLanguage />
        <FieldSeparator />
        <ThemePicker />
      </FieldGroup>
    </>
  );
}

/** Language of this account (interface and agent replies); "org" = the organization's. */
function AccountLanguage() {
  const t = useT(messages).language;
  const { user } = useRouteContext({ from: "/app" });
  const router = useRouter();
  const qc = useQueryClient();
  const org = useQuery(orgQuery);
  const save = useMutation({
    mutationFn: (locale: Locale | null) => api("/me/locale", { method: "PUT", body: JSON.stringify({ locale }) }),
    onMutate: (locale) => {
      const next = locale ?? org.data?.locale;
      if (next) setLocale(next);
    },
    onSuccess: () => {
      router.invalidate();
      // Whatever the server words in the account's language is fetched again.
      qc.invalidateQueries();
    },
  });
  const current = isLocale(user.locale) ? user.locale : "org";

  return (
    <Field orientation="responsive">
      <FieldContent>
        <FieldLabel htmlFor="user-locale">{t.label}</FieldLabel>
        <FieldDescription>{t.help}</FieldDescription>
      </FieldContent>
      <OptionSelect
        id="user-locale"
        className="sm:w-56"
        disabled={save.isPending}
        options={[{ value: "org", label: t.org(org.data ? languageLabel(org.data.locale) : null) }, ...languageOptions]}
        value={current}
        onValueChange={(v) => save.mutate(isLocale(v) ? v : null)}
      />
    </Field>
  );
}

function ThemePicker() {
  const t = useT(messages).theme;
  const theme = useTheme();
  return (
    <Field orientation="responsive">
      <FieldContent>
        <FieldLabel>{t.label}</FieldLabel>
        <FieldDescription>{t.help}</FieldDescription>
      </FieldContent>
      <ToggleGroup aria-label={t.label} value={[theme]} onValueChange={(v) => v[0] && setTheme(v[0] as Theme)} variant="outline">
        {THEMES.map((value) => (
          <ToggleGroupItem key={value} value={value}>
            {t.options[value]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Field>
  );
}
