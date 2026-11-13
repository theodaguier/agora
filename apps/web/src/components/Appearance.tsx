import { ValueSlider } from "@/components/value-slider";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext, useRouter } from "@tanstack/react-router";
import { SectionHeader } from "@/components/admin/ui";
import { OptionSelect } from "@/components/Pickers";
import { BuildingIcon, GlobeIcon, MonitorIcon, MoonIcon, SunIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { defineMessages, isLocale, setLocale, useT, type Locale } from "@/i18n";
import { api } from "@/lib/api";
import { LANGUAGES } from "@/lib/languages";
import { orgQuery } from "@/lib/org";
import { previewSound, setSoundPrefs, SOUNDS, useSoundPrefs, type Sound } from "@/lib/sounds";
import { setTheme, useTheme, type Theme } from "@/lib/theme";

const messages = defineMessages({
  en: {
    title: "Appearance",
    interface: "Interface",
    stored: "The theme and sounds are saved in this browser.",
    language: {
      label: "Language",
      org: (language: string | null) => `Organization${language ? ` (${language})` : ""}`,
      help: "Interface and agents' replies.",
    },
    theme: {
      label: "Theme",
      options: { system: "System", light: "Light", dark: "Dark" } as Record<Theme, string>,
      help: "System follows your device's setting.",
    },
    sounds: {
      title: "Sounds",
      help: "When an agent replies to you, something waits for you or someone writes to you.",
      volume: "Volume",
      listen: "Listen",
      names: { reply: "Reply", attention: "Action needed", message: "Message", sent: "Sent", error: "Error" } as Record<Sound, string>,
    },
  },
  fr: {
    title: "Apparence",
    interface: "Interface",
    stored: "Le thème et les sons sont enregistrés dans ce navigateur.",
    language: {
      label: "Langue",
      org: (language: string | null) => `Organisation${language ? ` (${language})` : ""}`,
      help: "Interface et réponses des agents.",
    },
    theme: {
      label: "Thème",
      options: { system: "Système", light: "Clair", dark: "Sombre" },
      help: "Système suit le réglage de ton appareil.",
    },
    sounds: {
      title: "Sons",
      help: "Quand un agent te répond, qu'une action t'attend ou que quelqu'un t'écrit.",
      volume: "Volume",
      listen: "Écouter",
      names: { reply: "Réponse", attention: "Action requise", message: "Message", sent: "Envoi", error: "Erreur" },
    },
  },
});

const THEMES: Theme[] = ["system", "light", "dark"];
const THEME_ICONS: Record<Theme, React.ReactNode> = { system: <MonitorIcon />, light: <SunIcon />, dark: <MoonIcon /> };

/** Language names only: a flag stands for a country, not a language. */
const languageOptions = (Object.keys(LANGUAGES) as Locale[]).map((l) => ({ value: l, label: LANGUAGES[l].label, icon: <GlobeIcon /> }));

/** Settings › Appearance: language, theme and sounds, for the signed-in account. */
export function Appearance() {
  const t = useT(messages);
  return (
    <>
      <SectionHeader title={t.title} text={t.stored} />
      <Card>
        <CardHeader>
          <CardTitle>{t.interface}</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <AccountLanguage />
            <ThemePicker />
          </FieldGroup>
        </CardContent>
      </Card>
      <Sounds />
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
        className="sm:w-auto"
        disabled={save.isPending}
        options={[{ value: "org", label: t.org(org.data ? LANGUAGES[org.data.locale].label : null), icon: <BuildingIcon /> }, ...languageOptions]}
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
        <FieldLabel htmlFor="theme">{t.label}</FieldLabel>
        <FieldDescription>{t.help}</FieldDescription>
      </FieldContent>
      <OptionSelect id="theme" className="sm:w-auto" options={THEMES.map((value) => ({ value, label: t.options[value], icon: THEME_ICONS[value] }))} value={theme} onValueChange={(v) => setTheme(v as Theme)} />
    </Field>
  );
}

function Sounds() {
  const t = useT(messages).sounds;
  const { enabled, volume } = useSoundPrefs();
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <label htmlFor="sounds-enabled">{t.title}</label>
        </CardTitle>
        <CardDescription>{t.help}</CardDescription>
        <CardAction>
          <Switch id="sounds-enabled" checked={enabled} onCheckedChange={(on) => setSoundPrefs({ enabled: on })} />
        </CardAction>
      </CardHeader>
      {enabled && (
        <CardContent>
          <FieldGroup>
            <ValueSlider
              label={t.volume}
              min={0}
              max={1}
              step={0.05}
              value={volume}
              format={(v) => `${Math.round(v * 100)} %`}
              onValueChange={(v) => setSoundPrefs({ volume: v })}
              onValueCommitted={() => void previewSound("reply")}
            />
            <Field orientation="responsive">
              <FieldTitle>{t.listen}</FieldTitle>
              <div className="flex flex-wrap gap-1.5 sm:justify-end">
                {SOUNDS.map((sound) => (
                  <Button key={sound} variant="secondary" size="xs" onClick={() => void previewSound(sound)}>
                    {t.names[sound]}
                  </Button>
                ))}
              </div>
            </Field>
          </FieldGroup>
        </CardContent>
      )}
    </Card>
  );
}
