import type { IntegrationType } from "../integrations";
import { defineMessages } from "./define";

/** Integration types and the views bots show with them: web and mobile. */
export const integrations = defineMessages<{
  types: Record<IntegrationType, string>;
  type: string;
  confirm: string;
  cancel: string;
  confirmed: string;
  cancelled: string;
  confirmedText: (label: string) => string;
  cancelledText: (label: string) => string;
  revise: string;
  revisePlaceholder: string;
  sendRevision: string;
  revised: string;
  revisedText: (label: string, note: string) => string;
  to: string;
  cc: string;
  subject: string;
  body: string;
  title: string;
  start: string;
  end: string;
  location: string;
  attendees: string;
  description: string;
  channel: string;
  message: string;
  assignee: string;
  due: string;
  project: string;
  noSubject: string;
  empty: string;
  more: (n: number) => string;
  open: string;
  allDay: string;
  /** A pie's slice gathering the smallest ones. */
  chartRest: string;
}>({
  en: {
    types: {
      mail: "Mail",
      calendar: "Calendar",
      chat: "Messaging",
      tasks: "Tasks",
      files: "Files",
      contacts: "Contacts & CRM",
      finance: "Finance",
      code: "Code",
      database: "Database",
      other: "Other",
    },
    type: "Integration type",
    confirm: "Confirm",
    cancel: "Cancel",
    confirmed: "Confirmed",
    cancelled: "Cancelled",
    confirmedText: (label) => `Draft confirmed: ${label}`,
    cancelledText: (label) => `Draft cancelled: ${label}`,
    revise: "Ask for changes",
    revisePlaceholder: "What should change?",
    sendRevision: "Send",
    revised: "Changes requested",
    revisedText: (label, note) => `Changes to “${label}”: ${note}`,
    to: "To",
    cc: "Cc",
    subject: "Subject",
    body: "Message",
    title: "Title",
    start: "Start",
    end: "End",
    location: "Location",
    attendees: "Attendees",
    description: "Description",
    channel: "Channel",
    message: "Message",
    assignee: "Assignee",
    due: "Due",
    project: "Project",
    noSubject: "(no subject)",
    empty: "Nothing to show.",
    more: (n) => `${n} more`,
    open: "Open",
    allDay: "All day",
    chartRest: "Other",
  },
  fr: {
    types: {
      mail: "Mail",
      calendar: "Agenda",
      chat: "Messagerie",
      tasks: "Tâches",
      files: "Fichiers",
      contacts: "Contacts et CRM",
      finance: "Finance",
      code: "Code",
      database: "Base de données",
      other: "Autre",
    },
    type: "Type d'intégration",
    confirm: "Confirmer",
    cancel: "Annuler",
    confirmed: "Confirmé",
    cancelled: "Annulé",
    confirmedText: (label) => `Brouillon confirmé : ${label}`,
    cancelledText: (label) => `Brouillon annulé : ${label}`,
    revise: "Demander une correction",
    revisePlaceholder: "Qu'est-ce qui doit changer ?",
    sendRevision: "Envoyer",
    revised: "Correction demandée",
    revisedText: (label, note) => `Correction de « ${label} » : ${note}`,
    to: "À",
    cc: "Cc",
    subject: "Objet",
    body: "Message",
    title: "Titre",
    start: "Début",
    end: "Fin",
    location: "Lieu",
    attendees: "Participants",
    description: "Description",
    channel: "Canal",
    message: "Message",
    assignee: "Responsable",
    due: "Échéance",
    project: "Projet",
    noSubject: "(sans objet)",
    empty: "Rien à afficher.",
    more: (n) => `${n} de plus`,
    open: "Ouvrir",
    allDay: "Toute la journée",
    chartRest: "Autres",
  },
});
