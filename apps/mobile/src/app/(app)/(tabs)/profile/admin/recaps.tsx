import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Stack, useRouter } from "expo-router";
import { Alert, Button, Card, Chip, ListGroup, TagGroup } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { AdminGate, ErrorAlert, InfoPopover, Intro, LoadingRows, Section, SectionTitle, SettingsScroll, SwitchRow, useAdminToast } from "@/components/admin/ui";
import { confirmAction } from "@/components/confirm-action";
import { api } from "@/lib/api";
import { digestConfigQuery, type DigestAdmin, type DigestConfig } from "@/lib/admin";
import { digestQuery } from "@/lib/digest";
import { defineMessages, locale, tr } from "@/lib/i18n";
import { weekdays } from "@/lib/routines";
import { OptionPicker } from "@/components/menus";
import { CheckIcon } from "@/components/icons";
import { headerIcon } from "@/components/header-button";
import { withTap } from "@/lib/haptics";

/* apps/web/src/components/admin/DigestSettings.tsx */

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
    states: { running: "Writing", ready: "Written", empty: "Nothing to recap", failed: "Failed" },
    generateFailed: "Couldn't write the recap.",
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
    states: { running: "En cours", ready: "Rédigé", empty: "Rien à récapituler", failed: "Échec" },
    generateFailed: "Impossible de rédiger le récap.",
  },
});

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fromDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
};
/** Today on the phone, which is the organization's time zone for nearly everyone. */
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const toDate = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return new Date(2000, 0, 1, h ?? 0, m ?? 0);
};
const toTime = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
/** The recap times offered, every quarter of an hour (plus the saved one if it is off that grid). */
const timeOptions = (current: string) => {
  const times = Array.from({ length: 96 }, (_, i) => toTime(new Date(2000, 0, 1, Math.floor(i / 4), (i % 4) * 15)));
  if (!times.includes(current)) times.push(current);
  return times.sort().map((time) => ({ value: time, label: toDate(time).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) }));
};

export default function Recaps() {
  return (
    <>
      <Stack.Screen.Title>{messages.title}</Stack.Screen.Title>
      <AdminGate>
        <DigestSettings />
      </AdminGate>
    </>
  );
}

function DigestSettings() {
  const t = messages;
  const c = tr(common);
  const qc = useQueryClient();
  const toast = useAdminToast();
  // Polled while a recap is being written.
  const { data, error, refetch } = useQuery({ ...digestConfigQuery, refetchInterval: (q) => (q.state.data?.running ? 3000 : false) });
  const [form, setForm] = useState<DigestConfig | null>(null);
  // Each new load of the settings resets the form.
  const [loadedData, setLoadedData] = useState(data);
  if (data !== loadedData) {
    setLoadedData(data);
    if (data) setForm(data.config);
  }

  const save = useMutation({
    mutationFn: (body: DigestConfig) => api<DigestAdmin>("/digest/config", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: (state) => {
      toast.success(c.saved);
      qc.setQueryData(digestConfigQuery.queryKey, state);
      qc.invalidateQueries({ queryKey: digestQuery.queryKey, exact: true });
    },
    onError: (e) => toast.failed(e),
  });
  const generate = useMutation({
    mutationFn: () => api<DigestAdmin>("/digest/generate", { method: "POST" }),
    onSuccess: (state) => qc.setQueryData(digestConfigQuery.queryKey, state),
    onError: (e) => toast.failed(e, t.generateFailed),
  });

  if (!form || !data)
    return <SettingsScroll onRefresh={refetch}>{error ? <ErrorAlert error={error} /> : <LoadingRows rows={4} avatar={false} />}</SettingsScroll>;

  const dirty = JSON.stringify(form) !== JSON.stringify(data.config);
  const set = (patch: Partial<DigestConfig>) => setForm({ ...form, ...patch });
  const long = weekdays("long");
  const chosenDays = new Set(form.days);
  const weeklyOptions = [
    ...long.filter((d) => chosenDays.has(d.value)).map((d) => ({ value: String(d.value), label: capitalize(d.label) })),
    { value: "never", label: t.never },
  ];

  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon={headerIcon.check} iconRenderingMode="template" accessibilityLabel={save.isPending ? c.saving : c.save} disabled={!dirty || save.isPending} variant="prominent" onPress={withTap(() => save.mutate(form))} />
      </Stack.Toolbar>
      <SettingsScroll onRefresh={refetch}>
        <Intro>{t.intro}</Intro>
        <Section footer={t.enabledHelp}>
          <SwitchRow title={t.enabled} value={form.enabled} onChange={(enabled) => set({ enabled })} />
        </Section>

        {form.enabled && (
          <>
            <Section footer={t.timeHelp(data.timezone)}>
              <ListGroup.Item disabled>
                <ListGroup.ItemContent>
                  <ListGroup.ItemTitle>{t.time}</ListGroup.ItemTitle>
                </ListGroup.ItemContent>
                <ListGroup.ItemSuffix>
                  <OptionPicker value={form.time} options={timeOptions(form.time)} onChange={(time) => set({ time })} label={t.time} />
                </ListGroup.ItemSuffix>
              </ListGroup.Item>
            </Section>

            <View className="gap-2">
              <View className="min-h-8 flex-row items-center gap-1 px-4">
                <SectionTitle className="shrink">{t.days}</SectionTitle>
                <InfoPopover title={t.days} description={t.daysHelp} />
              </View>
              <TagGroup
                selectionMode="multiple"
                selectedKeys={form.days.map(String)}
                onSelectionChange={(keys) => {
                  const next = [...keys].map(Number).sort((a, b) => a - b);
                  if (!next.length) return;
                  Haptics.selectionAsync();
                  // The weekly day can only be one of the recap days.
                  set({ days: next, weeklyDay: form.weeklyDay !== null && next.includes(form.weeklyDay) ? form.weeklyDay : null });
                }}
 >
                <TagGroup.List className="flex-wrap gap-2 px-2">
                  {weekdays("short").map((d) => (
                    <TagGroup.Item key={d.value} id={String(d.value)}>
                      {capitalize(d.label)}
                    </TagGroup.Item>
                  ))}
                </TagGroup.List>
              </TagGroup>
            </View>

            <Section footer={t.weeklyHelp}>
              <ListGroup.Item disabled>
                <ListGroup.ItemContent>
                  <ListGroup.ItemTitle>{t.weekly}</ListGroup.ItemTitle>
                </ListGroup.ItemContent>
                <ListGroup.ItemSuffix>
                  <OptionPicker
                    value={form.weeklyDay === null ? "never" : String(form.weeklyDay)}
                    options={weeklyOptions}
                    label={t.weekly}
                    onChange={(value) => set({ weeklyDay: value === "never" ? null : Number(value) })}
 />
                </ListGroup.ItemSuffix>
              </ListGroup.Item>
            </Section>

            <Section>
              <SwitchRow title={t.personal} description={t.personalHelp} value={form.personal} onChange={(personal) => set({ personal })} />
              <SwitchRow title={t.usage} description={t.usageHelp} value={form.usageForMembers} onChange={(usageForMembers) => set({ usageForMembers })} />
            </Section>
          </>
        )}

        <LastRecap
          state={data}
          generating={generate.isPending}
          onGenerate={async () => {
            const today = data.last?.day === localToday();
            if (!today || (await confirmAction({ title: t.replaceTitle, description: t.replaceBody, action: t.replaceAction }))) generate.mutate();
          }}
        />
      </SettingsScroll>
    </>
  );
}

function LastRecap({ state, generating, onGenerate }: { state: DigestAdmin; generating: boolean; onGenerate: () => void }) {
  const t = messages;
  const router = useRouter();
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
  const next = state.next ? t.next(day(state.next.day, { weekday: "long", day: "numeric", month: "long" }), state.next.time) : t.off;

  const chip = state.running ? "running" : last?.status;

  return (
    <Card>
      <Card.Header className="flex-row items-center justify-between gap-3">
        <Card.Title>{t.status}</Card.Title>
        {!!chip && (
          <Chip size="sm" variant="soft" color={chip === "failed" ? "danger" : chip === "ready" ? "success" : chip === "running" ? "accent" : "default"}>
            <Chip.Label>{t.states[chip]}</Chip.Label>
          </Chip>
        )}
      </Card.Header>
      <Card.Body className="gap-2">
        <Card.Description>{lastText}</Card.Description>
        <Card.Description>{next}</Card.Description>
        {last?.status === "failed" && last.error && !state.running && (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description selectable>{last.error}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}
      </Card.Body>
      <Card.Footer className="flex-row gap-2">
        <Button size="sm" isDisabled={state.running || generating} onPress={withTap(onGenerate)}>
          {t.generate}
        </Button>
        {last?.status === "ready" && !state.running && (
          <Button size="sm" variant="secondary" onPress={withTap(() => router.push("/digest"))}>
            {t.view}
          </Button>
        )}
      </Card.Footer>
    </Card>
  );
}
