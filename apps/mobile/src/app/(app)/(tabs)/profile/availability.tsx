import { useQuery } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { SkeletonGroup, Typography } from "heroui-native";
import { ScrollView } from "react-native";
import { useDnd } from "@/components/profile/dnd";
import { absenceMessages, absenceDays } from "@/components/profile/absences";
import { LinkRow, Section } from "@/components/profile/settings";
import { zoneLabel } from "@/components/profile/timezone";
import { useMe } from "@/components/server-scope";
import { adminUsersQuery } from "@/lib/admin";
import { scheduleSettingsQuery, weekdayNames } from "@/lib/availability";
import { defineMessages } from "@/lib/i18n";
import { TapMenu } from "@/components/menus";

/*
 * apps/web/src/components/AvailabilityEditor.tsx (Settings › Availability), one level per topic.
 * An admin opens a member's from Administration › Users (`userId`), as the web's Users.tsx does.
 */

const messages = defineMessages({
  en: {
    title: "Availability",
    help: "Colleagues and bots see when you're away or outside your working hours: they're told before writing to you, and bots avoid calling on you.",
    dnd: "Do not disturb",
    dndOn: "On",
    dndOff: "Off",
    dndOffHelp: "Turn it on for a while.",
    hours: "Working hours",
    notSet: "Not set",
    setHoursHelp: "Outside these hours, colleagues are told before writing and bots avoid calling on you.",
    timezone: "Time zone",
    orgTimezone: "Organization's",
    absences: "Absences",
    noAbsences: "No upcoming absence",
    noAbsencesHelp: "Leave, sick leave or any other day off.",
    addAbsence: "Add an absence",
    scheduleOf: (name: string) => `${name}'s availability`,
    scheduleHelp: "Working hours, absences and do not disturb, seen by colleagues and bots.",
    setHoursHelpOther: "Outside these hours, colleagues are told before writing and bots avoid calling on this person.",
  },
  fr: {
    title: "Disponibilité",
    help: "Tes collègues et les bots voient quand tu es absent·e ou hors de tes horaires : ils sont prévenus avant de t'écrire, et les bots évitent de te solliciter.",
    dnd: "Ne pas déranger",
    dndOn: "Activé",
    dndOff: "Désactivé",
    dndOffHelp: "L'activer pour un moment.",
    hours: "Horaires de travail",
    notSet: "Non définis",
    setHoursHelp: "En dehors, tes collègues sont prévenus avant d'écrire et les bots évitent de te solliciter.",
    timezone: "Fuseau horaire",
    orgTimezone: "Celui de l'organisation",
    absences: "Absences",
    noAbsences: "Aucune absence à venir",
    noAbsencesHelp: "Congé, arrêt maladie ou tout autre jour d'absence.",
    addAbsence: "Ajouter une absence",
    scheduleOf: (name: string) => `Disponibilité de ${name}`,
    scheduleHelp: "Horaires, absences et ne pas déranger, visibles par les collègues et les bots.",
    setHoursHelpOther: "En dehors, les collègues sont prévenus avant d'écrire et les bots évitent de solliciter cette personne.",
  },
});

export default function Availability() {
  const t = messages;
  const me = useMe();
  const params = useLocalSearchParams<{ userId?: string }>();
  const userId = params.userId ?? me.id;
  const self = userId === me.id;
  const name = useQuery({ ...adminUsersQuery, enabled: !self, select: (users) => users.find((u) => u.id === userId)?.name }).data;
  const { data } = useQuery(scheduleSettingsQuery(userId));
  const dnd = useDnd(userId);
  const short = weekdayNames().map((d) => d.slice(0, 3));
  const worked = data?.hours?.flatMap((ranges, day) => (ranges.length ? [short[day]] : [])) ?? [];

  return (
    <>
      <Stack.Screen.Title>{self ? t.title : name ? t.scheduleOf(name) : ""}</Stack.Screen.Title>
      <ScrollView contentInsetAdjustmentBehavior="automatic" className="bg-background" contentContainerClassName="gap-8 px-4 pb-12 pt-4">
        <Typography.Paragraph type="body-sm" color="muted" className="px-4">
          {self ? t.help : t.scheduleHelp}
        </Typography.Paragraph>
        {!data ? (
          <SkeletonGroup isLoading className="gap-4">
            <SkeletonGroup.Item className="h-14" />
            <SkeletonGroup.Item className="h-28" />
            <SkeletonGroup.Item className="h-28" />
          </SkeletonGroup>
        ) : (
          <>
            <Section>
              <TapMenu actions={dnd.actions} accessibilityLabel={`${t.dnd}, ${dnd.on ? t.dndOn : t.dndOff}`}>
                <LinkRow title={t.dnd} description={dnd.on ? dnd.label : t.dndOffHelp} value={dnd.on ? t.dndOn : t.dndOff} disabled={dnd.pending} />
              </TapMenu>
            </Section>

            <Section header={t.hours} footer={self ? t.setHoursHelp : t.setHoursHelpOther}>
              <LinkRow title={t.hours} value={data.hours ? worked.join(", ") || t.notSet : t.notSet} onPress={() => router.push({ pathname: "/profile/hours", params: self ? {} : { userId } })} />
              <LinkRow
                title={t.timezone}
                value={data.timezone ? zoneLabel(data.timezone) : t.orgTimezone}
                onPress={() => router.push({ pathname: "/profile/hours", params: self ? {} : { userId } })}
              />
            </Section>

            <Section header={t.absences} footer={data.absences.length ? undefined : t.noAbsencesHelp}>
              {data.absences.length ? (
                data.absences.map((a) => (
                  <LinkRow
                    key={a.id}
                    title={absenceMessages.kinds[a.kind]}
                    description={[absenceDays(a), a.note].filter(Boolean).join(" · ")}
                    onPress={() => router.push({ pathname: "/profile/absence", params: { id: a.id, ...(!self && { userId }) } })}
                  />
                ))
              ) : (
                <LinkRow title={t.noAbsences} chevron={false} disabled />
              )}
              <LinkRow title={t.addAbsence} action chevron={false} onPress={() => router.push({ pathname: "/profile/absence", params: self ? {} : { userId } })} />
            </Section>
          </>
        )}
      </ScrollView>
    </>
  );
}
