import { useEffect, useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { confirmAction } from "@/lib/confirm";
import { FormLabel } from "@/components/FormLabel";
import { OptionSelect } from "@/components/Pickers";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { defineMessages, getLocale, useT } from "@/i18n";
import { common } from "@agora/core/i18n";
import { api, type DigestAdmin, type DigestConfig } from "@/lib/api";
import { fromDay } from "@/lib/dates";
import { setDigestOpen } from "@/lib/digest";
import { digestQuery } from "@/lib/queries";
import { weekdays } from "@/lib/routines";
import { closeSettings } from "@/lib/settings";
import { SectionHeader } from "./ui";

const messages = defineMessages({
  en: {
    title: "Recaps",
    intro: "Every morning the AI writes a recap of the previous day for the whole team, with a part addressed to each member.",
    enabled: "Morning recap",
    enabledHelp: "Opens once for each member on their next visit, and stays in their user menu.",
    time: "Time",
    timeHelp: (tz: string) => `Time zone of the organization (${tz.replaceAll("_", " ")}).`,
    days: "Days",
    daysHelp: "On a day after days without a recap, it covers all of them (the weekend on Monday, if only weekdays are checked).",
    weekly: "Weekly recap",
    weeklyHelp: "That day, the recap looks back on the whole previous week.",
    never: "Never",
    personal: "Part addressed to each member",
    personalHelp: "Written from their own tasks and conversations. Without it, only the team part.",
    usage: "Token usage visible to members",
    usageHelp: "Otherwise, tokens and estimated cost are shown to admins only.",
    status: "Latest recap",
    none: "No recap written yet.",
    running: "Being written… it takes a few minutes.",
    written: (period: string, at: string) => `${period} — written ${at}.`,
    empty: (period: string) => `${period} — nothing happened, no recap.`,
    failed: (period: string) => `${period} — failed.`,
    next: (day: string, time: string) => `Next: ${day} at ${time}.`,
    off: "Recaps are turned off.",
    generate: "Write now",
    replaceTitle: "Rewrite today's recap?",
    replaceBody: "It replaces the one written this morning; members who already read it won't see it open again.",
    replaceAction: "Rewrite",
    view: "View",
  },
  fr: {
    title: "Récaps",
    intro: "Chaque matin, l'IA rédige un récap de la veille pour toute l'équipe, avec une partie adressée à chaque membre.",
    enabled: "Récap du matin",
    enabledHelp: "Il s'ouvre une fois pour chaque membre à sa prochaine visite, puis reste dans son menu utilisateur.",
    time: "Heure",
    timeHelp: (tz: string) => `Fuseau de l'organisation (${tz.replaceAll("_", " ")}).`,
    days: "Jours",
    daysHelp: "Après des jours sans récap, il les couvre tous (le week-end le lundi, si seuls les jours ouvrés sont cochés).",
    weekly: "Récap de la semaine",
    weeklyHelp: "Ce jour-là, le récap revient sur toute la semaine précédente.",
    never: "Jamais",
    personal: "Partie adressée à chaque membre",
    personalHelp: "Rédigée à partir de ses tâches et de ses conversations. Sans elle, seule la partie équipe.",
    usage: "Consommation de tokens visible par les membres",
    usageHelp: "Sinon, les tokens et le coût estimé ne sont montrés qu'aux admins.",
    status: "Dernier récap",
    none: "Aucun récap rédigé pour l'instant.",
    running: "Rédaction en cours… cela prend quelques minutes.",
    written: (period: string, at: string) => `${period} — rédigé ${at}.`,
    empty: (period: string) => `${period} — aucune activité, pas de récap.`,
    failed: (period: string) => `${period} — échec.`,
    next: (day: string, time: string) => `Prochain : ${day} à ${time}.`,
    off: "Les récaps sont désactivés.",
    generate: "Rédiger maintenant",
    replaceTitle: "Réécrire le récap d'aujourd'hui ?",
    replaceBody: "Il remplace celui de ce matin ; les membres qui l'ont déjà lu ne le verront pas se rouvrir.",
    replaceAction: "Réécrire",
    view: "Voir",
  },
});

const configQuery = { queryKey: ["digest", "config"], queryFn: () => api<DigestAdmin>("/digest/config") };

/** Morning recap settings (admin): when it's written, what it contains; the latest one and a way to write it now. */
export function DigestSettings() {
  const t = useT(messages);
  const c = useT(common);
  const id = useId();
  const qc = useQueryClient();
  // Polled while a recap is being written.
  const { data } = useQuery({ ...configQuery, refetchInterval: (q) => (q.state.data?.running ? 3000 : false) });
  const [form, setForm] = useState<DigestConfig | null>(null);
  useEffect(() => {
    if (data) setForm(data.config);
  }, [data]);

  const save = useMutation({
    mutationFn: (body: DigestConfig) => api<DigestAdmin>("/digest/config", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: (state) => {
      qc.setQueryData(configQuery.queryKey, state);
      qc.invalidateQueries({ queryKey: digestQuery.queryKey, exact: true });
    },
  });
  const generate = useMutation({
    mutationFn: () => api<DigestAdmin>("/digest/generate", { method: "POST" }),
    onSuccess: (state) => qc.setQueryData(configQuery.queryKey, state),
  });

  if (!form || !data) return null;
  const dirty = JSON.stringify(form) !== JSON.stringify(data.config);
  const days = weekdays("long");
  const chosenDays = new Set(form.days);
  const set = (patch: Partial<DigestConfig>) => setForm({ ...form, ...patch });

  return (
    <>
      <SectionHeader title={t.title} text={t.intro} />
      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(form);
        }}
      >
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor={`${id}-enabled`}>{t.enabled}</FieldLabel>
            <FieldDescription>{t.enabledHelp}</FieldDescription>
          </FieldContent>
          <Switch id={`${id}-enabled`} checked={form.enabled} onCheckedChange={(enabled) => set({ enabled })} />
        </Field>

        {form.enabled && (
          <>
            <div className="grid items-start gap-5 sm:grid-cols-2 sm:gap-4">
              <Field>
                <FormLabel htmlFor={`${id}-time`} required>
                  {t.time}
                </FormLabel>
                <Input id={`${id}-time`} type="time" required value={form.time} onChange={(e) => e.target.value && set({ time: e.target.value })} />
                <FieldDescription>{t.timeHelp(data.timezone)}</FieldDescription>
              </Field>
              <Field>
                <FormLabel htmlFor={`${id}-weekly`} required>
                  {t.weekly}
                </FormLabel>
                <OptionSelect
                  id={`${id}-weekly`}
                  value={form.weeklyDay === null ? "never" : String(form.weeklyDay)}
                  onValueChange={(v) => set({ weeklyDay: v === "never" ? null : Number(v) })}
                  options={[
                    ...days.filter((d) => chosenDays.has(d.value)).map((d) => ({ value: String(d.value), label: capitalize(d.label) })),
                    { value: "never", label: t.never },
                  ]}
                />
                <FieldDescription>{t.weeklyHelp}</FieldDescription>
              </Field>
            </div>

            <Field>
              <FormLabel required>{t.days}</FormLabel>
              <ToggleGroup
                multiple
                variant="outline"
                size="sm"
                spacing={1}
                className="flex-wrap"
                value={form.days.map(String)}
                onValueChange={(v) => {
                  if (!v.length) return;
                  const next = v.map(Number).sort((a, b) => a - b);
                  // The weekly day can only be one of the recap days.
                  set({ days: next, weeklyDay: form.weeklyDay !== null && next.includes(form.weeklyDay) ? form.weeklyDay : null });
                }}
              >
                {weekdays("short").map((d) => (
                  <ToggleGroupItem key={d.value} value={String(d.value)} className="capitalize">
                    {d.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <FieldDescription>{t.daysHelp}</FieldDescription>
            </Field>

            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor={`${id}-personal`}>{t.personal}</FieldLabel>
                <FieldDescription>{t.personalHelp}</FieldDescription>
              </FieldContent>
              <Switch id={`${id}-personal`} checked={form.personal} onCheckedChange={(personal) => set({ personal })} />
            </Field>

            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor={`${id}-usage`}>{t.usage}</FieldLabel>
                <FieldDescription>{t.usageHelp}</FieldDescription>
              </FieldContent>
              <Switch id={`${id}-usage`} checked={form.usageForMembers} onCheckedChange={(usageForMembers) => set({ usageForMembers })} />
            </Field>
          </>
        )}

        <Field orientation="horizontal">
          <Button type="submit" disabled={!dirty || save.isPending}>
            {save.isPending ? c.saving : c.save}
          </Button>
          {save.isSuccess && !dirty && <FieldDescription>{c.saved}</FieldDescription>}
          {save.error && <FieldError>{save.error.message}</FieldError>}
        </Field>
      </form>

      <Status
        state={data}
        generating={generate.isPending}
        onGenerate={async () => {
          const today = data.last?.day === localToday();
          if (!today || (await confirmAction({ title: t.replaceTitle, description: t.replaceBody, action: t.replaceAction }))) generate.mutate();
        }}
      />
      {generate.error && <FieldError className="mt-2">{generate.error.message}</FieldError>}
    </>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Today in the browser's time zone, which is the organization's for nearly everyone. */
const localToday = () => new Date().toLocaleDateString("sv-SE");

function Status({ state, generating, onGenerate }: { state: DigestAdmin; generating: boolean; onGenerate: () => void }) {
  const t = useT(messages);
  const locale = getLocale();
  const day = (d: string, opts: Intl.DateTimeFormatOptions) => fromDay(d).toLocaleDateString(locale, opts);
  const period = (p: { periodStart: string; periodEnd: string }) =>
    p.periodStart === p.periodEnd
      ? capitalize(day(p.periodStart, { weekday: "long", day: "numeric", month: "long" }))
      : `${day(p.periodStart, { day: "numeric", month: "short" })} – ${day(p.periodEnd, { day: "numeric", month: "short" })}`;
  const at = (iso: string) => new Date(iso).toLocaleString(locale, { weekday: "long", hour: "2-digit", minute: "2-digit" });

  const last = state.last;
  const lastText = state.running
    ? t.running
    : !last
      ? t.none
      : last.status === "ready"
        ? t.written(period(last), at(last.updatedAt))
        : last.status === "empty"
          ? t.empty(period(last))
          : t.failed(period(last));
  const next = state.next
    ? t.next(day(state.next.day, { weekday: "long", day: "numeric", month: "long" }), state.next.time)
    : t.off;

  return (
    <Item variant="outline" className="mt-8">
      <ItemContent>
        <ItemTitle>{t.status}</ItemTitle>
        <ItemDescription className="line-clamp-none">
          {lastText}
          {last?.status === "failed" && last.error && !state.running && <span className="block text-destructive">{last.error}</span>}
          <span className="block">{next}</span>
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        {last?.status === "ready" && !state.running && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              closeSettings();
              setDigestOpen(true);
            }}
          >
            {t.view}
          </Button>
        )}
        <Button size="sm" disabled={state.running || generating} onClick={onGenerate}>
          {t.generate}
        </Button>
      </ItemActions>
    </Item>
  );
}
