import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext, useRouter } from "@tanstack/react-router";
import { SectionHeader } from "@/components/admin/ui";
import { OptionSelect } from "@/components/Pickers";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { defineMessages, isLocale, setLocale, useT, type Locale } from "@/i18n";
import { api } from "@/lib/api";
import { languageLabel, languageOptions } from "@/lib/languages";
import { orgQuery } from "@/lib/org";
import { previewSound, setSoundPrefs, SOUNDS, useSoundPrefs, type Sound } from "@/lib/sounds";
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
    sounds: {
      label: "Sounds",
      help: "A short sound when an agent replies to you, when something waits for you, or when someone writes to you. Saved in this browser.",
      volume: "Volume",
      listen: "Listen",
      names: { reply: "Reply", attention: "Action needed", message: "Message", sent: "Sent", error: "Error" } as Record<Sound, string>,
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
    sounds: {
      label: "Sons",
      help: "Un son discret quand un agent te répond, qu'une action t'attend ou que quelqu'un t'écrit. Enregistré dans ce navigateur.",
      volume: "Volume",
      listen: "Écouter",
      names: { reply: "Réponse", attention: "Action requise", message: "Message", sent: "Envoi", error: "Erreur" },
    },
  },
});

const THEMES: Theme[] = ["system", "light", "dark"];

/** Settings › Appearance: language, theme and sounds, for the signed-in account. */
export function Appearance() {
  const t = useT(messages);
  return (
    <>
      <SectionHeader title={t.title} />
      <FieldGroup>
        <AccountLanguage />
        <FieldSeparator />
        <ThemePicker />
        <FieldSeparator />
        <Sounds />
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

function Sounds() {
  const t = useT(messages).sounds;
  const { enabled, volume } = useSoundPrefs();
  return (
    <>
      <Field orientation="responsive">
        <FieldContent>
          <FieldLabel htmlFor="sounds-enabled">{t.label}</FieldLabel>
          <FieldDescription>{t.help}</FieldDescription>
        </FieldContent>
        <Switch id="sounds-enabled" checked={enabled} onCheckedChange={(on) => setSoundPrefs({ enabled: on })} />
      </Field>
      <Field orientation="responsive" data-disabled={!enabled || undefined}>
        <FieldLabel>{t.volume}</FieldLabel>
        <Slider
          aria-label={t.volume}
          className="data-horizontal:sm:w-56"
          disabled={!enabled}
          min={0}
          max={1}
          step={0.05}
          value={[volume]}
          onValueChange={(v) => setSoundPrefs({ volume: Array.isArray(v) ? v[0]! : v })}
          onValueCommitted={() => void previewSound("reply")}
        />
      </Field>
      <Field orientation="responsive" data-disabled={!enabled || undefined}>
        <FieldLabel>{t.listen}</FieldLabel>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {SOUNDS.map((sound) => (
            <Button key={sound} variant="outline" size="sm" disabled={!enabled} onClick={() => void previewSound(sound)}>
              {t.names[sound]}
            </Button>
          ))}
        </div>
      </Field>
    </>
  );
}
