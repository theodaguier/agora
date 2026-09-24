import type { AbsenceKind } from "@agora/core";
import { fromDay } from "@/lib/availability";
import { defineMessages, locale } from "@/lib/i18n";

/* apps/web/src/components/AvailabilityEditor.tsx: the absences' wording. */

export const absenceMessages = defineMessages({
  en: {
    addAbsence: "Add an absence",
    editAbsence: "Absence",
    kind: "Type",
    kinds: { vacation: "Leave", sick: "Sick leave", other: "Other absence" } as Record<AbsenceKind, string>,
    firstDay: "First day",
    lastDay: "Last day",
    pickDates: "Pick the first and last day.",
    note: "Note",
    noteHelp: "Only seen by the person and admins.",
    oneDay: (day: string) => day,
    range: (from: string, to: string) => `${from} to ${to}`,
    remove: "Delete this absence",
    removeTitle: "Delete this absence?",
    removeBody: "Colleagues and bots will see the person as available again on those days.",
    removed: "Absence deleted",
  },
  fr: {
    addAbsence: "Ajouter une absence",
    editAbsence: "Absence",
    kind: "Type",
    kinds: { vacation: "Congé", sick: "Arrêt maladie", other: "Autre absence" },
    firstDay: "Premier jour",
    lastDay: "Dernier jour",
    pickDates: "Choisis le premier et le dernier jour.",
    note: "Note",
    noteHelp: "Visible seulement par la personne et les admins.",
    oneDay: (day: string) => day,
    range: (from: string, to: string) => `Du ${from} au ${to}`,
    remove: "Supprimer cette absence",
    removeTitle: "Supprimer cette absence ?",
    removeBody: "Collègues et bots verront de nouveau la personne disponible ces jours-là.",
    removed: "Absence supprimée",
  },
});

const day = (d: string) => fromDay(d).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });

/** "Mon, Oct 5" or "Mon, Oct 5 to Fri, Oct 9". */
export const absenceDays = (a: { startOn: string; endOn: string }) =>
  a.startOn === a.endOn ? absenceMessages.oneDay(day(a.startOn)) : absenceMessages.range(day(a.startOn), day(a.endOn));
