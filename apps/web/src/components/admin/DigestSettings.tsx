import { useEffect, useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { confirmAction } from "@/lib/confirm";
import { BanIcon, CalendarDayIcon } from "@/components/icons";
import { OptionSelect, timeOptions } from "@/components/Pickers";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { defineMessages, getLocale, useT } from "@/i18n";
import { common } from "@agora/core/i18n";
import { api, type DigestAdmin, type DigestConfig } from "@/lib/api";
import { fromDay } from "@/lib/dates";
import { setDigestOpen } from "@/lib/digest";
import { digestQuery } from "@/lib/queries";
import { weekdays } from "@/lib/routines";
import { closeSettings } from "@/lib/settings";
import { LoadFailed, Loading, SectionHeader } from "./ui";

const messages = defineMessages({
  en: {
    title: "Recaps",
    intro: "A recap of the previous day every morning, for the team and for each member.",
    enabled: "Morning recap",
    enabledHelp: "Opens once for each member on their next visit, and stays in their user menu.",
    time: "Time",
    timeHelp: (tz: string) => `Time zone of the organization (${tz.replaceAll("_", " ")}).`,
    days: "Days",
    daysHelp: "On a day after days without a recap, it covers all of them (the weekend on Monday, if only weekdays are checked).",
    weekly: "Weekly recap on",
    weeklyHelp: "That day, the recap looks back on the whole previous week.",
    never: "Never",
    personal: "A part for each member",
    personalHelp: "Written from their own tasks and conversations. Without it, only the team part.",
    usage: "Tokens visible to members",
    usageHelp: "Otherwise, tokens and estimated cost are shown to admins only.",
    status: "Latest recap",
    none: "No recap written yet.",
    running: "Being written… it takes a few minutes.",
    written: (period: string, at: string) => `${period}, written ${at}.`,
    empty: (period: string) => `${period}, nothing to recap.`,
    failed: (period: string) => `${period}, failed.`,
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
    intro: "Un récap de la veille chaque matin, pour l'équipe et pour chacun.",
    enabled: "Récap du matin",
    enabledHelp: "Il s'ouvre une fois pour chaque membre à sa prochaine visite, puis reste dans son menu utilisateur.",
    time: "Heure",
    timeHelp: (tz: string) => `Fuseau de l'organisation (${tz.replaceAll("_", " ")}).`,
    days: "Jours",
    daysHelp: "Après des jours sans récap, il les couvre tous (le week-end le lundi, si seuls les jours ouvrés sont cochés).",
    weekly: "Récap de la semaine le",
    weeklyHelp: "Ce jour-là, le récap revient sur toute la semaine précédente.",
    never: "Jamais",
    personal: "Une partie pour chaque membre",
    personalHelp: "Rédigée à partir de ses tâches et de ses conversations. Sans elle, seule la partie équipe.",
    usage: "Tokens visibles par les membres",
    usageHelp: "Sinon, les tokens et le coût estimé ne sont montrés qu'aux admins.",
    status: "Dernier récap",
    none: "Aucun récap rédigé pour l'instant.",
    running: "Rédaction en cours… cela prend quelques minutes.",
    written: (period: string, at: string) => `${period}, rédigé ${at}.`,
    empty: (period: string) => `${period}, rien à récapituler.`,
    failed: (period: string) => `${period}, échec.`,
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
  const { data, isPending, error, refetch } = useQuery({ ...configQuery, refetchInterval: (q) => (q.state.data?.running ? 3000 : false) });
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
    meta: { success: c.saved },
  });
  const generate = useMutation({
    mutationFn: () => api<DigestAdmin>("/digest/generate", { method: "POST" }),
    onSuccess: (state) => qc.setQueryData(configQuery.queryKey, state),
    meta: { success: t.running },
  });

  if (!form || !data)
    return (
      <>
        <SectionHeader title={t.title} text={t.intro} />
        {isPending || data ? <Loading /> : <LoadFailed error={error} onRetry={() => void refetch()} />}
      </>
    );
  const dirty = JSON.stringify(form) !== JSON.stringify(data.config);
  const days = weekdays("long");
  const chosenDays = new Set(form.days);
  const set = (patch: Partial<DigestConfig>) => setForm({ ...form, ...patch });

  return (
    <>
      <SectionHeader title={t.title} text={t.intro} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(form);
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle>
              <label htmlFor={`${id}-enabled`}>{t.enabled}</label>
            </CardTitle>
            <CardAction>
              <Switch id={`${id}-enabled`} checked={form.enabled} onCheckedChange={(enabled) => set({ enabled })} />
            </CardAction>
          </CardHeader>
          {form.enabled && (
            <CardContent>
              {/* One setting per line: its name on the left, its control on the right. */}
              <FieldGroup className="gap-4">
                <Field orientation="horizontal">
                  <FieldLabel htmlFor={`${id}-time`} title={t.timeHelp(data.timezone)}>
                    {t.time}
                  </FieldLabel>
                  <OptionSelect id={`${id}-time`} className="w-36" options={timeOptions(form.time)} value={form.time} onValueChange={(time) => set({ time })} />
                </Field>
                <Field orientation="horizontal">
                  <FieldLabel>{t.days}</FieldLabel>
                  <div className="flex flex-wrap justify-end gap-x-4 gap-y-2">
                    {weekdays("short").map((d) => (
                      <Field key={d.value} orientation="horizontal" className="w-auto">
                        <Checkbox
                          id={`${id}-day-${d.value}`}
                          checked={chosenDays.has(d.value)}
                          onCheckedChange={(on) => {
                            const next = (on ? [...form.days, d.value] : form.days.filter((x) => x !== d.value)).sort((a, b) => a - b);
                            if (!next.length) return;
                            // The weekly day can only be one of the recap days.
                            set({ days: next, weeklyDay: form.weeklyDay !== null && next.includes(form.weeklyDay) ? form.weeklyDay : null });
                          }}
                        />
                        <FieldLabel htmlFor={`${id}-day-${d.value}`} className="font-normal">
                          {capitalize(d.label)}
                        </FieldLabel>
                      </Field>
                    ))}
                  </div>
                </Field>
                <Field orientation="horizontal">
                  <FieldLabel htmlFor={`${id}-weekly`}>{t.weekly}</FieldLabel>
                  <OptionSelect
                    id={`${id}-weekly`}
                    className="w-36"
                    value={form.weeklyDay === null ? "never" : String(form.weeklyDay)}
                    onValueChange={(v) => set({ weeklyDay: v === "never" ? null : Number(v) })}
                    options={[
                      ...days.filter((d) => chosenDays.has(d.value)).map((d) => ({ value: String(d.value), label: capitalize(d.label), icon: <CalendarDayIcon /> })),
                      { value: "never", label: t.never, icon: <BanIcon /> },
                    ]}
                  />
                </Field>
                <Field orientation="horizontal">
                  <FieldLabel htmlFor={`${id}-personal`}>{t.personal}</FieldLabel>
                  <Switch id={`${id}-personal`} checked={form.personal} onCheckedChange={(personal) => set({ personal })} />
                </Field>
                <Field orientation="horizontal">
                  <FieldLabel htmlFor={`${id}-usage`}>{t.usage}</FieldLabel>
                  <Switch id={`${id}-usage`} checked={form.usageForMembers} onCheckedChange={(usageForMembers) => set({ usageForMembers })} />
                </Field>
              </FieldGroup>
            </CardContent>
          )}
          {/* Saved on demand: the button only shows once something changed. */}
          {dirty && (
            <CardFooter className="justify-end">
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? c.saving : c.save}
              </Button>
            </CardFooter>
          )}
        </Card>
      </form>

      <Status
        state={data}
        generating={generate.isPending}
        onGenerate={async () => {
          const today = data.last?.day === localToday();
          if (!today || (await confirmAction({ title: t.replaceTitle, description: t.replaceBody, action: t.replaceAction }))) generate.mutate();
        }}
      />
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
    <Card>
      <CardHeader>
        <CardTitle>{t.status}</CardTitle>
        {/* The failure's technical cause stays in the tooltip. */}
        <CardDescription title={last?.status === "failed" && !state.running ? (last.error ?? undefined) : undefined}>
          {lastText}
          <span className="block">{next}</span>
        </CardDescription>
        <CardAction className="flex gap-2">
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
        </CardAction>
      </CardHeader>
    </Card>
  );
}
