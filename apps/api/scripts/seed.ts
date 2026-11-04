/**
 * Local demo data, to see every screen full: colleagues, bots of every colour, direct and group
 * conversations (markdown, code, tables, tool traces, choices, events), code sessions in every state
 * (running, waiting, set aside, done, merged, stopped, failed), tasks, inbox, an absence and usage.
 *
 *   cd apps/api && bun scripts/seed.ts            # seeds for the first admin
 *   SEED_OWNER=me@example.com bun scripts/seed.ts  # for another account
 *
 * Idempotent: everything it writes has an id starting with `seed-`, deleted before each run. Never run
 * it against production. Sessions seeded as running or waiting become stopped at the API's next start
 * (recoverCodeSessions), as real ones would.
 */
import { eq, inArray, like } from "drizzle-orm";
import type { CodeGit, CodeStep, CodeTodo, CodeUsage, ConversationEvent } from "@agora/core";
import { db, schema } from "../src/db";

const {
  user,
  agent,
  agentAccess,
  conversation,
  conversationMember,
  conversationAgent,
  message,
  codeSession,
  task,
  taskAssignee,
  notification,
  absence,
  usageEvent,
} = schema;

if (/hermes\.e-do\.studio|amazonaws|neon\.tech|supabase/.test(process.env.DATABASE_URL ?? "")) throw new Error("seed: refusing to run on what looks like a production database");

const NOW = Date.now();
const ago = (minutes: number) => new Date(NOW - minutes * 60_000);
const H = 60;
const D = 24 * H;
const day = (offset: number) => new Date(NOW + offset * D).toISOString().slice(0, 10);

/* ---------- Owner ---------- */

const ownerEmail = process.env.SEED_OWNER;
const [owner] = ownerEmail
  ? await db.select().from(user).where(eq(user.email, ownerEmail))
  : await db.select().from(user).where(eq(user.role, "admin")).limit(1);
if (!owner) throw new Error("seed: no owner account (sign in once, or set SEED_OWNER)");
const ME = owner.id;

/* ---------- Clean the previous run ---------- */

const seedIds = (rows: { id: string }[]) => rows.map((r) => r.id);
const oldConvs = seedIds(await db.select({ id: conversation.id }).from(conversation).where(like(conversation.id, "seed-%")));
if (oldConvs.length) {
  await db.delete(notification).where(inArray(notification.conversationId, oldConvs));
  await db.delete(conversation).where(inArray(conversation.id, oldConvs));
}
await db.delete(notification).where(like(notification.id, "seed-%"));
await db.delete(task).where(like(task.id, "seed-%"));
await db.delete(usageEvent).where(like(usageEvent.id, "seed-%"));
await db.delete(absence).where(like(absence.id, "seed-%"));
await db.delete(agent).where(like(agent.id, "seed-%"));
await db.delete(user).where(like(user.id, "seed-%"));

/* ---------- People ---------- */

const people = [
  { id: "seed-marie", first: "Marie", last: "Dupont", title: "Designer produit" },
  { id: "seed-lucas", first: "Lucas", last: "Martin", title: "Développeur" },
  { id: "seed-ines", first: "Inès", last: "Benali", title: "Comptabilité" },
  { id: "seed-hugo", first: "Hugo", last: "Lefèvre", title: "Commercial" },
  { id: "seed-chloe", first: "Chloé", last: "Moreau", title: "Cheffe de projet" },
  { id: "seed-karim", first: "Karim", last: "Haddad", title: "Ops" },
] as const;
type PersonId = (typeof people)[number]["id"];
await db.insert(user).values(
  people.map((p, i) => ({
    id: p.id,
    name: `${p.first} ${p.last}`,
    firstName: p.first,
    lastName: p.last,
    email: `${p.first.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()}@seed.agora.test`,
    emailVerified: true,
    role: "user",
    title: p.title,
    username: p.first.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase(),
    lastSeenAt: ago([3, 40, 2 * H, 20, 5 * D, 8][i]!),
    dndUntil: p.id === "seed-lucas" ? new Date(NOW + 2 * H * 60_000) : null,
  })),
);
const name = (id: PersonId) => people.find((p) => p.id === id)!.first;
await db.insert(absence).values({ id: "seed-absence-hugo", userId: "seed-hugo", kind: "vacation", startOn: day(-1), endOn: day(6), createdBy: "seed-hugo" });

/* ---------- Bots: one per palette colour ---------- */

const bots = [
  { id: "seed-atelier", name: "Atelier", color: "#f26b1d" },
  { id: "seed-veille", name: "Veille", color: "#2f7cf6" },
  { id: "seed-tresorerie", name: "Trésorerie", color: "#1fa855" },
  { id: "seed-revue", name: "Revue", color: "#9a6a4b" },
  { id: "seed-dev", name: "Dev", color: "#14a89a" },
  { id: "seed-hermes", name: "Hermes", color: "#9a7cf0" },
  { id: "seed-archiviste", name: "Archiviste", color: "#9ca3af" },
  { id: "seed-garde", name: "Garde", color: "#e5484d" },
] as const;
type BotId = (typeof bots)[number]["id"];
await db.insert(agent).values(bots.map((b) => ({ id: b.id, name: b.name, hermesProfile: b.id, avatarShape: "bean" as const, avatarColor: b.color })));
// The owner reaches every seeded bot (admins too only see the bots they were given); colleagues the first four.
await db.insert(agentAccess).values([...bots.map((b) => ({ userId: ME, agentId: b.id })), ...people.flatMap((p) => bots.slice(0, 4).map((b) => ({ userId: p.id, agentId: b.id })))]);
const botName = (id: BotId) => bots.find((b) => b.id === id)!.name;

/* ---------- Conversations ---------- */

type Msg =
  | { at: number; me: string; data?: Record<string, unknown> }
  | { at: number; from: PersonId; text: string; data?: Record<string, unknown> }
  | { at: number; bot: BotId; text: string; data?: Record<string, unknown> }
  | { at: number; event: ConversationEvent };

let n = 0;
async function conv(opts: { id: string; kind: "direct" | "group"; title?: string; people?: PersonId[]; bots?: BotId[]; unread?: boolean; messages: Msg[] }) {
  const members: string[] = [ME, ...(opts.people ?? [])];
  const agents = opts.bots ?? [];
  const keys = [...members.map((u) => `u:${u}`), ...agents.map((a) => `a:${a}`)].sort();
  const created = ago(Math.max(...opts.messages.map((m) => m.at)) + 5);
  await db.insert(conversation).values({
    id: opts.id,
    kind: opts.kind,
    title: opts.title ?? null,
    directKey: opts.kind === "direct" ? keys.join("|") : null,
    createdBy: ME,
    createdAt: created,
    updatedAt: ago(Math.min(...opts.messages.map((m) => m.at))),
  });
  const last = ago(Math.min(...opts.messages.map((m) => m.at)));
  await db.insert(conversationMember).values(
    members.map((u) => ({ conversationId: opts.id, userId: u, joinedAt: created, lastReadAt: u === ME && opts.unread ? new Date(last.getTime() - 60_000) : last })),
  );
  if (agents.length) await db.insert(conversationAgent).values(agents.map((a) => ({ conversationId: opts.id, agentId: a, addedBy: ME, createdAt: created })));
  await db.insert(message).values(
    opts.messages.map((m) => {
      const id = `seed-m${++n}`;
      const createdAt = ago(m.at);
      if ("event" in m) return { id, conversationId: opts.id, kind: "event" as const, text: "", data: { event: m.event }, createdAt };
      if ("bot" in m) return { id, conversationId: opts.id, kind: "bot" as const, authorAgentId: m.bot, text: m.text, data: { turn: { id: `seed-turn-${n}`, startedAt: new Date(createdAt.getTime() - 20_000).toISOString() }, ...m.data }, createdAt };
      if ("from" in m) return { id, conversationId: opts.id, kind: "user" as const, authorUserId: m.from, text: m.text, data: m.data ?? null, createdAt };
      return { id, conversationId: opts.id, kind: "user" as const, authorUserId: ME, text: m.me, data: m.data ?? null, createdAt };
    }),
  );
}

/* ---------- Code sessions ---------- */

const repoApp = "theodaguier/e-do-bots";
const repoSite = "e-do/site-vitrine";
const repoBilling = "e-do/facturation";

const git = (repo: string, branch: string, o: Partial<CodeGit> = {}): CodeGit => ({
  repo,
  branch,
  base: "main",
  changes: 0,
  ahead: 0,
  behind: 0,
  pushed: true,
  lastCommit: { sha: "a1b2c3d", subject: "wip" },
  pr: null,
  github: true,
  ...o,
});
const pr = (number: number, title: string, state: "open" | "closed" | "merged", repo = repoApp) => ({ number, url: `https://github.com/${repo}/pull/${number}`, title, state, draft: false, base: "main" });
const usage = (cost: number, runs: number, minutes: number): CodeUsage => ({
  inputTokens: Math.round(cost * 90_000),
  outputTokens: Math.round(cost * 12_000),
  cacheReadTokens: Math.round(cost * 400_000),
  cacheWriteTokens: Math.round(cost * 30_000),
  costUsd: cost,
  runs,
  turns: runs * 14,
  durationMs: minutes * 60_000,
});
let s = 0;
const step = {
  user: (text: string, by: string | null = null): CodeStep => ({ id: `s${++s}`, kind: "user", text, by }),
  text: (text: string): CodeStep => ({ id: `s${++s}`, kind: "text", text }),
  tool: (name: string, title: string, o: { input?: string; output?: string; status?: "running" | "done" | "error" } = {}): CodeStep => ({ id: `s${++s}`, kind: "tool", name, title, status: o.status ?? "done", input: o.input, output: o.output }),
  git: (action: "clone" | "commit" | "push" | "pr" | "merge", text: string, ok = true): CodeStep => ({ id: `s${++s}`, kind: "git", action, ok, text, by: null }),
  notice: (code: "stopped" | "restart" | "error", text?: string): CodeStep => ({ id: `s${++s}`, kind: "notice", code, text }),
};
const todos = (...items: [string, CodeTodo["status"]][]): CodeTodo[] => items.map(([content, status], i) => ({ id: String(i + 1), content, status }));

type SessionSeed = {
  id: string;
  conv: string;
  bot: BotId | null;
  title: string;
  status: "running" | "waiting" | "idle" | "done" | "stopped" | "failed";
  priority: "urgent" | "high" | "medium" | "low" | "none";
  engine?: "claude" | "codex" | "cursor";
  repo: string | null;
  git?: CodeGit | null;
  issue?: { number: number; title: string; state: "open" | "closed" };
  parked?: boolean;
  model?: string;
  todos?: CodeTodo[];
  steps: CodeStep[];
  usage?: CodeUsage;
  result?: string;
  at: number;
  age: number;
};

const sessions: SessionSeed[] = [
  {
    id: "seed-cs-webhooks",
    conv: "seed-c-dev",
    bot: "seed-dev",
    title: "Migration des webhooks Stripe",
    status: "running",
    priority: "high",
    repo: repoBilling,
    model: "claude-opus-4-5",
    git: git(repoBilling, "feat/stripe-webhooks-v2", { changes: 4, ahead: 2, pushed: false, files: [
      { path: "src/webhooks/stripe.ts", state: "modified", added: 84, removed: 31 },
      { path: "src/webhooks/verify.ts", state: "added", added: 42, removed: 0 },
      { path: "src/webhooks/stripe.test.ts", state: "modified", added: 57, removed: 4 },
      { path: "src/legacy/stripe-v1.ts", state: "deleted", added: 0, removed: 118 },
    ] }),
    issue: { number: 212, title: "Passer les webhooks Stripe sur l'API 2026-09", state: "open" },
    todos: todos(["Lister les événements reçus en production", "completed"], ["Vérifier la signature des webhooks", "completed"], ["Migrer invoice.paid et invoice.payment_failed", "in_progress"], ["Supprimer l'ancien handler v1", "pending"], ["Lancer les tests d'intégration", "pending"]),
    steps: [
      step.user("Migre nos webhooks Stripe vers l'API 2026-09. Garde la compatibilité le temps de la bascule.", "Dev"),
      step.git("clone", "Worktree prêt sur feat/stripe-webhooks-v2"),
      step.text("Je commence par lister les événements qu'on reçoit vraiment, pour ne migrer que ceux-là."),
      step.tool("Grep", "stripe.webhooks.constructEvent", { output: "src/webhooks/stripe.ts:18\nsrc/legacy/stripe-v1.ts:42" }),
      step.tool("Read", "src/webhooks/stripe.ts"),
      step.tool("Bash", "pnpm test webhooks", { input: "pnpm test webhooks", output: "✓ 18 tests passent\n✗ 2 échecs : invoice.payment_failed" }),
      step.text("Deux tests échouent sur `invoice.payment_failed` : le champ `attempt_count` a changé de place. Je corrige le mapping."),
      step.tool("Edit", "src/webhooks/stripe.ts", { status: "running" }),
    ],
    usage: usage(3.84, 3, 41),
    at: 2,
    age: 3 * H,
  },
  {
    id: "seed-cs-dark",
    conv: "seed-c-dev",
    bot: "seed-dev",
    title: "Mode sombre du tableau de bord",
    status: "waiting",
    priority: "urgent",
    repo: repoApp,
    git: git(repoApp, "feat/dashboard-dark", { changes: 7, ahead: 1, files: [{ path: "apps/web/src/index.css", state: "modified", added: 64, removed: 12 }, { path: "apps/web/src/screens/Dashboard.tsx", state: "modified", added: 22, removed: 9 }] }),
    issue: { number: 204, title: "Le tableau de bord est illisible en mode sombre", state: "open" },
    todos: todos(["Recenser les couleurs codées en dur", "completed"], ["Passer les graphiques sur les tokens", "completed"], ["Valider le contraste des tuiles", "in_progress"]),
    steps: [
      step.user("Le tableau de bord est illisible en sombre, corrige-le.", "Dev"),
      step.tool("Grep", "#[0-9a-f]{6}", { output: "17 correspondances dans 6 fichiers" }),
      step.text("J'ai remplacé les 17 couleurs codées en dur par les tokens du thème."),
      step.tool("mcp__agora__ask_bot", "Contraste des tuiles", { input: "Les tuiles de chiffres passent à 4,2:1 en sombre. On vise AA (4,5:1) ou on garde la teinte de la maquette ?" }),
    ],
    usage: usage(1.12, 1, 14),
    at: 6,
    age: 50,
  },
  {
    id: "seed-cs-csv",
    conv: "seed-c-tresorerie",
    bot: "seed-tresorerie",
    title: "Export CSV des factures",
    status: "idle",
    priority: "medium",
    engine: "codex",
    model: "gpt-5.2-codex",
    repo: repoBilling,
    git: git(repoBilling, "feat/invoices-csv", { ahead: 0 }),
    todos: todos(["Ajouter la route /invoices.csv", "completed"], ["Échapper les champs au format RFC 4180", "completed"]),
    steps: [
      step.user("Ajoute un export CSV des factures du mois, avec le HT, la TVA et le TTC.", "Trésorerie"),
      step.tool("Write", "src/routes/invoices-csv.ts"),
      step.tool("Bash", "pnpm test invoices", { output: "✓ 9 tests passent" }),
      step.text("L'export est prêt sur `/invoices.csv?month=2026-10`. Les montants sont en euros avec deux décimales et un point-virgule comme séparateur, pour Excel."),
    ],
    usage: usage(0.62, 1, 9),
    result: "Export prêt, 9 tests passent.",
    at: 2 * H,
    age: 6 * H,
  },
  {
    id: "seed-cs-onboarding",
    conv: "seed-c-dev",
    bot: "seed-dev",
    title: "Refonte de l'onboarding",
    status: "idle",
    priority: "low",
    repo: repoApp,
    parked: true,
    git: git(repoApp, "feat/onboarding-v3", { ahead: 3, pushed: false }),
    steps: [step.user("Prépare la refonte de l'onboarding selon la maquette Figma.", "Dev"), step.text("J'ai posé la structure des trois écrans. J'attends les textes définitifs avant d'aller plus loin.")],
    usage: usage(0.94, 2, 18),
    at: 3 * D,
    age: 5 * D,
  },
  {
    id: "seed-cs-avatars",
    conv: "seed-c-dev",
    bot: null,
    title: "Cache des avatars",
    status: "idle",
    priority: "none",
    repo: repoApp,
    parked: true,
    steps: [step.user("Regarde si on peut mettre les avatars en cache côté CDN."), step.text("Oui : un `Cache-Control: public, max-age=31536000, immutable` suffit, l'URL change déjà à chaque nouvelle photo (`?v=`).")],
    at: 6 * D,
    age: 6 * D,
  },
  {
    id: "seed-cs-utc",
    conv: "seed-c-revue",
    bot: "seed-revue",
    title: "Corrige la date UTC dans views.test.ts",
    status: "idle",
    priority: "medium",
    repo: repoApp,
    git: git(repoApp, "fix/views-utc", { pr: pr(43, "Ajoute l'index et corrige la date UTC", "open") }),
    issue: { number: 218, title: "Les vues affichent l'heure UTC", state: "open" },
    todos: todos(["Corriger la date dans le test", "completed"], ["Ajouter l'index sur conversation_id", "completed"], ["Lancer les tests", "completed"]),
    steps: [
      step.user("Corrige la date UTC du test et ajoute l'index manquant sur conversation_id. Ouvre la PR quand les tests passent.", "Revue"),
      step.tool("Read", "apps/api/src/views.test.ts"),
      step.tool("mcp__agora__ask_bot", "Fuseau des dates", { input: "Les dates du test, en UTC ou en Europe/Paris ?" }),
      step.user("UTC, comme le reste de l'API.", "Revue"),
      step.tool("Edit", "apps/api/src/views.test.ts"),
      step.tool("Write", "apps/api/drizzle/0042_index.sql"),
      step.tool("Bash", "bun test views", { output: "✓ 12 tests passent" }),
      step.git("push", "Branche fix/views-utc poussée"),
      step.git("pr", "PR #43 ouverte"),
      step.text("12 tests passent. J'ai ouvert la PR #43."),
    ],
    usage: usage(1.48, 2, 22),
    result: "12 tests passent, PR #43 ouverte.",
    at: 25,
    age: 4 * H,
  },
  {
    id: "seed-cs-index",
    conv: "seed-c-revue",
    bot: "seed-revue",
    title: "Index sur messages.created_at",
    status: "idle",
    priority: "high",
    repo: repoApp,
    git: git(repoApp, "perf/messages-index", { pr: pr(41, "Index sur messages.created_at", "merged") }),
    steps: [
      step.user("Les fils longs mettent 2 s à charger. Trouve pourquoi.", "Revue"),
      step.tool("Bash", "EXPLAIN ANALYZE select … from message where conversation_id = $1 order by created_at", { output: "Seq Scan on message (cost=0.00..48211.20) — 1 912 ms" }),
      step.text("Pas d'index composite : Postgres parcourt toute la table. J'ajoute `(conversation_id, created_at)`."),
      step.git("pr", "PR #41 ouverte"),
      step.git("merge", "PR #41 mergée"),
    ],
    usage: usage(0.71, 1, 11),
    at: 1 * D,
    age: 2 * D,
  },
  {
    id: "seed-cs-hero",
    conv: "seed-c-atelier",
    bot: "seed-atelier",
    title: "Nouvelle section hero du site",
    status: "idle",
    priority: "medium",
    engine: "cursor",
    repo: repoSite,
    git: git(repoSite, "feat/hero-2026", { pr: pr(17, "Nouvelle section hero", "merged", repoSite) }),
    steps: [step.user("Intègre la nouvelle section hero de la maquette.", "Atelier"), step.tool("Write", "src/components/Hero.astro"), step.git("pr", "PR #17 ouverte"), step.git("merge", "PR #17 mergée")],
    usage: usage(0.38, 1, 7),
    at: 3 * D,
    age: 3 * D,
  },
  {
    id: "seed-cs-sitemap",
    conv: "seed-c-atelier",
    bot: "seed-atelier",
    title: "Sitemap et balises Open Graph",
    status: "stopped",
    priority: "low",
    repo: repoSite,
    git: git(repoSite, "seo/sitemap"),
    steps: [step.user("Ajoute un sitemap et les balises Open Graph sur toutes les pages.", "Atelier"), step.tool("Write", "src/pages/sitemap.xml.ts"), step.notice("stopped")],
    usage: usage(0.21, 1, 4),
    at: 2 * D,
    age: 2 * D,
  },
  {
    id: "seed-cs-pdf",
    conv: "seed-c-tresorerie",
    bot: "seed-tresorerie",
    title: "Génération des factures en PDF",
    status: "failed",
    priority: "high",
    repo: repoBilling,
    git: git(repoBilling, "feat/invoice-pdf", { changes: 2, files: [{ path: "src/pdf/invoice.tsx", state: "added", added: 140, removed: 0 }, { path: "package.json", state: "modified", added: 1, removed: 0 }] }),
    steps: [
      step.user("Génère les factures en PDF à partir du modèle de la compta.", "Trésorerie"),
      step.tool("Bash", "pnpm add @react-pdf/renderer", { output: "ERR_PNPM_FETCH_403 GET https://registry.npmjs.org/@react-pdf%2frenderer: Forbidden", status: "error" }),
      step.notice("error", "Le registre npm a refusé le téléchargement (403)."),
    ],
    usage: usage(0.09, 1, 2),
    at: 9 * H,
    age: 10 * H,
  },
  {
    id: "seed-cs-relances",
    conv: "seed-c-tresorerie",
    bot: "seed-tresorerie",
    title: "Relances automatiques des impayés",
    status: "running",
    priority: "medium",
    repo: repoBilling,
    git: git(repoBilling, "feat/dunning", { changes: 1, files: [{ path: "src/jobs/dunning.ts", state: "added", added: 66, removed: 0 }] }),
    todos: todos(["Lister les factures échues de plus de 15 jours", "completed"], ["Écrire les trois niveaux de relance", "in_progress"], ["Planifier le job chaque lundi", "pending"]),
    steps: [step.user("Relance automatiquement les impayés à J+15, J+30 et J+45.", "Trésorerie"), step.tool("Write", "src/jobs/dunning.ts", { status: "running" })],
    usage: usage(0.44, 1, 6),
    at: 1,
    age: 30,
  },
  {
    id: "seed-cs-i18n",
    conv: "seed-g-produit",
    bot: "seed-dev",
    title: "Traduire l'app en anglais",
    status: "idle",
    priority: "low",
    repo: repoApp,
    git: git(repoApp, "feat/i18n-en", { pr: pr(39, "Traduction anglaise", "closed") }),
    steps: [step.user("Prépare la traduction anglaise de l'app.", "Dev"), step.text("Abandonné : on attend d'avoir les textes finaux en français.")],
    at: 8 * D,
    age: 9 * D,
  },
  {
    id: "seed-cs-readme",
    conv: "seed-c-dev",
    bot: null,
    title: "Mettre à jour le README",
    status: "idle",
    priority: "none",
    repo: null,
    steps: [step.user("Réécris le README avec les nouvelles commandes de dev."), step.tool("Write", "README.md"), step.text("C'est fait : installation, `pnpm dev`, migrations et seed.")],
    usage: usage(0.12, 1, 3),
    at: 4 * H,
    age: 4 * H,
  },
];

/* ---------- Write conversations ---------- */

const ref = (id: string, after = "") => ({ id, title: sessions.find((x) => x.id === id)!.title, after });

await conv({
  id: "seed-c-dev",
  kind: "direct",
  bots: ["seed-dev"],
  messages: [
    { at: 3 * H + 10, me: "Les webhooks Stripe passent encore par l'ancienne API, tu peux t'en occuper ?" },
    { at: 3 * H + 8, bot: "seed-dev", text: "Oui. Je lance une session de code sur `e-do/facturation` et je garde l'ancien handler le temps de la bascule.", data: { tools: [{ name: "code_session", status: "done" }], codeSessions: [ref("seed-cs-webhooks", "Oui.")] } },
    { at: 3 * H + 7, event: { type: "code.started", bot: "Dev", title: "Migration des webhooks Stripe", sessionId: "seed-cs-webhooks" } },
    { at: 55, me: "Et le mode sombre du tableau de bord ? Marie s'en plaint." },
    { at: 52, bot: "seed-dev", text: "Je m'en charge aussi, dans une session à part pour ne pas mélanger les deux branches.", data: { codeSessions: [ref("seed-cs-dark")] } },
    { at: 6, event: { type: "code.wake", bot: "Dev", title: "Mode sombre du tableau de bord", sessionId: "seed-cs-dark", reason: "question" } },
    {
      at: 5,
      bot: "seed-dev",
      text: "La session du mode sombre a une question sur le contraste :\n\n| Élément | Clair | Sombre |\n| --- | --- | --- |\n| Tuile de chiffre | 7,1:1 | **4,2:1** |\n| Légende | 4,8:1 | 4,6:1 |\n| Graphique | 5,3:1 | 4,9:1 |\n\nOn vise AA partout (4,5:1) ou on garde la teinte de la maquette pour les tuiles ?",
      data: { choices: { question: "Contraste des tuiles en sombre", options: [{ label: "Viser AA", description: "On éclaircit le texte des tuiles" }, { label: "Garder la maquette", description: "4,2:1, légèrement sous AA" }] } },
    },
  ],
  unread: true,
});

await conv({
  id: "seed-c-revue",
  kind: "direct",
  bots: ["seed-revue"],
  messages: [
    { at: 2 * D, me: "Pourquoi les longs fils mettent autant de temps à charger ?" },
    { at: 2 * D - 3, bot: "seed-revue", text: "Il manque un index composite sur `message(conversation_id, created_at)` : la requête parcourt toute la table.\n\n```sql\ncreate index message_conversation_created_idx\n  on message (conversation_id, created_at);\n```\n\nJe le fais dans une session.", data: { codeSessions: [ref("seed-cs-index")] } },
    { at: 1 * D, event: { type: "code.pr", actor: "Revue", title: "Index sur messages.created_at", sessionId: "seed-cs-index", number: 41, url: "https://github.com/theodaguier/e-do-bots/pull/41", merged: true } },
    { at: 4 * H, me: "Le test views.test.ts casse une fois sur deux, tu regardes ?" },
    { at: 4 * H - 2, bot: "seed-revue", text: "C'est la date : le test compare une date locale à une date UTC. Je corrige.", data: { codeSessions: [ref("seed-cs-utc")] } },
    { at: 25, event: { type: "code.pr", actor: "Revue", title: "Corrige la date UTC dans views.test.ts", sessionId: "seed-cs-utc", number: 43, url: "https://github.com/theodaguier/e-do-bots/pull/43", merged: false } },
    { at: 24, bot: "seed-revue", text: "C'est fait : les tests passent, la [PR #43](https://github.com/theodaguier/e-do-bots/pull/43) attend ta relecture." },
  ],
});

await conv({
  id: "seed-c-tresorerie",
  kind: "direct",
  bots: ["seed-tresorerie"],
  messages: [
    { at: 10 * H, me: "Il faudrait sortir les factures en PDF directement depuis Agora." },
    { at: 10 * H - 2, bot: "seed-tresorerie", text: "Je lance la session.", data: { codeSessions: [ref("seed-cs-pdf")] } },
    { at: 9 * H, event: { type: "code.wake", bot: "Trésorerie", title: "Génération des factures en PDF", sessionId: "seed-cs-pdf", reason: "failed" } },
    { at: 9 * H - 1, bot: "seed-tresorerie", text: "La session a échoué : le registre npm a refusé le téléchargement de `@react-pdf/renderer` (403). Il faut probablement un token npm dans le Coffre." },
    { at: 6 * H, me: "Ok. En attendant, un export CSV des factures du mois ?" },
    { at: 6 * H - 2, bot: "seed-tresorerie", text: "Bien sûr.", data: { codeSessions: [ref("seed-cs-csv")] } },
    { at: 2 * H, bot: "seed-tresorerie", text: "L'export CSV est prêt. Pour octobre :\n\n- **42 factures** émises\n- **38 620 €** HT, dont 7 724 € de TVA\n- **3 impayées** depuis plus de 30 jours (4 180 €)\n\nJe peux relancer les trois clients concernés si tu veux." },
    { at: 31, me: "Oui, et automatise les relances pour la suite." },
    { at: 30, bot: "seed-tresorerie", text: "C'est parti : relances à J+15, J+30 et J+45.", data: { codeSessions: [ref("seed-cs-relances")], approvals: [{ command: "curl -X POST https://api.stripe.com/v1/invoices/in_1Q…/send", choice: "allow", by: owner.name }] } },
  ],
});

await conv({
  id: "seed-c-atelier",
  kind: "direct",
  bots: ["seed-atelier"],
  messages: [
    { at: 3 * D + 30, me: "Il nous faut la nouvelle section hero sur le site." },
    { at: 3 * D + 28, bot: "seed-atelier", text: "Je l'intègre depuis la maquette.", data: { codeSessions: [ref("seed-cs-hero")] } },
    { at: 3 * D, event: { type: "code.pr", actor: owner.name, title: "Nouvelle section hero du site", sessionId: "seed-cs-hero", number: 17, url: "https://github.com/e-do/site-vitrine/pull/17", merged: true } },
    { at: 2 * D, bot: "seed-atelier", text: "J'ai démarré le sitemap, puis tu as arrêté la session. On reprend quand tu veux.", data: { codeSessions: [ref("seed-cs-sitemap")] } },
    { at: 20 * H, me: "Propose-moi trois pistes de titre pour la page d'accueil." },
    {
      at: 20 * H - 1,
      bot: "seed-atelier",
      text: "Trois pistes, du plus sobre au plus affirmé :\n\n1. **Vos agents, votre équipe.** Un espace où collègues et bots travaillent ensemble.\n2. **Le bureau qui ne dort jamais.** Vos bots avancent pendant que vous dormez.\n3. **Moins d'onglets, plus de travail fait.** Tout ce que vos agents savent faire, au même endroit.\n\nJe pencherais pour la première : elle dit ce que fait le produit sans promesse.",
    },
  ],
});

await conv({
  id: "seed-c-veille",
  kind: "direct",
  bots: ["seed-veille"],
  unread: true,
  messages: [
    { at: 26 * H, me: "Fais-moi une veille chaque matin sur les outils d'agents IA." },
    { at: 26 * H - 1, bot: "seed-veille", text: "Entendu, chaque matin à 8 h 30." },
    { at: 45, bot: "seed-veille", text: "**Veille du jour**\n\n- Anthropic publie une nouvelle version de Claude Code avec des sous-agents en arrière-plan.\n- Linear ouvre son API d'agents en bêta publique.\n- Figma ajoute l'écriture de composants par MCP.\n\nLe plus utile pour nous : l'API Linear, on pourrait y brancher les sessions de code.", data: { tools: [{ name: "web_search", status: "done" }, { name: "web_fetch", status: "done" }] } },
  ],
});

await conv({
  id: "seed-c-hermes",
  kind: "direct",
  bots: ["seed-hermes"],
  messages: [
    { at: 5 * D, me: "Résume-moi la réunion produit d'hier." },
    { at: 5 * D - 1, bot: "seed-hermes", text: "**Décisions**\n- On sort la v0.50 le 12 novembre.\n- Le mode sombre passe avant l'export PDF.\n\n**À faire**\n- Marie : maquettes du mode sombre (jeudi)\n- Lucas : migration Stripe (vendredi)\n- Inès : valider le format du CSV" },
  ],
});

await conv({
  id: "seed-c-garde",
  kind: "direct",
  bots: ["seed-garde"],
  messages: [
    { at: 7 * H, bot: "seed-garde", text: "⚠️ Le certificat de `facturation.e-do.studio` expire dans 9 jours. Je peux le renouveler maintenant ?" },
    { at: 7 * H - 3, me: "Vas-y." },
    { at: 7 * H - 4, bot: "seed-garde", text: "Renouvelé, valable jusqu'au 1er février 2027.", data: { approvals: [{ command: "certbot renew --cert-name facturation.e-do.studio", choice: "allow", by: owner.name }], tools: [{ name: "terminal", status: "done" }] } },
  ],
});

await conv({ id: "seed-c-archiviste", kind: "direct", bots: ["seed-archiviste"], messages: [{ at: 9 * D, event: { type: "agent.ready", name: "Archiviste" } }] });

await conv({
  id: "seed-c-marie",
  kind: "direct",
  people: ["seed-marie"],
  unread: true,
  messages: [
    { at: 3 * H, from: "seed-marie", text: "Tu as vu les maquettes du mode sombre ?" },
    { at: 2 * H + 50, me: "Pas encore, je regarde ce soir." },
    { at: 12, from: "seed-marie", text: "Top. J'ai aussi revu les états vides, dis-moi si les mascottes te vont 🙂" },
  ],
});

await conv({
  id: "seed-c-lucas",
  kind: "direct",
  people: ["seed-lucas"],
  messages: [
    { at: 2 * D, from: "seed-lucas", text: "Je suis en focus cet aprèm, écris-moi si c'est urgent." },
    { at: 2 * D - 30, me: "Ça marche, merci !" },
  ],
});

await conv({
  id: "seed-g-produit",
  kind: "group",
  title: "Équipe produit",
  people: ["seed-marie", "seed-lucas", "seed-chloe"],
  bots: ["seed-dev", "seed-atelier"],
  unread: true,
  messages: [
    { at: 9 * D, event: { type: "group.created", actor: owner.name } },
    { at: 9 * D - 1, event: { type: "members.added", actor: owner.name, names: ["Marie", "Lucas", "Chloé"] } },
    { at: 9 * D - 10, from: "seed-chloe", text: "Bienvenue à tous ! On centralise ici tout ce qui touche à la v0.50." },
    { at: 1 * D, from: "seed-lucas", text: "@Dev tu peux me dire où en est la migration Stripe ?", data: { mentions: ["seed-dev"] } },
    { at: 1 * D - 1, bot: "seed-dev", text: "La session tourne : signatures vérifiées, je migre `invoice.paid` et `invoice.payment_failed`. Il reste à supprimer l'ancien handler et à lancer les tests d'intégration." },
    { at: 3 * H, from: "seed-marie", text: "Maquettes du mode sombre prêtes : https://figma.com/design/XsudA2MFOeIeLFx3yvpWMP" },
    { at: 40, from: "seed-chloe", text: "Point rapide demain 10 h ? On a besoin de trancher le contraste des tuiles." },
    { at: 18, bot: "seed-atelier", text: "Je peux préparer deux variantes côte à côte pour la réunion : AA strict et teinte de la maquette." },
  ],
});

await conv({
  id: "seed-g-compta",
  kind: "group",
  title: "Compta & facturation",
  people: ["seed-ines", "seed-hugo"],
  bots: ["seed-tresorerie"],
  messages: [
    { at: 4 * D, event: { type: "group.created", actor: owner.name } },
    { at: 4 * D - 5, from: "seed-ines", text: "Il me faudrait l'export des factures d'octobre avant le 5." },
    { at: 2 * H - 5, bot: "seed-tresorerie", text: "@Inès l'export est prêt, je te le mets en pièce jointe dès que tu valides le format (point-virgule, montants en euros).", data: { mentions: ["seed-ines"] } },
    { at: 2 * H - 20, from: "seed-hugo", text: "Je suis en congés jusqu'à la semaine prochaine, Inès prend le relais côté clients." },
  ],
});

await conv({
  id: "seed-g-bots",
  kind: "group",
  bots: ["seed-revue", "seed-dev"],
  messages: [
    { at: 30 * H, event: { type: "relay.group", bot: "Revue", bots: ["Dev"], conversationId: "seed-c-revue" } },
    { at: 30 * H - 1, bot: "seed-revue", text: "@Dev la PR #41 ajoute un index : tu peux vérifier que la migration passe sur la base de préproduction ?" },
    { at: 30 * H - 6, bot: "seed-dev", text: "Vérifié : 0042 s'applique en 380 ms sur la préproduction, aucun verrou long." },
  ],
});

/* ---------- Sessions ---------- */

await db.insert(codeSession).values(
  sessions.map((x) => ({
    id: x.id,
    conversationId: x.conv,
    agentId: x.bot,
    requestedBy: ME,
    title: x.title,
    engine: x.engine ?? "claude",
    status: x.status,
    priority: x.priority,
    parkedAt: x.parked ? ago(x.at) : null,
    issue: x.issue ? { ...x.issue, url: `https://github.com/${x.repo}/issues/${x.issue.number}` } : null,
    cwd: `/tmp/agora-seed/${x.id}`,
    repo: x.repo,
    git: x.git ?? null,
    worktree: x.git?.branch ? { branch: x.git.branch, removedAt: x.status === "idle" && x.git.pr?.state === "merged" ? ago(x.at).toISOString() : null } : null,
    account: { id: null, email: owner.email, plan: "Max" },
    model: x.model ?? (x.engine === "codex" ? "gpt-5.2-codex" : "claude-sonnet-4-5"),
    result: x.result ?? null,
    permissions: { allowedTools: [], dirs: [] },
    steps: x.steps,
    todos: x.todos ?? [],
    usage: x.usage ?? null,
    createdAt: ago(x.age),
    updatedAt: ago(x.at),
  })),
);

/* ---------- Tasks ---------- */

const tasks = [
  { id: "seed-t-1", title: "Valider le contraste des tuiles en mode sombre", status: "todo", priority: "urgent", due: 0, agent: "seed-dev", assignees: [ME], conv: "seed-c-dev" },
  { id: "seed-t-2", title: "Relire la PR #43", status: "todo", priority: "high", due: 1, agent: "seed-revue", assignees: [ME], conv: "seed-c-revue" },
  { id: "seed-t-3", title: "Ajouter un token npm dans le Coffre", status: "todo", priority: "high", due: -1, agent: "seed-tresorerie", assignees: [ME] },
  { id: "seed-t-4", title: "Préparer les variantes de contraste pour la réunion", status: "in_progress", priority: "normal", due: 1, agent: "seed-atelier", assignees: ["seed-marie", ME] },
  { id: "seed-t-5", title: "Valider le format du CSV des factures", status: "in_progress", priority: "normal", due: 2, assignees: ["seed-ines"] },
  { id: "seed-t-6", title: "Écrire les textes de l'onboarding", status: "todo", priority: "low", due: 7, assignees: ["seed-chloe", ME] },
  { id: "seed-t-7", title: "Renouveler le certificat de facturation", status: "done", priority: "high", due: -2, agent: "seed-garde", assignees: [ME] },
  { id: "seed-t-8", title: "Envoyer le récap de la réunion produit", status: "done", priority: "normal", due: -4, assignees: [ME] },
  { id: "seed-t-9", title: "Mettre à jour la grille tarifaire", status: "todo", priority: "normal", due: null, assignees: ["seed-hugo"] },
  { id: "seed-t-10", title: "Planifier la sortie de la v0.50", status: "todo", priority: "normal", due: 9, assignees: [ME, "seed-chloe", "seed-lucas"] },
] as const;
await db.insert(task).values(
  tasks.map((t, i) => ({
    id: t.id,
    title: t.title,
    description: i % 3 === 0 ? "Contexte et liens dans la conversation d'origine." : "",
    status: t.status,
    priority: t.priority,
    dueOn: t.due === null ? null : day(t.due),
    createdBy: ME,
    agentId: "agent" in t ? t.agent : null,
    conversationId: "conv" in t ? t.conv : null,
    completedAt: t.status === "done" ? ago((i + 1) * 5 * H) : null,
    createdAt: ago((i + 2) * 7 * H),
    updatedAt: ago((i + 1) * 3 * H),
  })),
);
await db.insert(taskAssignee).values(tasks.flatMap((t) => t.assignees.map((u) => ({ taskId: t.id, userId: u }))));

/* ---------- Inbox ---------- */

await db.insert(notification).values([
  { id: "seed-n-1", userId: ME, kind: "mention", actorAgentId: "seed-atelier", conversationId: "seed-g-produit", text: "Je peux préparer deux variantes côte à côte pour la réunion.", createdAt: ago(18) },
  { id: "seed-n-2", userId: ME, kind: "task.assigned", actorAgentId: "seed-dev", taskId: "seed-t-1", text: "Valider le contraste des tuiles en mode sombre", createdAt: ago(5) },
  { id: "seed-n-3", userId: ME, kind: "reply", actorUserId: "seed-chloe", conversationId: "seed-g-produit", text: "Point rapide demain 10 h ? On a besoin de trancher le contraste des tuiles.", createdAt: ago(40) },
  { id: "seed-n-4", userId: ME, kind: "task.assigned", actorAgentId: "seed-revue", taskId: "seed-t-2", text: "Relire la PR #43", createdAt: ago(24), readAt: ago(10) },
  { id: "seed-n-5", userId: ME, kind: "task.done", actorUserId: "seed-marie", taskId: "seed-t-8", text: "Envoyer le récap de la réunion produit", createdAt: ago(3 * D), readAt: ago(2 * D) },
  { id: "seed-n-6", userId: ME, kind: "mention", actorUserId: "seed-lucas", conversationId: "seed-g-produit", text: "@Dev tu peux me dire où en est la migration Stripe ?", createdAt: ago(1 * D), readAt: ago(20 * H) },
]);

/* ---------- Usage (Consommation) ---------- */

const models = ["claude-sonnet-4-5", "claude-opus-4-5", "gpt-5.2-codex", "claude-haiku-4-5"];
const usageRows = Array.from({ length: 60 }, (_, i) => {
  const b = bots[i % bots.length]!;
  const who = i % 4 === 0 ? people[i % people.length]!.id : ME;
  const model = models[i % models.length]!;
  const input = 20_000 + ((i * 7919) % 180_000);
  return {
    id: `seed-u-${i}`,
    occurredAt: ago((i * 11 * H) % (28 * D)),
    engine: (model.startsWith("gpt") ? "codex" : i % 5 === 0 ? "claude-code" : "hermes") as "hermes" | "claude-code" | "codex",
    profile: b.id,
    source: (i % 9 === 0 ? "cron" : i % 7 === 0 ? "system" : i % 5 === 0 ? "code" : "chat") as "chat" | "cron" | "system" | "code",
    taskName: i % 9 === 0 ? "Veille du matin" : i % 7 === 0 ? "curator" : null,
    userId: who,
    agentId: b.id,
    provider: model.startsWith("gpt") ? "openai" : "anthropic",
    model,
    apiCalls: 1 + (i % 6),
    inputTokens: input,
    outputTokens: Math.round(input / 8),
    cacheReadTokens: input * 3,
    cacheWriteTokens: Math.round(input / 5),
  };
});
await db.insert(usageEvent).values(usageRows);

console.log(`seed: ${people.length} collègues, ${bots.length} bots, ${n} messages, ${sessions.length} sessions de code, ${tasks.length} tâches, ${usageRows.length} lignes de consommation, pour ${owner.email}.`);
process.exit(0);
