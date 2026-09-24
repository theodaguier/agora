import { locale } from "./i18n";
import type { Inbox, InboxItem } from "./inbox";
import type { Task, TaskPatch } from "./tasks";
import type { AgentSummary, ConversationDetail, ConversationSummary, Message, Person, SessionUser } from "./types";
import { latestRelease } from "./whats-new";

/*
 * Demo space, for App Review and anyone curious: Agora is self-hosted, so there is no public
 * server to sign in to. Typing "demo" as the server address resolves to DEMO_URL, and every
 * request to it is answered here, in memory, instead of over the network. The bots answer
 * with canned replies streamed through the same events as a real instance (useEvents).
 */

export const DEMO_URL = "https://demo";
export const DEMO_EMAIL = "review@demo.agora";
export const DEMO_PASSWORD = "agora-demo";

export const isDemo = (url: string) => url === DEMO_URL || url.startsWith(`${DEMO_URL}/`);

const fr = locale === "fr";
const l = (en: string, frText: string) => (fr ? frText : en);

/* ---------- Data ---------- */

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const today = (days = 0) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const me: SessionUser & Record<string, unknown> = {
  id: "u-me",
  name: "Alex Martin",
  email: DEMO_EMAIL,
  image: null,
  role: "member",
  firstName: "Alex",
  lastName: "Martin",
  title: l("Product manager", "Product manager"),
  username: "alex",
  bio: "",
  createdAt: ago(60 * 24 * 30),
};

/** Read when asked, not at load: whats-new.ts imports api.ts, which imports this file. */
const session = () => ({ ...me, releaseNotesSeen: latestRelease?.version });

const camille: Person = { id: "u-camille", name: "Camille Durand", image: null, username: "camille", title: l("Designer", "Designer") };
const samir: Person = { id: "u-samir", name: "Samir Benali", image: null, username: "samir", title: l("Engineer", "Développeur") };
const mePerson: Person = { id: me.id, name: me.name, image: null, username: "alex", title: me.title as string };
const people = [mePerson, camille, samir];

const atlas: AgentSummary = { id: "a-atlas", name: "Atlas", avatar: { shape: "bean", color: "#2f7cf6" } };
const nova: AgentSummary = { id: "a-nova", name: "Nova", avatar: { shape: "cloud", color: "#9a7cf0" } };
const agents = [atlas, nova];

type Conv = Omit<ConversationDetail, "turns"> & { unread: boolean; messages: Message[] };

let seq = 0;
const id = (prefix: string) => `${prefix}-${++seq}`;

const userAuthor = (p: Person) => ({ kind: "user" as const, id: p.id, name: p.name, image: p.image });
const agentAuthor = (a: AgentSummary) => ({ kind: "agent" as const, id: a.id, name: a.name, avatar: a.avatar });

const msg = (author: Person | AgentSummary, text: string, minutesAgo: number, data: Message["data"] = null): Message => ({
  id: id("m"),
  kind: "avatar" in author ? "bot" : "user",
  text,
  data,
  createdAt: ago(minutesAgo),
  author: "avatar" in author ? agentAuthor(author) : userAuthor(author),
});

const conversations: Conv[] = [
  {
    id: "c-launch",
    kind: "group",
    title: l("Autumn launch", "Lancement d'automne"),
    createdBy: camille.id,
    members: [mePerson, camille, samir],
    agents: [atlas],
    unread: true,
    messages: [
      msg(camille, l("The new onboarding screens are ready for review.", "Les nouveaux écrans d'onboarding sont prêts pour relecture."), 180),
      msg(samir, l("Great, I'll plug them in tomorrow morning.", "Top, je les intègre demain matin."), 170),
      msg(
        atlas,
        l(
          "I created the tasks for the launch checklist:\n\n- **Review onboarding screens** — Alex\n- **Integrate the screens** — Samir\n- **Write the release notes** — Alex",
          "J'ai créé les tâches de la checklist de lancement :\n\n- **Relire les écrans d'onboarding** — Alex\n- **Intégrer les écrans** — Samir\n- **Rédiger les notes de version** — Alex",
        ),
        160,
      ),
      msg(camille, l("@alex can you take a look before Friday?", "@alex tu peux jeter un œil avant vendredi ?"), 25, { mentions: [me.id] }),
    ],
  },
  {
    id: "c-atlas",
    kind: "direct",
    title: null,
    createdBy: me.id,
    members: [mePerson],
    agents: [atlas],
    unread: false,
    messages: [
      msg(mePerson, l("Summarize this week's customer feedback.", "Résume les retours clients de la semaine."), 300),
      msg(
        atlas,
        l(
          "Here is this week's summary:\n\n1. **Onboarding** — 4 customers found the first steps too long.\n2. **Mobile app** — notifications are the most appreciated feature.\n3. **Requests** — a calendar export came up twice.\n\nWant me to turn these into tasks?",
          "Voici la synthèse de la semaine :\n\n1. **Onboarding** — 4 clients trouvent les premières étapes trop longues.\n2. **App mobile** — les notifications sont la fonction la plus appréciée.\n3. **Demandes** — un export calendrier est revenu deux fois.\n\nTu veux que j'en fasse des tâches ?",
        ),
        298,
      ),
    ],
  },
  {
    id: "c-camille",
    kind: "direct",
    title: null,
    createdBy: camille.id,
    members: [mePerson, camille],
    agents: [],
    unread: false,
    messages: [
      msg(camille, l("Lunch at 12:30?", "Déj à 12h30 ?"), 400),
      msg(mePerson, l("Sounds good!", "Parfait !"), 395),
    ],
  },
  {
    id: "c-nova",
    kind: "direct",
    title: null,
    createdBy: me.id,
    members: [mePerson],
    agents: [nova],
    unread: false,
    messages: [
      msg(nova, l("Hi Alex, I'm Nova. I can research topics and draft documents for you.", "Salut Alex, moi c'est Nova. Je peux faire des recherches et rédiger des documents pour toi."), 2000),
    ],
  },
];

const task = (t: Partial<Task> & Pick<Task, "title" | "status">): Task => ({
  id: id("t"),
  description: "",
  priority: "normal",
  dueOn: null,
  assignees: [{ id: me.id, name: me.name, image: null, current: false }],
  assignedBy: { kind: "agent", id: atlas.id, name: atlas.name, avatar: atlas.avatar },
  requestedBy: { id: camille.id, name: camille.name },
  conversationId: "c-launch",
  completedAt: null,
  createdAt: ago(160),
  canEdit: true,
  canDelete: true,
  ...t,
});

const tasks: Task[] = [
  task({ title: l("Review onboarding screens", "Relire les écrans d'onboarding"), status: "in_progress", priority: "high", dueOn: today(2), assignees: [{ id: me.id, name: me.name, image: null, current: true }] }),
  task({ title: l("Write the release notes", "Rédiger les notes de version"), status: "todo", dueOn: today(4) }),
  task({ title: l("Integrate the screens", "Intégrer les écrans"), status: "todo", assignees: [{ id: samir.id, name: samir.name, image: null, current: false }] }),
  task({ title: l("Plan the customer interviews", "Planifier les entretiens clients"), status: "done", completedAt: ago(60 * 26), conversationId: "c-atlas" }),
];

const inbox: InboxItem[] = [
  {
    id: "i-1",
    kind: "mention",
    text: conversations[0]!.messages[3]!.text,
    read: false,
    createdAt: conversations[0]!.messages[3]!.createdAt,
    conversationId: "c-launch",
    messageId: conversations[0]!.messages[3]!.id,
    task: null,
    actor: { kind: "user", ...camille, image: null },
  },
  {
    id: "i-2",
    kind: "task.assigned",
    text: tasks[0]!.title,
    read: true,
    createdAt: ago(160),
    conversationId: "c-launch",
    messageId: null,
    task: { id: tasks[0]!.id, title: tasks[0]!.title, status: tasks[0]!.status },
    actor: { kind: "agent", ...atlas },
  },
];

/* ---------- Events (read by useEvents in place of the SSE stream) ---------- */

type Emit = (type: string, data: string) => void;
const listeners = new Set<Emit>();
const emit = (event: Record<string, unknown>) => {
  for (const listener of listeners) listener("message", JSON.stringify(event));
};

/** The demo's event stream: "ready", then events until `signal` aborts. */
export function demoEvents(signal: AbortSignal, onEvent: Emit) {
  return new Promise<void>((resolve) => {
    listeners.add(onEvent);
    onEvent("ready", "");
    signal.addEventListener("abort", () => {
      listeners.delete(onEvent);
      resolve();
    });
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const REPLIES = [
  l(
    "Sure! Here's what I suggest:\n\n1. Start with the task due soonest.\n2. Share a draft with the team in **Autumn launch**.\n3. I'll send you a reminder tomorrow morning.",
    "Bien sûr ! Voici ce que je propose :\n\n1. Commencer par la tâche la plus urgente.\n2. Partager un premier jet avec l'équipe dans **Lancement d'automne**.\n3. Je te fais un rappel demain matin.",
  ),
  l(
    "Done. I added it to your tasks and I'll keep the team posted in the conversation.",
    "C'est fait. Je l'ai ajouté à tes tâches et je tiens l'équipe au courant dans la conversation.",
  ),
  l(
    "Good question. In this demo space I answer with sample replies, but on your own Agora server I use your organization's tools and knowledge.",
    "Bonne question. Dans cet espace de démo je réponds avec des exemples, mais sur ton propre serveur Agora j'utilise les outils et les connaissances de ton organisation.",
  ),
];
let replyIndex = 0;

/** A bot's reply, streamed word by word like a real turn. */
async function botReply(conv: Conv, agent: AgentSummary) {
  const turnId = id("turn");
  const text = REPLIES[replyIndex++ % REPLIES.length]!;
  await wait(500);
  emit({ type: "agent.status", agentId: agent.id, working: true });
  emit({ type: "bot.started", conversationId: conv.id, turnId, agentId: agent.id, requestedBy: me.id });
  for (const word of text.split(/(?<=\s)/)) {
    await wait(35);
    emit({ type: "bot.delta", conversationId: conv.id, turnId, text: word });
  }
  const message = msg(agent, text, 0);
  conv.messages.push(message);
  emit({ type: "message.created", conversationId: conv.id, message });
  emit({ type: "bot.done", conversationId: conv.id, turnId });
  emit({ type: "agent.status", agentId: agent.id, working: false });
}

/** A colleague's short answer in a direct conversation, after "typing…". */
async function colleagueReply(conv: Conv, person: Person) {
  await wait(1200);
  emit({ type: "typing", conversationId: conv.id, userId: person.id, name: person.name });
  await wait(2000);
  const message = msg(person, l("Got it, thanks! 👍", "Bien reçu, merci ! 👍"), 0);
  conv.messages.push(message);
  emit({ type: "message.created", conversationId: conv.id, message });
}

/* ---------- Routes ---------- */

/** Thrown with the HTTP status a real instance would answer; api.ts turns it into an ApiError. */
export class DemoError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const summary = (c: Conv): ConversationSummary => {
  const last = c.messages.at(-1);
  return {
    id: c.id,
    kind: c.kind,
    title: c.title,
    members: c.members,
    agents: c.agents,
    preview: last ? { text: last.text, event: null, author: last.author?.name ?? null, fromMe: last.author?.id === me.id } : null,
    lastAt: last?.createdAt ?? ago(0),
    unread: c.unread,
  };
};

const find = <T extends { id: string }>(list: T[], key: string | undefined) => {
  const found = list.find((x) => x.id === key);
  if (!found) throw new DemoError(404, l("Not found.", "Introuvable."));
  return found;
};

const profile = (p: Person) => ({ ...p, bio: "", email: `${p.username}@demo.agora`, createdAt: ago(60 * 24 * 90), currentTask: null });

function directWith(body: { agentId?: string; userId?: string }) {
  const existing = conversations.find(
    (c) => c.kind === "direct" && (body.agentId ? c.agents.some((a) => a.id === body.agentId) : c.members.some((m) => m.id === body.userId)),
  );
  if (existing) return { id: existing.id };
  const conv: Conv = {
    id: id("c"),
    kind: "direct",
    title: null,
    createdBy: me.id,
    members: body.userId ? [mePerson, find(people, body.userId)] : [mePerson],
    agents: body.agentId ? [find(agents, body.agentId)] : [],
    unread: false,
    messages: [],
  };
  conversations.unshift(conv);
  return { id: conv.id };
}

function send(conv: Conv, input: { text: string; mentions?: string[]; replyTo?: string }) {
  const message = msg(mePerson, input.text, 0, input.mentions?.length ? { mentions: input.mentions } : null);
  conv.messages.push(message);
  emit({ type: "message.created", conversationId: conv.id, message });
  // In a direct conversation the bot always answers; in a group, when it is named.
  const named = conv.agents.filter((a) => conv.kind === "direct" || input.mentions?.includes(a.id) || input.text.toLowerCase().includes(`@${a.name.toLowerCase()}`));
  for (const agent of named) void botReply(conv, agent);
  const colleague = conv.kind === "direct" && !conv.agents.length ? conv.members.find((m) => m.id !== me.id) : undefined;
  if (colleague) void colleagueReply(conv, colleague);
  return message;
}

function route(method: string, path: string, query: URLSearchParams, body: Record<string, unknown>): unknown {
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  const [head, second, third] = parts;
  const get = method === "GET";

  switch (head) {
    case "org":
      return { name: "Agora Demo", locale, image: null };
    case "mobile":
      if (second === "sign-in") {
        const ok = String(body.email ?? "").trim().toLowerCase() === DEMO_EMAIL && body.password === DEMO_PASSWORD;
        if (!ok) throw new DemoError(401, "invalid");
        return { token: "demo", user: { id: me.id, name: me.name, email: me.email, image: null } };
      }
      if (second === "devices") return get ? [] : {};
      if (second === "exchange" || second === "two-factor") throw new DemoError(400, "invalid");
      return {};
    case "auth":
      return { user: session() };
    case "me":
      if (second === "version") return { app: latestRelease?.version ?? "demo", hermes: "demo" };
      if (!second && method === "PATCH") Object.assign(me, body);
      return get ? session() : {};
    case "presence":
      return { users: { [camille.id]: { online: true, lastSeenAt: ago(0) }, [samir.id]: { online: false, lastSeenAt: ago(90) } }, workingAgents: [], schedules: {} };
    case "availability":
      return get ? { timezone: null, orgTimezone: "Europe/Paris", hours: null, dndUntil: null, absences: [] } : {};
    case "users":
      return second ? profile(find(people, second)) : people.filter((p) => p.id !== me.id);
    case "agents":
      if (!second) return agents;
      if (third === "activity") return { turns: [], elsewhere: 0, routines: [] };
      return { ...find(agents, second), createdAt: ago(60 * 24 * 60), access: true };
    case "digest":
      return get && !second ? null : {};
    case "inbox": {
      if (second === "read") {
        const ids = body.ids as string[] | undefined;
        for (const item of inbox) if (!ids || ids.includes(item.id)) item.read = body.read !== false;
        emit({ type: "inbox.changed" });
        return {};
      }
      const items = query.get("unread") ? inbox.filter((i) => !i.read) : inbox;
      return { items, unread: inbox.filter((i) => !i.read).length } satisfies Inbox;
    }
    case "tasks": {
      if (!second) {
        if (method === "POST") {
          const input = body as { title: string; assigneeIds: string[]; dueOn: string | null; priority: Task["priority"] };
          const created = task({
            title: input.title,
            status: "todo",
            dueOn: input.dueOn,
            priority: input.priority,
            assignees: people.filter((p) => input.assigneeIds.includes(p.id)).map((p) => ({ id: p.id, name: p.name, image: null, current: false })),
            assignedBy: { kind: "user", id: me.id, name: me.name, image: null },
            requestedBy: null,
            conversationId: null,
            createdAt: ago(0),
          });
          tasks.unshift(created);
          emit({ type: "tasks.changed", userIds: created.assignees.map((a) => a.id) });
          return [created];
        }
        const user = query.get("user");
        const agent = query.get("agent");
        return tasks.filter((t) =>
          agent ? t.assignedBy?.kind === "agent" && t.assignedBy.id === agent : user ? t.assignees.some((a) => a.id === user) : true,
        );
      }
      if (second === "current") return {};
      const t = find(tasks, second);
      if (method === "PATCH") {
        const patch = body as TaskPatch;
        Object.assign(t, patch);
        if (patch.assigneeIds) t.assignees = people.filter((p) => patch.assigneeIds!.includes(p.id)).map((p) => ({ id: p.id, name: p.name, image: null, current: false }));
        if (patch.status) t.completedAt = patch.status === "done" ? ago(0) : null;
        emit({ type: "tasks.changed", userIds: t.assignees.map((a) => a.id) });
      }
      if (method === "DELETE") {
        tasks.splice(tasks.indexOf(t), 1);
        emit({ type: "tasks.changed", userIds: t.assignees.map((a) => a.id) });
        return {};
      }
      return t;
    }
    case "conversations": {
      if (!second) return conversations.map(summary).sort((a, b) => b.lastAt.localeCompare(a.lastAt));
      if (second === "direct") return directWith(body);
      if (second === "group") {
        const conv: Conv = {
          id: id("c"),
          kind: "group",
          title: (body.title as string | undefined) ?? null,
          createdBy: me.id,
          members: [mePerson, ...people.filter((p) => (body.userIds as string[] | undefined)?.includes(p.id))],
          agents: agents.filter((a) => (body.agentIds as string[] | undefined)?.includes(a.id)),
          unread: false,
          messages: [],
        };
        conversations.unshift(conv);
        return { id: conv.id };
      }
      const conv = find(conversations, second);
      switch (third) {
        case undefined:
          if (method === "DELETE") {
            conversations.splice(conversations.indexOf(conv), 1);
            return {};
          }
          return { id: conv.id, kind: conv.kind, title: conv.title, createdBy: conv.createdBy, members: conv.members, agents: conv.agents, turns: [] };
        case "messages":
          return method === "POST" ? send(conv, body as { text: string; mentions?: string[] }) : conv.messages;
        case "read":
          conv.unread = false;
          emit({ type: "read", conversationId: conv.id, userId: me.id });
          return {};
        case "pins":
        case "routines":
          return get ? [] : {};
        case "commands":
          return { skills: [], mcp: [] };
        case "models":
          return { provider: "demo", defaultModel: "demo", models: [{ id: "demo", reasoning: false }], others: [], defaultAllowed: true, selected: null, selectedProvider: null, claudeCode: null };
        case "context":
          return { engine: "hermes", model: "demo", generation: 1, compacted: false, session: null };
        default:
          return {};
      }
    }
    case "usage": {
      if (second === "prices") return [];
      const zero = { tokens: 0, inputTokens: 0, outputTokens: 0, cacheTokens: 0, apiCalls: 0, cost: 0 };
      return { range: query.get("range") ?? "30d", bucket: "day", scope: "self", totals: zero, series: [], byUser: [], byAgent: [], byTask: [], byModel: [], options: null };
    }
    case "mcp-requests":
    case "skill-requests":
      return get && !second ? [] : {};
    case "integrations":
      return {};
  }
  if (get) throw new DemoError(404, l("Not available in the demo.", "Indisponible dans la démo."));
  return {};
}

/** Answers a request made to DEMO_URL, as `fetch` + JSON parsing would. */
export async function demoRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const { pathname, searchParams } = new URL(url);
  const path = pathname.replace(/^\/api/, "");
  let body: Record<string, unknown> = {};
  try {
    body = typeof init.body === "string" ? JSON.parse(init.body) : {};
  } catch {}
  await wait(120);
  // A copy, so the screens never hold the store's own objects.
  return JSON.parse(JSON.stringify(route(init.method ?? "GET", path, searchParams, body))) as T;
}
