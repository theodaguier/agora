import { DEFAULT_HOURS, type TimeRange, type WeeklyHours } from "@agora/core";
import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Button, ControlField, ListGroup, SkeletonGroup, Typography } from "heroui-native";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { CheckIcon, CloseIcon, PlusIcon } from "@/components/icons";
import { MenuPicker } from "@/components/profile/native-pickers";
import { LinkRow, Section, ToggleRow, useFeedback } from "@/components/profile/settings";
import { ORG_TIMEZONE, zoneLabel } from "@/components/profile/timezone";
import { TimeZoneSheet } from "@/components/time-zone-sheet";
import { useMe } from "@/components/server-scope";
import { api } from "@/lib/api";
import { nextRange, scheduleSettingsQuery, timeOptions, weekdayNames, type ScheduleSettings } from "@/lib/availability";
import { defineMessages, tr } from "@/lib/i18n";
import { presenceQuery } from "@/lib/presence";
import { headerIcon } from "@/components/header-button";
import { haptic, withTap } from "@/lib/haptics";

/* apps/web/src/components/AvailabilityEditor.tsx HoursForm. */

const messages = defineMessages({
  en: {
    title: "Working hours",
    setHours: "Set working hours",
    setHoursHelp: "Outside these hours, colleagues are told before writing and bots avoid calling on you.",
    setHoursHelpOther: "Outside these hours, colleagues are told before writing and bots avoid calling on this person.",
    days: "Days",
    notWorked: "Not worked",
    addRange: "Add a range",
    removeRange: "Remove this range",
    from: (day: string) => `${day}, start`,
    to: (day: string) => `${day}, end`,
    timezone: "Time zone",
    searchTimezone: "Search time zones",
    orgTimezone: (tz: string) => `Organization's (${tz.replaceAll("_", " ")})`,
  },
  fr: {
    title: "Horaires de travail",
    setHours: "Définir des horaires",
    setHoursHelp: "En dehors, tes collègues sont prévenus avant d'écrire et les bots évitent de te solliciter.",
    setHoursHelpOther: "En dehors, les collègues sont prévenus avant d'écrire et les bots évitent de solliciter cette personne.",
    days: "Jours",
    notWorked: "Non travaillé",
    addRange: "Ajouter une plage",
    removeRange: "Retirer cette plage",
    from: (day: string) => `${day}, début`,
    to: (day: string) => `${day}, fin`,
    timezone: "Fuseau horaire",
    searchTimezone: "Rechercher un fuseau",
    orgTimezone: (tz: string) => `Celui de l'organisation (${tz.replaceAll("_", " ")})`,
  },
});

export default function Hours() {
  const me = useMe();
  // Someone else's hours when an admin opens them (Administration › Users › Availability).
  const userId = useLocalSearchParams<{ userId?: string }>().userId ?? me.id;
  const { data } = useQuery(scheduleSettingsQuery(userId));
  return (
    <>
      <Stack.Screen.Title>{messages.title}</Stack.Screen.Title>
      {data ? (
        <HoursForm key={JSON.stringify([data.timezone, data.hours])} userId={userId} self={userId === me.id} settings={data} />
      ) : (
        <KeyboardAwareScrollView bottomOffset={24} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" className="bg-background" contentContainerClassName="gap-4 px-4 pt-4">
          <SkeletonGroup isLoading className="gap-4">
            <SkeletonGroup.Item className="h-14" />
            <SkeletonGroup.Item className="h-96" />
          </SkeletonGroup>
        </KeyboardAwareScrollView>
      )}
    </>
  );
}

function HoursForm({ userId, self, settings }: { userId: string; self: boolean; settings: ScheduleSettings }) {
  const t = { ...messages, ...tr(common) };
  const qc = useQueryClient();
  const feedback = useFeedback();
  // Capitalized here: "lundi" → "Lundi".
  const days = useMemo(() => weekdayNames().map((d) => d.charAt(0).toLocaleUpperCase() + d.slice(1)), []);
  const [enabled, setEnabled] = useState(settings.hours !== null);
  const [hours, setHours] = useState<WeeklyHours>(settings.hours ?? DEFAULT_HOURS);
  const [zone, setZone] = useState(settings.timezone ?? ORG_TIMEZONE);
  const [picking, setPicking] = useState(false);
  const orgZone = useMemo(() => ({ value: ORG_TIMEZONE, label: messages.orgTimezone(settings.orgTimezone) }), [settings.orgTimezone]);
  const save = useMutation({
    mutationFn: () =>
      api(`/availability/${encodeURIComponent(userId)}/hours`, {
        method: "PUT",
        body: JSON.stringify({ timezone: zone === ORG_TIMEZONE ? null : zone, hours: enabled ? hours : null }),
      }),
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: presenceQuery.queryKey });
      await qc.invalidateQueries({ queryKey: scheduleSettingsQuery(userId).queryKey });
      feedback.saved();
      router.back();
    },
    onError: feedback.failed,
  });
  const dirty = JSON.stringify([zone === ORG_TIMEZONE ? null : zone, enabled ? hours : null]) !== JSON.stringify([settings.timezone, settings.hours]);
  const setDay = (day: number, ranges: TimeRange[]) => setHours((h) => h.map((r, i) => (i === day ? ranges : r)));

  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon={headerIcon.check} iconRenderingMode="template" accessibilityLabel={save.isPending ? t.saving : t.save} disabled={!dirty || save.isPending} variant="prominent" onPress={withTap(() => save.mutate())} />
      </Stack.Toolbar>
      <KeyboardAwareScrollView bottomOffset={24} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" className="bg-background" contentContainerClassName="gap-8 px-4 pb-12 pt-4">
        <Section footer={self ? t.setHoursHelp : t.setHoursHelpOther}>
          <ToggleRow title={t.setHours} value={enabled} onChange={setEnabled} />
        </Section>

        {enabled && (
          <Section header={t.days}>
            {hours.map((ranges, day) => (
              <View key={day} className="gap-2 pb-3">
                {/* The day's switch: a ControlField the whole line toggles, as HeroUI's ListGroup example. */}
                <ControlField
                  isSelected={ranges.length > 0}
                  onSelectedChange={(on) => (haptic.select(), setDay(day, on ? (DEFAULT_HOURS[0] ?? []) : []))}
                  accessibilityLabel={days[day]}
                  className="flex-row items-center gap-3 px-4 pt-3"
                >
                  <ListGroup.ItemContent>
                    <ListGroup.ItemTitle>{days[day]}</ListGroup.ItemTitle>
                    {!ranges.length && <ListGroup.ItemDescription>{t.notWorked}</ListGroup.ItemDescription>}
                  </ListGroup.ItemContent>
                  <ControlField.Indicator />
                </ControlField>
                {ranges.map((r, i) => (
                  <View key={i} className="flex-row items-center gap-2 px-4">
                    <MenuPicker
                      label={t.from(days[day]!)}
                      value={r.start}
                      options={timeOptions(r.start).map((v) => ({ value: v, label: v }))}
                      onChange={(v) => setDay(day, ranges.map((x, j) => (j === i ? { ...x, start: v } : x)))}
                    />
                    <Typography.Paragraph color="muted">–</Typography.Paragraph>
                    <MenuPicker
                      label={t.to(days[day]!)}
                      value={r.end}
                      options={timeOptions(r.end, true).map((v) => ({ value: v, label: v }))}
                      onChange={(v) => setDay(day, ranges.map((x, j) => (j === i ? { ...x, end: v } : x)))}
                    />
                    <View className="flex-1" />
                    {i === 0 ? (
                      <Button
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        accessibilityLabel={t.addRange}
                        isDisabled={ranges.length >= 4}
                        onPress={withTap(() => setDay(day, [...ranges, nextRange(ranges)]))}
                      >
                        <PlusIcon className="size-5 text-accent" />
                      </Button>
                    ) : (
                      <Button isIconOnly size="sm" variant="ghost" accessibilityLabel={t.removeRange} onPress={withTap(() => setDay(day, ranges.filter((_, j) => j !== i)))}>
                        <CloseIcon className="size-5 text-muted" />
                      </Button>
                    )}
                  </View>
                ))}
              </View>
            ))}
          </Section>
        )}

        <Section>
          <LinkRow title={t.timezone} value={zone === ORG_TIMEZONE ? orgZone.label : zoneLabel(zone)} onPress={() => setPicking(true)} />
        </Section>
      </KeyboardAwareScrollView>
      <TimeZoneSheet isOpen={picking} onOpenChange={setPicking} value={zone} onChange={setZone} first={orgZone} title={t.timezone} placeholder={t.searchTimezone} />
    </>
  );
}
