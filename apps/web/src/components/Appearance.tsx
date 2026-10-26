import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext, useRouter } from "@tanstack/react-router";
import { SectionHeader } from "@/components/admin/ui";
import { OptionSelect } from "@/components/Pickers";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { ChatIntegrationIcon, MoonIcon, SlidersIcon, SpeakerIcon, WaveformIcon, type IconComponent } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { defineMessages, isLocale, setLocale, useT, type Locale } from "@/i18n";
import { api } from "@/lib/api";
import { languageLabel, languageOptions } from "@/lib/languages";
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
      org: (language: string | null) => `The organization's${language ? ` (${language})` : ""}`,
      help: "The interface language, and the one agents reply in unless you write to them in another.",
    },
    theme: {
      label: "Theme",
      options: { system: "System", light: "Light", dark: "Dark" } as Record<Theme, string>,
      help: "System follows your device's setting.",
    },
    sounds: {
      title: "Sounds",
      label: "Play a sound",
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
      org: (language: string | null) => `Celle de l'organisation${language ? ` (${language})` : ""}`,
      help: "La langue de l'interface, et celle dans laquelle les agents te répondent, sauf si tu leur écris dans une autre.",
    },
    theme: {
      label: "Thème",
      options: { system: "Système", light: "Clair", dark: "Sombre" },
      help: "Système suit le réglage de ton appareil.",
    },
    sounds: {
      title: "Sons",
      label: "Jouer un son",
      help: "Quand un agent te répond, qu'une action t'attend ou que quelqu'un t'écrit.",
      volume: "Volume",
      listen: "Écouter",
      names: { reply: "Réponse", attention: "Action requise", message: "Message", sent: "Envoi", error: "Erreur" },
    },
  },
});

const THEMES: Theme[] = ["system", "light", "dark"];

/** Row icons are neutral grey (Figma « icône »): colour is kept for meaning. */
const INTERFACE = "text-icon";
const SOUNDS_TONE = "text-icon";

function RowIcon({ icon: Icon, tone }: { icon: IconComponent; tone: string }) {
  return <Icon aria-hidden className={`hidden size-[22px] shrink-0 self-center sm:block ${tone}`} />;
}

/** Settings › Appearance: language, theme and sounds, for the signed-in account. */
export function Appearance() {
  const t = useT(messages);
  return (
    <>
      <SectionHeader title={t.title} />
      <div className="flex flex-col gap-8">
        <FieldSet>
          <FieldLegend>{t.interface}</FieldLegend>
          <FieldGroup className="gap-5">
            <AccountLanguage />
            <ThemePicker />
          </FieldGroup>
        </FieldSet>
        <p className="-mt-6 px-0.5 text-[13px] text-muted-foreground">{t.stored}</p>
        <FieldSet>
          <FieldLegend>{t.sounds.title}</FieldLegend>
          <FieldGroup className="gap-5">
            <Sounds />
          </FieldGroup>
        </FieldSet>
      </div>
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
      <RowIcon icon={ChatIntegrationIcon} tone={INTERFACE} />
      <FieldContent>
        <FieldLabel htmlFor="user-locale">{t.label}</FieldLabel>
        <FieldDescription>{t.help}</FieldDescription>
      </FieldContent>
      <OptionSelect
        id="user-locale"
        className="sm:w-auto"
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
      <RowIcon icon={MoonIcon} tone={INTERFACE} />
      <FieldContent>
        <FieldLabel htmlFor="theme">{t.label}</FieldLabel>
        <FieldDescription>{t.help}</FieldDescription>
      </FieldContent>
      <OptionSelect id="theme" className="sm:w-auto" options={THEMES.map((value) => ({ value, label: t.options[value] }))} value={theme} onValueChange={(v) => setTheme(v as Theme)} />
    </Field>
  );
}

function Sounds() {
  const t = useT(messages).sounds;
  const { enabled, volume } = useSoundPrefs();
  return (
    <>
      <Field orientation="responsive">
        <RowIcon icon={SpeakerIcon} tone={SOUNDS_TONE} />
        <FieldContent>
          <FieldLabel htmlFor="sounds-enabled">{t.label}</FieldLabel>
          <FieldDescription>{t.help}</FieldDescription>
        </FieldContent>
        <Switch id="sounds-enabled" checked={enabled} onCheckedChange={(on) => setSoundPrefs({ enabled: on })} />
      </Field>
      <Field orientation="responsive" data-disabled={!enabled || undefined}>
        <RowIcon icon={SlidersIcon} tone={SOUNDS_TONE} />
        <FieldLabel>{t.volume}</FieldLabel>
        <div className="flex items-center gap-3">
        <Slider
          aria-label={t.volume}
          className="data-horizontal:sm:w-40"
          disabled={!enabled}
          min={0}
          max={1}
          step={0.05}
          value={[volume]}
          onValueChange={(v) => setSoundPrefs({ volume: Array.isArray(v) ? v[0]! : v })}
          onValueCommitted={() => void previewSound("reply")}
        />
          <span className="w-[34px] text-right text-[13px] text-muted-foreground tabular-nums">{Math.round(volume * 100)} %</span>
        </div>
      </Field>
      <Field orientation="responsive" data-disabled={!enabled || undefined}>
        <RowIcon icon={WaveformIcon} tone={SOUNDS_TONE} />
        <FieldLabel>{t.listen}</FieldLabel>
        <div className="flex flex-wrap gap-1.5 sm:justify-end">
          {SOUNDS.map((sound) => (
            <Button key={sound} variant="secondary" size="xs" disabled={!enabled} onClick={() => void previewSound(sound)}>
              {t.names[sound]}
            </Button>
          ))}
        </div>
      </Field>
    </>
  );
}
