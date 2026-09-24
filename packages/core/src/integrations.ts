/**
 * Integration types: what an MCP connector gives access to, whatever the
 * provider (Gmail and Outlook are both "mail"). The type picks the connector's
 * icon, and the views a bot can show in a conversation with the data it read
 * through that connector: an inbox, a list of events, a draft to confirm…
 *
 * Views travel as a ```view``` block at the end of the bot's reply, in the
 * normalized shape below, so they work for every provider and every engine.
 */

export const INTEGRATION_TYPES = ["mail", "calendar", "chat", "tasks", "files", "contacts", "finance", "code", "database", "other"] as const;
export type IntegrationType = (typeof INTEGRATION_TYPES)[number];

export const isIntegrationType = (value: unknown): value is IntegrationType => INTEGRATION_TYPES.includes(value as IntegrationType);

/** Keywords matched against a connector's name and description, most specific type first. */
const KEYWORDS: [IntegrationType, RegExp][] = [
  ["mail", /\b(e?-?mail|gmail|outlook|imap|smtp|inbox|fastmail|proton ?mail|mailbox)\b/i],
  ["calendar", /\b(calendars?|agenda|cal\.com|calendly|events? scheduling|caldav)\b/i],
  ["chat", /\b(slack|teams|discord|telegram|whatsapp|mattermost|rocket\.?chat|messaging|chat)\b/i],
  ["tasks", /\b(linear|asana|jira|trello|clickup|todoist|monday|notion|tasks?|issues? tracker|project management)\b/i],
  ["files", /\b(drive|dropbox|onedrive|sharepoint|box|files?|storage|s3|documents?)\b/i],
  ["contacts", /\b(hubspot|salesforce|pipedrive|crm|contacts?|attio|zoho)\b/i],
  ["finance", /\b(pennylane|stripe|qonto|quickbooks|xero|invoices?|accounting|compta\w*|payments?|banking|bank)\b/i],
  ["code", /\b(github|gitlab|bitbucket|git|repositor(y|ies)|pull requests?|sentry|vercel)\b/i],
  ["database", /\b(postgres\w*|mysql|sqlite|supabase|mongo\w*|redis|database|sql|bigquery|snowflake|airtable)\b/i],
];

/** Best guess for a connector's type, used to prefill the picker; the admin can change it. */
export function guessIntegrationType(...texts: (string | null | undefined)[]): IntegrationType {
  const text = texts.filter(Boolean).join(" ").replace(/[_-]+/g, " ");
  return KEYWORDS.find(([, re]) => re.test(text))?.[0] ?? "other";
}

/* ---------- Views ---------- */

export type MailItem = { id?: string; from: string; subject: string; snippet?: string; date?: string; unread?: boolean; url?: string };
export type EventItem = { id?: string; title: string; start: string; end?: string; allDay?: boolean; location?: string; attendees?: string[]; url?: string };
export type ChatItem = { id?: string; author: string; channel?: string; text: string; date?: string; url?: string };
export type TaskItem = { id?: string; title: string; status?: string; assignee?: string; due?: string; url?: string };
export type FileItem = { id?: string; name: string; mimeType?: string; modified?: string; size?: number; url?: string };
export type ContactItem = { id?: string; name: string; company?: string; email?: string; phone?: string; url?: string };
export type FinanceItem = { id?: string; label: string; counterparty?: string; amount: number; currency?: string; date?: string; status?: string; url?: string };
export type CodeItem = { id?: string; title: string; repo?: string; number?: number; state?: string; author?: string; url?: string };
/** Any other record: also what an unknown item falls back to. */
export type GenericItem = { id?: string; title: string; subtitle?: string; meta?: string; url?: string };

export type ViewItems = {
  mail: MailItem;
  calendar: EventItem;
  chat: ChatItem;
  tasks: TaskItem;
  files: FileItem;
  contacts: ContactItem;
  finance: FinanceItem;
  code: CodeItem;
  database: GenericItem;
  other: GenericItem;
};

export type MailDraft = { to: string[]; cc?: string[]; subject: string; body: string };
export type EventDraft = { title: string; start: string; end?: string; location?: string; attendees?: string[]; description?: string };
export type ChatDraft = { channel: string; text: string };
export type TaskDraft = { title: string; description?: string; assignee?: string; due?: string; project?: string };

export type Drafts = { mail: MailDraft; calendar: EventDraft; chat: ChatDraft; tasks: TaskDraft };
export type DraftType = keyof Drafts;
export const DRAFT_TYPES: DraftType[] = ["mail", "calendar", "chat", "tasks"];

export type ListView = { [T in IntegrationType]: { type: T; kind: "list"; title?: string; items: ViewItems[T][] } }[IntegrationType];
export type MailMessageView = {
  type: "mail";
  kind: "message";
  title?: string;
  message: { from: string; to?: string[]; subject: string; date?: string; body: string; url?: string };
};
export type TableView = { type: IntegrationType; kind: "table"; title?: string; columns: string[]; rows: (string | number | boolean | null)[][] };
export type DraftView = { [T in DraftType]: { type: T; kind: "draft"; title?: string; draft: Drafts[T]; confirm?: string } }[DraftType];

/** `source`: the MCP server the data comes from, for its logo. */
export type ViewBlock = (ListView | MailMessageView | TableView | DraftView) & { source?: string };

/**
 * The employee's answer to a draft, sent back to the bot with their (possibly edited) values:
 * carry it out, drop it, or rework it following `note` (the bot then shows a new draft).
 */
export type ViewActionKind = "confirm" | "cancel" | "revise";
export type ViewAction = { messageId: string; index: number; action: ViewActionKind; draft?: Drafts[DraftType]; note?: string; type?: DraftType };

/**
 * Colour family of a free-text status written by a bot ("En retard", "merged", "Payée"…),
 * whatever the language or the tool: problem, attention, done, ongoing, or neutral.
 */
export type StatusTone = "danger" | "warning" | "success" | "info" | "neutral";

const TONES: [StatusTone, RegExp][] = [
  ["danger", /retard|overdue|late|échou|echou|échec|echec|fail|error|erreur|rejet|reject|refus|declin|bloqu|block|impay|unpaid|urgent|critique|critical|bug|incident|expir/i],
  ["warning", /attente|pending|à payer|a payer|due|à faire|a faire|todo|to do|draft|brouillon|review|revue|relance|partiel|partial|waiting|on hold|en pause|paused|soon/i],
  ["success", /pay[ée]e?s?$|paid|done|termin|fait|complet|completed|closed ?won|merged|fusionn|valid|approv|accept|resolved|résolu|resolu|réussi|success|livr|delivered|sent|envoy|active|actif|ok$/i],
  ["info", /cours|progress|ongoing|open|ouvert|new|nouveau|nouvelle|planned|planifi|scheduled|prévu|prevu|assign/i],
];

export const statusTone = (status: string | null | undefined): StatusTone => (status ? (TONES.find(([, re]) => re.test(status))?.[0] ?? "neutral") : "neutral");

/** Past or today's due date of an unfinished item: shown as a warning. */
export const isPastDue = (iso: string | undefined, now = new Date()) => {
  if (!iso) return false;
  const day = iso.slice(0, 10);
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && day < today;
};
