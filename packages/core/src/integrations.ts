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

export const CHART_TYPES = ["bar", "line", "area", "pie", "funnel"] as const;
export type ChartType = (typeof CHART_TYPES)[number];
/** At most this many series: past it, colors can't be told apart (categorical palette). */
export const MAX_CHART_SERIES = 5;
/**
 * A chart of the data a bot read: one value per label (a day, a page, a source) and per series.
 * `pie`: the first series only, one slice per label. `funnel`: one step per label in order, a series
 * per segment compared. `stacked`: bars or areas on top of each other.
 * `unit`: what the values count ("%", "€", "visiteurs"), shown next to them.
 */
export type ChartView = {
  type: IntegrationType;
  kind: "chart";
  title?: string;
  chart: ChartType;
  labels: string[];
  series: { name: string; values: (number | null)[] }[];
  stacked?: boolean;
  unit?: string;
};

/**
 * Colors of a chart's series, in this fixed order (never cycled): the categorical slots of the
 * data-viz palette, the usage screens' first three included. Dark: the same hues stepped for a dark surface.
 */
export const CHART_COLORS = [
  { light: "#2a78d6", dark: "#3987e5" },
  { light: "#eb6834", dark: "#d95926" },
  { light: "#1baf7a", dark: "#199e70" },
  { light: "#eda100", dark: "#c98500" },
  { light: "#e87ba4", dark: "#d55181" },
] as const satisfies { light: string; dark: string }[];
/** The slice that gathers a pie's smallest ones: a neutral, not a series color. */
export const CHART_REST_COLOR = { light: "#a3a29d", dark: "#6b6a66" };

/** A pie's slices, largest first; past MAX_CHART_SERIES, the smallest are gathered into one (`rest`). */
export function pieSlices(view: ChartView, restLabel: string) {
  const values = view.series[0]?.values ?? [];
  const slices = view.labels
    .map((label, i) => ({ label, value: values[i] ?? 0 }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);
  if (slices.length <= MAX_CHART_SERIES) return slices.map((s, i) => ({ ...s, color: CHART_COLORS[i]!, rest: false }));
  const kept = slices.slice(0, MAX_CHART_SERIES - 1).map((s, i) => ({ ...s, color: CHART_COLORS[i]!, rest: false }));
  const rest = slices.slice(MAX_CHART_SERIES - 1).reduce((sum, s) => sum + s.value, 0);
  return [...kept, { label: restLabel, value: rest, color: CHART_REST_COLOR, rest: true }];
}

/**
 * A funnel's steps for one of its series (a segment, a period), in order: each one's share of the
 * first step and of the step before it. `worst`: the step losing the most people on the way from
 * the one before, the funnel's leak.
 */
export function funnelSteps(view: ChartView, series = 0) {
  const values = view.series[series]?.values ?? [];
  const first = values[0] ?? 0;
  const steps = view.labels.map((label, i) => {
    const value = values[i] ?? 0;
    const before = i ? (values[i - 1] ?? 0) : null;
    return { label, value, ofFirst: first ? value / first : 0, kept: before ? value / before : null, worst: false };
  });
  const worst = steps.reduce<number | null>((w, s, i) => (s.kept !== null && s.kept < 1 && (w === null || s.kept < steps[w]!.kept!) ? i : w), null);
  if (worst !== null) steps[worst]!.worst = true;
  return steps;
}

/**
 * Bars read better lying down, one row per label with its name and values written out: a funnel,
 * or bars whose names are too long to fit under the axis (pages, campaigns, steps).
 */
export const barRows = (view: ChartView) =>
  view.chart === "funnel" || (view.chart === "bar" && !view.stacked && view.labels.length <= 20 && view.labels.some((l) => l.length > 14));

/**
 * A formatted value with its unit: "82 %" in French, "82%" in English. A unit a bot writes in the
 * plural drops its s for a single one ("1 personne", "0 erreur" in French, "1 visitor" in English).
 */
export function withUnit(formatted: string, unit: string | undefined, locale: string, n?: number) {
  if (!unit) return formatted;
  const fr = locale.startsWith("fr");
  if (unit === "%") return fr ? `${formatted} %` : `${formatted}%`;
  const one = n !== undefined && (fr ? Math.abs(n) < 2 : Math.abs(n) === 1);
  return `${formatted} ${one && /^\p{L}{3,}s$/u.test(unit) ? unit.slice(0, -1) : unit}`;
}

/** A unit short enough to repeat on each tick ("%", "€", "k€"); a longer one ("personnes") is written once, above the scale. */
export const unitOnTicks = (unit?: string) => !!unit && unit.length <= 2;

/** A key figure (```view``` block, `"kind": "stats"`): a value, its unit, a line saying what it's compared to. */
export type Stat = { label: string; value: number | string; unit?: string; note?: string };
export const MAX_STATS = 6;
export type StatsView = { type: IntegrationType; kind: "stats"; title?: string; stats: Stat[] };

/** A label written as an ISO date ("2026-09-24", "2026-09-24T14:00:00Z") shown as a short date, with its hour if it has one. */
export function chartLabel(label: string, locale: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(label);
  if (!m) return label;
  const at = m[4] && /[zZ]|[+-]\d{2}:?\d{2}$/.test(label) ? new Date(label) : new Date(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0));
  if (Number.isNaN(at.getTime())) return label;
  const day = at.toLocaleDateString(locale, { day: "numeric", month: "short" });
  return m[4] && (at.getHours() || at.getMinutes()) ? `${day} ${at.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}` : day;
}

/**
 * `source`: the MCP server the data comes from, for its logo. `subtitle`: what the view counts and
 * over which period ("Personnes ayant atteint chaque étape, du 22 au 25/09"), under its title.
 */
export type ViewBlock = (ListView | MailMessageView | TableView | DraftView | ChartView | StatsView) & { source?: string; subtitle?: string };

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
