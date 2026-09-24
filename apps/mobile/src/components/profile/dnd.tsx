import { availability } from "@agora/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import type { MenuEntry } from "@/components/menus";
import { useFeedback } from "@/components/profile/settings";
import { availabilityLabel, dndPresets, scheduleSettingsQuery, setDnd, useAvailability } from "@/lib/availability";
import { defineMessages } from "@/lib/i18n";
import { presenceQuery, useMinuteTick } from "@/lib/presence";

/* The "Do not disturb" submenu of the web's user menu (Sidebar.tsx DndMenu), as a HeroUI Menu of its row. */

const messages = defineMessages({
  en: { dnd: "Do not disturb", off: "Off", turnOff: "Turn off", offHelp: "Turn it on for a while:" },
  fr: { dnd: "Ne pas déranger", off: "Désactivé", turnOff: "Désactiver", offHelp: "L'activer pour :" },
});

export const dndMessages = messages;

/** Your "do not disturb": its state, and the menu that turns it on for a while or off (`actions`: the HeroUI Menu to put on its row). */
export function useDnd(userId: string) {
  const qc = useQueryClient();
  const feedback = useFeedback();
  const status = useAvailability(userId);
  const now = useMinuteTick();
  const presence = useQuery({ ...presenceQuery, select: (s) => s.schedules?.[userId] }).data;
  // The editor's settings when loaded (Availability screen), otherwise the presence snapshot.
  const settings = useQuery({ ...scheduleSettingsQuery(userId), enabled: false }).data;
  const schedule = settings ? { timezone: settings.timezone ?? settings.orgTimezone, hours: settings.hours } : presence;
  const on = settings ? !!settings.dndUntil && Date.parse(settings.dndUntil) > now : status.state === "dnd";
  const label = on
    ? settings?.dndUntil
      ? availabilityLabel(availability({ timezone: schedule!.timezone, hours: null, dndUntil: settings.dndUntil, absences: [] }))
      : availabilityLabel(status)
    : null;

  const change = useMutation({
    mutationFn: (until: string | null) => setDnd(userId, until),
    onSuccess: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    // A failure is a HeroUI Toast: the row itself shows the state.
    onError: feedback.failed,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: presenceQuery.queryKey });
      qc.invalidateQueries({ queryKey: scheduleSettingsQuery(userId).queryKey });
    },
  });

  // The HeroUI Menu of the row: turn it off, or on for a while.
  const actions: MenuEntry[] = on
    ? [{ title: label ?? undefined, actions: [{ label: messages.turnOff, icon: "moon.zzz", destructive: true, onPress: () => change.mutate(null) }] }]
    : schedule
      ? [
          {
            title: messages.offHelp,
            // Read again on press: "for 30 minutes" counts from the tap, not from the render.
            actions: dndPresets(schedule).map((p, i) => ({ label: p.label, icon: "moon.fill" as const, onPress: () => change.mutate(dndPresets(schedule)[i]!.until) })),
          },
        ]
      : [];

  return { on, label, actions, pending: change.isPending, error: change.error };
}
