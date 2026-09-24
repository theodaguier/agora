import { ABSENCE_KINDS, availability, DEFAULT_HOURS, type AbsenceKind, type TimeRange, type WeeklyHours } from "@agora/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { enUS, fr } from "react-day-picker/locale";
import { confirmAction } from "@/lib/confirm";
import { FormLabel } from "@/components/FormLabel";
import { CloseIcon, PlusIcon } from "@/components/icons";
import { OptionSelect, SearchSelect } from "@/components/Pickers";
import { ErrorText } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSeparator, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { defineMessages, intlLocale, useLocale, useT } from "@/i18n";
import { common } from "@agora/core/i18n";
import { api } from "@/lib/api";
import { availabilityLabel, dndPresets, scheduleSettingsQuery, setDnd, type ScheduleSettings } from "@/lib/availability";
import { fromDay, toDay } from "@/lib/dates";

const messages = defineMessages({
  en: {
    dnd: "Do not disturb",
    dndOff: "Off",
    dndOn: "On",
    dndOffHelp: "Turn it on for a while:",
    turnOff: "Turn off",
    hours: "Working hours",
    setHours: "Set working hours",
    setHoursHelp: "Outside these hours, colleagues are told before writing and bots avoid calling on you.",
    setHoursHelpOther: "Outside these hours, colleagues are told before writing and bots avoid calling on this person.",
    notWorked: "Not worked",
    addRange: "Add a range",
    removeRange: "Remove this range",
    from: (day: string) => `${day}, start`,
    to: (day: string) => `${day}, end`,
    timezone: "Time zone",
    orgTimezone: (tz: string) => `Organization's (${tz.replaceAll("_", " ")})`,
    searchTimezone: "Search time zones",
    absences: "Absences",
    noAbsences: "No upcoming absence",
    noAbsencesHelp: "Leave, sick leave or any other day off.",
    addAbsence: "Add an absence",
    kind: "Type",
    kinds: { vacation: "Leave", sick: "Sick leave", other: "Other absence" } as Record<AbsenceKind, string>,
    dates: "Days",
    pickDates: "Pick the first and last day.",
    noDates: "Pick the days",
    note: "Note",
    noteHelp: "Only seen by the person and admins.",
    oneDay: (day: string) => day,
    range: (from: string, to: string) => `${from} to ${to}`,
    remove: "Delete this absence",
    removeTitle: "Delete this absence?",
    removeBody: "Colleagues and bots will see the person as available again on those days.",
  },
  fr: {
    dnd: "Ne pas déranger",
    dndOff: "Désactivé",
    dndOn: "Activé",
    dndOffHelp: "L'activer pour :",
    turnOff: "Désactiver",
    hours: "Horaires de travail",
    setHours: "Définir des horaires",
    setHoursHelp: "En dehors, tes collègues sont prévenus avant d'écrire et les bots évitent de te solliciter.",
    setHoursHelpOther: "En dehors, les collègues sont prévenus avant d'écrire et les bots évitent de solliciter cette personne.",
    notWorked: "Non travaillé",
    addRange: "Ajouter une plage",
    removeRange: "Retirer cette plage",
    from: (day: string) => `${day}, début`,
    to: (day: string) => `${day}, fin`,
    timezone: "Fuseau horaire",
    orgTimezone: (tz: string) => `Celui de l'organisation (${tz.replaceAll("_", " ")})`,
    searchTimezone: "Rechercher un fuseau",
    absences: "Absences",
    noAbsences: "Aucune absence à venir",
    noAbsencesHelp: "Congé, arrêt maladie ou tout autre jour d'absence.",
    addAbsence: "Ajouter une absence",
    kind: "Type",
    kinds: { vacation: "Congé", sick: "Arrêt maladie", other: "Autre absence" },
    dates: "Jours",
    pickDates: "Choisis le premier et le dernier jour.",
    noDates: "Choisir les jours",
    note: "Note",
    noteHelp: "Visible seulement par la personne et les admins.",
    oneDay: (day: string) => day,
    range: (from: string, to: string) => `Du ${from} au ${to}`,
    remove: "Supprimer cette absence",
    removeTitle: "Supprimer cette absence ?",
    removeBody: "Collègues et bots verront de nouveau la personne disponible ces jours-là.",
  },
});

const ORG = "org";

/** Monday first, like the stored hours. */
function weekdayNames(locale: string) {
  // 1 Jan 2024 was a Monday.
  return Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(locale, { weekday: "long", timeZone: "UTC" }));
}

/**
 * Someone's schedule: "do not disturb", working hours and absences. `self`
 * words it for the person themselves (Settings), otherwise for an admin.
 */
export function AvailabilityEditor({ userId, self }: { userId: string; self: boolean }) {
  const t = useT(messages);
  const { data } = useQuery(scheduleSettingsQuery(userId));
  if (!data)
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  return (
    <FieldGroup>
      <FieldSet>
        <FieldLegend>{t.dnd}</FieldLegend>
        <DndCard userId={userId} settings={data} />
      </FieldSet>
      <FieldSeparator />
      <HoursForm key={JSON.stringify([data.timezone, data.hours])} userId={userId} settings={data} self={self} />
      <FieldSeparator />
      <FieldSet>
        <FieldLegend>{t.absences}</FieldLegend>
        <Absences userId={userId} settings={data} />
      </FieldSet>
    </FieldGroup>
  );
}

function DndCard({ userId, settings }: { userId: string; settings: ScheduleSettings }) {
  const t = useT(messages);
  const qc = useQueryClient();
  const timezone = settings.timezone ?? settings.orgTimezone;
  const active = settings.dndUntil && Date.parse(settings.dndUntil) > Date.now();
  const status = active ? availabilityLabel(availability({ timezone, hours: null, dndUntil: settings.dndUntil, absences: [] })) : null;
  const change = useMutation({
    mutationFn: (until: string | null) => setDnd(userId, until),
    onSettled: () => qc.invalidateQueries({ queryKey: scheduleSettingsQuery(userId).queryKey }),
  });
  const presets = useMemo(() => dndPresets({ timezone, hours: settings.hours }), [timezone, settings.hours]);

  return (
    <Item variant="outline">
      <ItemContent>
        <ItemTitle>{active ? t.dndOn : t.dndOff}</ItemTitle>
        <ItemDescription>{status ?? t.dndOffHelp}</ItemDescription>
        <ErrorText error={change.error} />
      </ItemContent>
      <ItemActions className="flex-wrap">
        {active ? (
          <Button variant="outline" size="sm" disabled={change.isPending} onClick={() => change.mutate(null)}>
            {t.turnOff}
          </Button>
        ) : (
          presets.map((p) => (
            <Button key={p.label} variant="outline" size="sm" disabled={change.isPending} onClick={() => change.mutate(p.until)}>
              {p.label}
            </Button>
          ))
        )}
      </ItemActions>
    </Item>
  );
}

function HoursForm({ userId, settings, self }: { userId: string; settings: ScheduleSettings; self: boolean }) {
  const t = useT(messages);
  const c = useT(common);
  const id = useId();
  const qc = useQueryClient();
  const locale = intlLocale(useLocale());
  const days = useMemo(() => weekdayNames(locale), [locale]);
  const [enabled, setEnabled] = useState(settings.hours !== null);
  const [hours, setHours] = useState<WeeklyHours>(settings.hours ?? DEFAULT_HOURS);
  const [zone, setZone] = useState(settings.timezone ?? ORG);
  const zones = useMemo(() => {
    try {
      return [ORG, ...Intl.supportedValuesOf("timeZone")];
    } catch {
      return [ORG, settings.orgTimezone];
    }
  }, [settings.orgTimezone]);
  const save = useMutation({
    mutationFn: () =>
      api(`/availability/${encodeURIComponent(userId)}/hours`, {
        method: "PUT",
        body: JSON.stringify({ timezone: zone === ORG ? null : zone, hours: enabled ? hours : null }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: scheduleSettingsQuery(userId).queryKey }),
  });
  const dirty = JSON.stringify([zone === ORG ? null : zone, enabled ? hours : null]) !== JSON.stringify([settings.timezone, settings.hours]);
  const setDay = (day: number, ranges: TimeRange[]) => setHours((h) => h.map((r, i) => (i === day ? ranges : r)));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <FieldSet>
        <FieldLegend>{t.hours}</FieldLegend>
        <FieldDescription>{self ? t.setHoursHelp : t.setHoursHelpOther}</FieldDescription>
        <FieldGroup>
          <Field orientation="horizontal">
            <FieldLabel htmlFor={`${id}-enabled`}>{t.setHours}</FieldLabel>
            <Switch id={`${id}-enabled`} checked={enabled} onCheckedChange={setEnabled} />
          </Field>

          {enabled && (
            <div className="flex flex-col gap-3">
              {hours.map((ranges, day) => (
                <div key={day} className="flex items-start gap-4">
                  <Field orientation="horizontal" className="h-10 w-36 shrink-0">
                    <Switch
                      id={`${id}-day-${day}`}
                      checked={ranges.length > 0}
                      onCheckedChange={(on) => setDay(day, on ? (DEFAULT_HOURS[0] ?? []) : [])}
                    />
                    <FieldLabel htmlFor={`${id}-day-${day}`} className="capitalize">
                      {days[day]}
                    </FieldLabel>
                  </Field>
                  {ranges.length ? (
                    <div className="flex flex-col gap-2">
                      {ranges.map((r, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <OptionSelect
                            aria-label={t.from(days[day]!)}
                            className="w-24"
                            options={timeOptions(r.start)}
                            value={r.start}
                            onValueChange={(v) => setDay(day, ranges.map((x, j) => (j === i ? { ...x, start: v } : x)))}
                          />
                          <span className="text-muted-foreground">–</span>
                          <OptionSelect
                            aria-label={t.to(days[day]!)}
                            className="w-24"
                            options={timeOptions(r.end, true)}
                            value={r.end}
                            onValueChange={(v) => setDay(day, ranges.map((x, j) => (j === i ? { ...x, end: v } : x)))}
                          />
                          {i === 0 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t.addRange}
                              title={t.addRange}
                              disabled={ranges.length >= 4}
                              onClick={() => setDay(day, [...ranges, nextRange(ranges)])}
                            >
                              <PlusIcon />
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t.removeRange}
                              title={t.removeRange}
                              onClick={() => setDay(day, ranges.filter((_, j) => j !== i))}
                            >
                              <CloseIcon />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <FieldDescription className="flex h-10 items-center">{t.notWorked}</FieldDescription>
                  )}
                </div>
              ))}
            </div>
          )}

          <Field>
            <FieldLabel htmlFor={`${id}-tz`}>{t.timezone}</FieldLabel>
            <SearchSelect
              id={`${id}-tz`}
              options={zones}
              value={zone}
              onValueChange={setZone}
              label={(z) => (z === ORG ? t.orgTimezone(settings.orgTimezone) : z.replaceAll("_", " "))}
              placeholder={t.searchTimezone}
            />
          </Field>

          <Field orientation="horizontal">
            <Button type="submit" disabled={!dirty || save.isPending}>
              {save.isPending ? c.saving : c.save}
            </Button>
            {save.isSuccess && !dirty && <FieldDescription>{c.saved}</FieldDescription>}
            <ErrorText error={save.error} />
          </Field>
        </FieldGroup>
      </FieldSet>
    </form>
  );
}

/** Every half hour, plus `current` if it falls between; `end` adds midnight at the end of the day. */
function timeOptions(current: string, end = false) {
  const at = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const times = Array.from({ length: 48 }, (_, i) => at(i * 30));
  if (end) times.push("24:00");
  if (!times.includes(current)) times.push(current);
  return times.sort().map((v) => ({ value: v, label: v }));
}

/** A new range one hour after the last one ends, capped at the end of the day. */
function nextRange(ranges: TimeRange[]): TimeRange {
  const last = ranges.at(-1);
  if (!last) return { start: "09:00", end: "18:00" };
  const at = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const end = Number(last.end.slice(0, 2)) * 60 + Number(last.end.slice(3));
  const start = Math.min(end + 60, 22 * 60);
  return { start: at(start), end: at(Math.min(start + 120, 23 * 60 + 59)) };
}

function Absences({ userId, settings }: { userId: string; settings: ScheduleSettings }) {
  const t = useT(messages);
  const qc = useQueryClient();
  const locale = intlLocale(useLocale());
  const [adding, setAdding] = useState(false);
  const remove = useMutation({
    mutationFn: (id: string) => api(`/availability/${encodeURIComponent(userId)}/absences/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSettled: () => qc.invalidateQueries({ queryKey: scheduleSettingsQuery(userId).queryKey }),
  });
  const day = (d: string) => fromDay(d).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });

  const dialog = (
    <Dialog open={adding} onOpenChange={setAdding}>
      <DialogContent className="sm:max-w-md">{adding && <AbsenceForm userId={userId} onDone={() => setAdding(false)} />}</DialogContent>
    </Dialog>
  );
  const addButton = (
    <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
      {t.addAbsence}
    </Button>
  );

  if (!settings.absences.length)
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyTitle>{t.noAbsences}</EmptyTitle>
          <EmptyDescription>{t.noAbsencesHelp}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>{addButton}</EmptyContent>
        {dialog}
      </Empty>
    );

  return (
    <>
      <ItemGroup className="gap-2">
        {settings.absences.map((a) => (
          <Item key={a.id} variant="outline" role="listitem">
            <ItemContent>
              <ItemTitle>{t.kinds[a.kind]}</ItemTitle>
              <ItemDescription>
                {a.startOn === a.endOn ? t.oneDay(day(a.startOn)) : t.range(day(a.startOn), day(a.endOn))}
                {a.note && ` · ${a.note}`}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t.remove}
                title={t.remove}
                disabled={remove.isPending}
                onClick={async () => (await confirmAction({ title: t.removeTitle, description: t.removeBody, action: t.remove })) && remove.mutate(a.id)}
              >
                <CloseIcon />
              </Button>
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>
      <ErrorText error={remove.error} />
      <div>{addButton}</div>
      {dialog}
    </>
  );
}

function AbsenceForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const t = useT(messages);
  const c = useT(common);
  const id = useId();
  const qc = useQueryClient();
  const locale = useLocale();
  const [kind, setKind] = useState<AbsenceKind>("vacation");
  const [range, setRange] = useState<DateRange | undefined>();
  const [picking, setPicking] = useState(false);
  const day = (d: Date) => d.toLocaleDateString(intlLocale(locale), { weekday: "short", day: "numeric", month: "short" });
  const add = useMutation({
    mutationFn: (body: { kind: AbsenceKind; startOn: string; endOn: string; note: string }) =>
      api(`/availability/${encodeURIComponent(userId)}/absences`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: scheduleSettingsQuery(userId).queryKey });
      onDone();
    },
  });
  const today = fromDay(toDay(new Date()));

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!range?.from) return;
        const note = String(new FormData(e.currentTarget).get("note") ?? "").trim();
        add.mutate({ kind, startOn: toDay(range.from), endOn: toDay(range.to ?? range.from), note });
      }}
    >
      <DialogHeader>
        <DialogTitle>{t.addAbsence}</DialogTitle>
        <DialogDescription>{t.pickDates}</DialogDescription>
      </DialogHeader>
      <FieldGroup className="gap-4">
        <Field>
          <FormLabel htmlFor={`${id}-kind`} required>
            {t.kind}
          </FormLabel>
          <OptionSelect
            id={`${id}-kind`}
            value={kind}
            onValueChange={(v) => setKind(v as AbsenceKind)}
            options={ABSENCE_KINDS.map((k) => ({ value: k, label: t.kinds[k] }))}
          />
        </Field>
        <Field>
          <FormLabel htmlFor={`${id}-dates`} required>
            {t.dates}
          </FormLabel>
          <Popover open={picking} onOpenChange={setPicking}>
            <PopoverTrigger render={<Button id={`${id}-dates`} type="button" variant="outline" className="justify-start font-normal" />}>
              {range?.from ? (
                range.to && toDay(range.to) !== toDay(range.from) ? (
                  t.range(day(range.from), day(range.to))
                ) : (
                  t.oneDay(day(range.from))
                )
              ) : (
                <span className="text-muted-foreground">{t.noDates}</span>
              )}
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <Calendar
                mode="range"
                locale={locale === "fr" ? fr : enUS}
                selected={range}
                defaultMonth={range?.from}
                onSelect={setRange}
                disabled={{ before: today }}
              />
            </PopoverContent>
          </Popover>
        </Field>
        <Field>
          <FormLabel htmlFor={`${id}-note`}>{t.note}</FormLabel>
          <Input id={`${id}-note`} name="note" maxLength={200} />
          <FieldDescription>{t.noteHelp}</FieldDescription>
        </Field>
      </FieldGroup>
      <ErrorText error={add.error} />
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>{c.cancel}</DialogClose>
        <Button type="submit" disabled={!range?.from || add.isPending}>
          {add.isPending ? c.saving : c.add}
        </Button>
      </DialogFooter>
    </form>
  );
}
