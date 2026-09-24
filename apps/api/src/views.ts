/**
 * Views a bot shows in a conversation with the data it read through a typed
 * connector (integrations.ts): an inbox, events, a draft to confirm… It emits
 * them in a ```view``` block, in the normalized shape of @agora/core, so the
 * app renders them the same way whatever the provider or the engine.
 *
 * A draft is never executed by the app: the employee confirms it (possibly
 * edited) and the bot receives their answer (withViewAction), then acts itself.
 */
import { DRAFT_TYPES, INTEGRATION_TYPES, type DraftType, type IntegrationType, type ViewAction, type ViewBlock } from "@agora/core";
import { z } from "zod";

const str = (max = 300) => z.string().trim().max(max);
const opt = (max = 300) => str(max).optional();
const url = z.string().url().max(2000).optional();
const people = z.array(str(200)).max(50);
const id = opt(200);

const items = {
  mail: z.object({ id, from: str(200), subject: str(300), snippet: opt(500), date: opt(40), unread: z.boolean().optional(), url }),
  calendar: z.object({ id, title: str(300), start: str(40), end: opt(40), allDay: z.boolean().optional(), location: opt(300), attendees: people.optional(), url }),
  chat: z.object({ id, author: str(200), channel: opt(200), text: str(2000), date: opt(40), url }),
  tasks: z.object({ id, title: str(300), status: opt(60), assignee: opt(200), due: opt(40), url }),
  files: z.object({ id, name: str(300), mimeType: opt(120), modified: opt(40), size: z.number().nonnegative().optional(), url }),
  contacts: z.object({ id, name: str(200), company: opt(200), email: opt(200), phone: opt(60), url }),
  finance: z.object({ id, label: str(300), counterparty: opt(200), amount: z.number(), currency: opt(3), date: opt(40), status: opt(60), url }),
  code: z.object({ id, title: str(300), repo: opt(200), number: z.number().int().optional(), state: opt(60), author: opt(200), url }),
  database: z.object({ id, title: str(300), subtitle: opt(300), meta: opt(200), url }),
  other: z.object({ id, title: str(300), subtitle: opt(300), meta: opt(200), url }),
} satisfies Record<IntegrationType, z.ZodType>;

const drafts = {
  mail: z.object({ to: people.min(1), cc: people.optional(), subject: str(300), body: str(20_000) }),
  calendar: z.object({ title: str(300), start: str(40), end: opt(40), location: opt(300), attendees: people.optional(), description: opt(5000) }),
  chat: z.object({ channel: str(200), text: str(5000) }),
  tasks: z.object({ title: str(300), description: opt(5000), assignee: opt(200), due: opt(40), project: opt(200) }),
} satisfies Record<DraftType, z.ZodType>;

const title = opt(120);
const MAX_ITEMS = 50;

const tryJson = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
};

/** One view; the item shape depends on `type`. Unknown or invalid views are dropped. */
function parseView(raw: unknown): ViewBlock | null {
  const view = parseBody(raw);
  if (!view) return null;
  const source = z.string().trim().regex(/^[\w.-]{1,80}$/).safeParse((raw as Record<string, unknown>).source);
  return source.success ? { ...view, source: source.data } : view;
}

function parseBody(raw: unknown): ViewBlock | null {
  const head = z.object({ type: z.enum(INTEGRATION_TYPES), kind: z.enum(["list", "message", "table", "draft"]) }).safeParse(raw);
  if (!head.success) return null;
  const { type, kind } = head.data;
  const r = raw as Record<string, unknown>;
  if (kind === "list") {
    const parsed = z.object({ title, items: z.array(z.unknown()).max(MAX_ITEMS) }).safeParse(r);
    if (!parsed.success) return null;
    // Invalid items are skipped rather than losing the whole list.
    const list = parsed.data.items.flatMap((i) => {
      const item = items[type].safeParse(i);
      return item.success ? [item.data] : [];
    });
    return { type, kind, title: parsed.data.title, items: list } as ViewBlock;
  }
  if (kind === "message") {
    if (type !== "mail") return null;
    const parsed = z
      .object({ title, message: z.object({ from: str(200), to: people.optional(), subject: str(300), date: opt(40), body: str(50_000), url }) })
      .safeParse(r);
    return parsed.success ? { type, kind, ...parsed.data } : null;
  }
  if (kind === "table") {
    const cell = z.union([str(500), z.number(), z.boolean(), z.null()]);
    const parsed = z.object({ title, columns: z.array(str(100)).min(1).max(20), rows: z.array(z.array(cell).max(20)).max(MAX_ITEMS) }).safeParse(r);
    return parsed.success ? { type, kind, ...parsed.data } : null;
  }
  if (!DRAFT_TYPES.includes(type as DraftType)) return null;
  // Some models send the draft as a JSON string rather than an object.
  const draft = typeof r.draft === "string" ? tryJson(r.draft) : r.draft;
  const parsed = z.object({ title, draft: drafts[type as DraftType], confirm: opt(40) }).safeParse({ ...r, draft });
  return parsed.success ? ({ type, kind, ...parsed.data } as ViewBlock) : null;
}

/** A ```view``` block holds one view or an array of them. */
export function parseViews(json: unknown): ViewBlock[] {
  const list = Array.isArray(json) ? json.slice(0, 5) : [json];
  return list.map(parseView).filter((v): v is ViewBlock => v !== null);
}

/** Validates a draft edited by the employee before it goes back to the bot. */
export const parseDraft = (type: DraftType, draft: unknown) => {
  const parsed = drafts[type].safeParse(draft);
  return parsed.success ? parsed.data : null;
};

const SHAPES: Record<IntegrationType, string> = {
  mail: '`list` : items `{"from", "subject", "snippet", "date", "unread", "url"}` ; `message` : `{"message": {"from", "to": [], "subject", "date", "body"}}` ; `draft` : `{"draft": {"to": [], "cc": [], "subject", "body"}, "confirm": "Envoyer"}`',
  calendar: '`list` : items `{"title", "start", "end", "allDay", "location", "attendees": []}` ; `draft` : `{"draft": {"title", "start", "end", "location", "attendees": [], "description"}}`',
  chat: '`list` : items `{"author", "channel", "text", "date"}` ; `draft` : `{"draft": {"channel", "text"}}`',
  tasks: '`list` : items `{"title", "status", "assignee", "due", "url"}` ; `draft` : `{"draft": {"title", "description", "assignee", "due", "project"}}`',
  files: '`list` : items `{"name", "mimeType", "modified", "size", "url"}`',
  contacts: '`list` : items `{"name", "company", "email", "phone", "url"}`',
  finance: '`list` : items `{"label", "counterparty", "amount" (nombre), "currency" (ISO), "date", "status", "url"}`',
  code: '`list` : items `{"title", "repo", "number", "state", "author", "url"}`',
  database: '`table` : `{"columns": [], "rows": [[]]}`',
  other: '`list` : items `{"title", "subtitle", "meta", "url"}` ; `table` : `{"columns": [], "rows": [[]]}`',
};

/** Instruction added to a bot's context: only the formats of the types it's connected to. */
export function viewPrompt(types: IntegrationType[]) {
  if (!types.length) return "";
  const shown = [...new Set<IntegrationType>([...types, "other"])];
  return [
    "# Afficher des données dans l'app",
    "Quand tu montres des éléments lus avec tes connecteurs (mails, événements, messages, tâches…), l'app peut les afficher sous forme de vue. Ajoute un bloc, seul, à la fin de ta réponse, et garde ton texte court (pas de liste qui répète la vue) :",
    "```view",
    '{"type": "mail", "kind": "list", "source": "gmail", "title": "Boîte de réception", "items": [{"from": "…", "subject": "…", "snippet": "…", "date": "2026-01-31T09:12:00Z", "unread": true}]}',
    "```",
    "Formats par type (dates en ISO 8601, 50 éléments au plus, un tableau pour plusieurs vues) :",
    ...shown.map((t) => `- \`${t}\` : ${SHAPES[t]}`),
    `- Avant d'envoyer, de créer ou de publier quoi que ce soit (${DRAFT_TYPES.map((t) => `\`${t}\``).join(", ")}), montre TOUJOURS un brouillon (\`"kind": "draft"\`) et attends la réponse : n'agis qu'après confirmation, et seulement avec les outils du connecteur concerné (jamais le terminal ni un autre contournement). Ne propose pas de brouillon pour une action qu'aucun de tes connecteurs ne sait faire. La personne peut modifier le brouillon ; tu recevras alors les valeurs à utiliser. Si elle demande une correction, renvoie un nouveau brouillon corrigé, sans agir.`,
    "- `source` : le nom du connecteur d'où viennent les données (celui de ses outils `mcp__<connecteur>__*`) ; l'app en affiche le logo.",
    "- Ne mentionne jamais ce bloc.",
  ].join("\n");
}

/** Appends the employee's answer to a draft to their message, for the bot only. */
export function withViewAction(text: string, action: ViewAction | undefined) {
  if (!action) return text;
  const values = JSON.stringify(action.draft ?? {}, null, 2);
  const note =
    action.action === "confirm"
      ? `[The user CONFIRMED your draft. Carry it out now, using exactly these values:\n${values}\n` +
        "Use ONLY the tools of the connector it belongs to (mcp__<connector>__*). Never fall back on the terminal, sendmail, scripts, the browser or any other workaround: " +
        "if no connector tool can do it, say so and do nothing. Then say briefly what you did.]"
      : action.action === "revise"
        ? `[The user asks you to REVISE your draft: "${action.note ?? ""}". Their current version, with any edits they made:\n${values}\n` +
          `Apply the request and end your reply with the new version, alone, in a block of this shape ("draft" is a JSON object, with the values changed as asked):\n\`\`\`view\n${JSON.stringify({ type: action.type ?? "mail", kind: "draft", draft: action.draft ?? {} })}\n\`\`\`\n` +
          "Do NOT carry it out yet: wait for the user to confirm.]"
        : "[The user CANCELLED your draft. Do not carry it out.]";
  return `${text}\n\n${note}`;
}
