/**
 * Coffre-fort: logins, payment cards and contact details (@agora/core vaults.ts).
 *
 * Every person has one personal vault (made on first use) and may share others with colleagues.
 * Each vault lists the bots that may read it, and a bot reads it only on behalf of the person who
 * started its turn, a member of that vault. Contact details go to the bot as they are; a login's
 * password only once that person agreed, on a card in the conversation (`vault_request`); a payment
 * card's number and security code never.
 *
 * What can be shown lives in `fields`; the rest is sealed (sealed.ts) in `secret`. Never log either.
 */
import { VAULT_ITEM_KINDS, withHttps, type ConversationEvent, type VaultItem, type VaultItemKind, type VaultItemSecret, type VaultRequestDto, type VaultRequestStatus, type VaultSummary } from "@agora/core";
import { and, asc, eq, ilike, inArray, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "./db";
import { defineMessages, tr } from "./i18n";
import { seal, unseal } from "./sealed";

const { agent, agentAccess, conversationMember, user, vault, vaultAgent, vaultItem, vaultMember, vaultRequest } = schema;
type VaultRow = typeof vault.$inferSelect;
type ItemRow = typeof vaultItem.$inferSelect;
type RequestRow = typeof vaultRequest.$inferSelect;
type Viewer = { id: string; role?: string | null };
/** The turn a bot's tool call comes from (bot-runner.ts turnOfHermesSession), started by a person. */
export type VaultTurn = { conversationId: string; agentId: string; requestedBy: string };

/** The turn of a plugin call: running, and started by a person, whose vaults the bot reads for them. */
export function vaultTurn(turn: { conversationId: string; agentId: string; requestedBy: string | null } | null): VaultTurn | { error: "no_turn"; message: string } {
  if (!turn?.requestedBy) return { error: "no_turn", message: "The vault can only be used while replying to a person." };
  return { conversationId: turn.conversationId, agentId: turn.agentId, requestedBy: turn.requestedBy };
}

const messages = defineMessages({
  en: {
    personal: "Personal",
    notFound: "Vault not found",
    itemNotFound: "Item not found",
    requestNotFound: "Request not found",
    notShared: "Only a shared vault can be deleted",
    alreadyHandled: "Request already handled",
    expired: "This request has expired",
    notYours: "Only the person who asked the bot can answer",
    unknownAgent: "You can only allow bots you have access to",
    unknownUser: "Unknown person",
    noMember: "A shared vault keeps at least one member",
    kindChange: "An item's kind can't change",
    notReadable: "This bot can't read that vault",
    notAsk: "This request isn't asking for a new login",
  },
  fr: {
    personal: "Personnel",
    notFound: "Coffre introuvable",
    itemNotFound: "Élément introuvable",
    requestNotFound: "Demande introuvable",
    notShared: "Seul un coffre partagé peut être supprimé",
    alreadyHandled: "Demande déjà traitée",
    expired: "Cette demande a expiré",
    notYours: "Seule la personne qui a sollicité le bot peut répondre",
    unknownAgent: "Tu ne peux autoriser que les bots auxquels tu as accès",
    unknownUser: "Personne inconnue",
    noMember: "Un coffre partagé garde au moins un membre",
    kindChange: "Le type d'un élément ne peut pas changer",
    notReadable: "Ce bot ne peut pas lire ce coffre",
    notAsk: "Cette demande ne porte pas sur un nouvel identifiant",
  },
});

export class VaultError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409,
  ) {
    super(message);
  }
}

/** How long a bot's request waits for its person (the plugin waits as long). */
export const REQUEST_TTL_MS = 5 * 60_000;
/** How long after the approval the bot can still collect the login. */
const DELIVERY_MS = 5 * 60_000;

/* ---------- items: what is shown, what is sealed ---------- */

/** Fields a person fills, per kind (a card's brand and last 4 digits are taken from its number). */
const FIELDS: Record<VaultItemKind, string[]> = {
  login: ["username"],
  card: ["holder", "expiry"],
  contact: ["name", "email", "phone", "address", "company"],
};
/** Fields kept per kind, the derived ones included: the only ones that ever leave the API. */
const PUBLIC_FIELDS: Record<VaultItemKind, string[]> = { ...FIELDS, card: ["holder", "brand", "last4", "expiry"] };
const SECRETS: Record<VaultItemKind, (keyof VaultItemSecret)[]> = {
  login: ["password", "notes"],
  card: ["number", "cvc", "notes"],
  contact: ["notes"],
};

const text = (max: number) => z.string().max(max);
const kind = z.enum(VAULT_ITEM_KINDS as [VaultItemKind, ...VaultItemKind[]]);
const website = z
  .string()
  .max(500)
  .nullish()
  .transform((v) => (v ? withHttps(v) : null))
  .pipe(z.string().url().nullable());
/** A secret left empty keeps its value on an update; null clears it. */
const secret = z
  .object({ password: text(500).nullish(), number: text(40).nullish(), cvc: text(8).nullish(), notes: text(5000).nullish() })
  .strip();

export const itemInput = z.object({
  kind,
  title: z.string().trim().min(1).max(120),
  website,
  fields: z.record(z.string(), text(500)).default({}),
  secret: secret.default({}),
});
export const itemPatch = itemInput.partial();
export type ItemInput = z.infer<typeof itemInput>;
export type ItemPatch = z.infer<typeof itemPatch>;

/** "4242 4242-4242 4242" → its digits; throws on anything that isn't a card number. */
function cardNumber(raw: string) {
  const digits = raw.replace(/[\s-]/g, "");
  if (!/^\d{12,19}$/.test(digits)) throw new VaultError("Invalid card number", 400);
  return digits;
}

export function cardBrand(digits: string) {
  if (/^4/.test(digits)) return "Visa";
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(digits)) return "Mastercard";
  if (/^3[47]/.test(digits)) return "American Express";
  if (/^(6011|65|64[4-9])/.test(digits)) return "Discover";
  return "";
}

const pick = (from: Record<string, string>, keys: string[]) =>
  Object.fromEntries(keys.flatMap((k) => (typeof from[k] === "string" && from[k].trim() ? [[k, from[k].trim()]] : [])));

/** The fields kept for an item: those of its kind, plus a card's brand and last 4 digits. */
export function publicFields(k: VaultItemKind, fields: Record<string, string>, number?: string, previous?: Record<string, string>) {
  const kept: Record<string, string> = pick(fields, FIELDS[k]);
  if (k === "card") {
    if (kept.expiry && !/^(0[1-9]|1[0-2])\/\d{2}$/.test(kept.expiry)) throw new VaultError("Expiry: MM/YY", 400);
    if (number) Object.assign(kept, { brand: cardBrand(number), last4: number.slice(-4) });
    else if (previous) Object.assign(kept, pick(previous, ["brand", "last4"]));
  }
  return kept;
}

/** The secrets kept for an item: those of its kind; on an update, an empty one keeps its value. */
export function mergeSecret(k: VaultItemKind, input: z.infer<typeof secret>, previous: VaultItemSecret = {}): VaultItemSecret {
  const out: VaultItemSecret = {};
  for (const key of SECRETS[k]) {
    const value = input[key];
    if (value === null) continue;
    const next = typeof value === "string" && value.trim() ? (key === "number" ? cardNumber(value) : key === "notes" ? value : value.trim()) : previous[key];
    if (key === "cvc" && next && !/^\d{3,4}$/.test(next)) throw new VaultError("Invalid security code", 400);
    if (next) out[key] = next;
  }
  return out;
}

const readSecret = (row: ItemRow): VaultItemSecret => {
  try {
    return JSON.parse(unseal(row.secret));
  } catch {
    return {};
  }
};

export const toItem = (row: ItemRow): VaultItem => ({
  id: row.id,
  vaultId: row.vaultId,
  kind: row.kind,
  title: row.title,
  website: row.website,
  fields: pick(row.fields, PUBLIC_FIELDS[row.kind]),
  // Whether there's a note to reveal, not the note itself.
  hasNotes: !!readSecret(row).notes,
  updatedAt: row.updatedAt.toISOString(),
});

/* ---------- vaults ---------- */

/** The person's own vault, made the first time. */
export async function personalVault(userId: string) {
  const [found] = await db.select().from(vault).where(eq(vault.ownerId, userId));
  if (found) return found;
  await db
    .insert(vault)
    .values({ id: crypto.randomUUID(), name: tr(messages).personal, kind: "personal", ownerId: userId, createdBy: userId })
    .onConflictDoNothing();
  const [row] = await db.select().from(vault).where(eq(vault.ownerId, userId));
  return row!;
}

/** Vault ids the person belongs to: their own and the shared ones they're a member of. */
async function memberVaultIds(userId: string) {
  const rows = await db
    .select({ id: vault.id })
    .from(vault)
    .leftJoin(vaultMember, and(eq(vaultMember.vaultId, vault.id), eq(vaultMember.userId, userId)))
    .where(or(eq(vault.ownerId, userId), and(eq(vault.kind, "shared"), eq(vaultMember.userId, userId))));
  return rows.map((r) => r.id);
}

/** The vault, when the person belongs to it (admins included: no vault is anyone else's to read). */
export async function vaultOf(userId: string, vaultId: string) {
  const [row] = await db.select().from(vault).where(eq(vault.id, vaultId));
  if (!row) throw new VaultError(tr(messages).notFound, 404);
  if (row.kind === "personal" ? row.ownerId === userId : (await db.select().from(vaultMember).where(and(eq(vaultMember.vaultId, vaultId), eq(vaultMember.userId, userId)))).length) return row;
  throw new VaultError(tr(messages).notFound, 404);
}

async function summaries(rows: VaultRow[]): Promise<VaultSummary[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [counts, agents, members] = await Promise.all([
    db
      .select({ vaultId: vaultItem.vaultId, kind: vaultItem.kind, n: sql<number>`count(*)::int` })
      .from(vaultItem)
      .where(inArray(vaultItem.vaultId, ids))
      .groupBy(vaultItem.vaultId, vaultItem.kind),
    db.select().from(vaultAgent).where(inArray(vaultAgent.vaultId, ids)),
    db.select().from(vaultMember).where(inArray(vaultMember.vaultId, ids)),
  ]);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    counts: Object.fromEntries(VAULT_ITEM_KINDS.map((k) => [k, counts.find((c) => c.vaultId === r.id && c.kind === k)?.n ?? 0])) as VaultSummary["counts"],
    agentIds: agents.filter((a) => a.vaultId === r.id).map((a) => a.agentId),
    memberIds: r.kind === "personal" ? [r.ownerId!] : members.filter((m) => m.vaultId === r.id).map((m) => m.userId),
    // Every member manages the vault (its bots, its members), like the owner of a personal one.
    canManage: true,
  }));
}

export async function getVault(userId: string, vaultId: string) {
  return (await summaries([await vaultOf(userId, vaultId)]))[0]!;
}

/** The personal vault first, then the shared ones by name. */
export async function listVaults(userId: string): Promise<VaultSummary[]> {
  const own = await personalVault(userId);
  const ids = (await memberVaultIds(userId)).filter((id) => id !== own.id);
  const shared = ids.length ? await db.select().from(vault).where(inArray(vault.id, ids)).orderBy(asc(vault.name), asc(vault.createdAt)) : [];
  return summaries([own, ...shared]);
}

/** Bots added to a vault must be ones the person may talk to (any for an admin). */
async function checkAgents(viewer: Viewer, agentIds: string[]) {
  if (!agentIds.length) return;
  const known = await db.select({ id: agent.id }).from(agent).where(inArray(agent.id, agentIds));
  if (known.length !== new Set(agentIds).size) throw new VaultError(tr(messages).unknownAgent, 400);
  if (viewer.role === "admin") return;
  const mine = await db
    .select({ id: agentAccess.agentId })
    .from(agentAccess)
    .where(and(eq(agentAccess.userId, viewer.id), inArray(agentAccess.agentId, agentIds)));
  if (mine.length !== new Set(agentIds).size) throw new VaultError(tr(messages).unknownAgent, 403);
}

async function checkUsers(userIds: string[]) {
  if (!userIds.length) return;
  const known = await db.select({ id: user.id }).from(user).where(inArray(user.id, userIds));
  if (known.length !== new Set(userIds).size) throw new VaultError(tr(messages).unknownUser, 400);
}

export const vaultInput = z.object({
  name: z.string().trim().min(1).max(80),
  memberIds: z.array(z.string().max(100)).max(200).default([]),
  agentIds: z.array(z.string().max(100)).max(200).default([]),
});
export const vaultPatch = vaultInput.partial();

export async function createSharedVault(viewer: Viewer, input: z.infer<typeof vaultInput>) {
  const memberIds = [...new Set([viewer.id, ...input.memberIds])];
  const agentIds = [...new Set(input.agentIds)];
  await checkUsers(memberIds);
  await checkAgents(viewer, agentIds);
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(vault).values({ id, name: input.name, kind: "shared", createdBy: viewer.id });
    await tx.insert(vaultMember).values(memberIds.map((userId) => ({ vaultId: id, userId })));
    if (agentIds.length) await tx.insert(vaultAgent).values(agentIds.map((agentId) => ({ vaultId: id, agentId })));
  });
  return getVault(viewer.id, id);
}

/** A personal vault only changes its bots; a shared one its name, members and bots too. */
export async function updateVault(viewer: Viewer, vaultId: string, input: z.infer<typeof vaultPatch>) {
  const row = await vaultOf(viewer.id, vaultId);
  const shared = row.kind === "shared";
  const before = await db.select().from(vaultAgent).where(eq(vaultAgent.vaultId, vaultId));
  const agentIds = input.agentIds ? [...new Set(input.agentIds)] : null;
  // Only the bots added are checked: those a co-member added stay, even if this person can't talk to them.
  if (agentIds) await checkAgents(viewer, agentIds.filter((id) => !before.some((b) => b.agentId === id)));
  const memberIds = shared && input.memberIds ? [...new Set(input.memberIds)] : null;
  if (memberIds) {
    if (!memberIds.length) throw new VaultError(tr(messages).noMember, 400);
    await checkUsers(memberIds);
  }
  await db.transaction(async (tx) => {
    if (shared && input.name) await tx.update(vault).set({ name: input.name }).where(eq(vault.id, vaultId));
    else await tx.update(vault).set({ updatedAt: new Date() }).where(eq(vault.id, vaultId));
    if (memberIds) {
      await tx.delete(vaultMember).where(eq(vaultMember.vaultId, vaultId));
      await tx.insert(vaultMember).values(memberIds.map((userId) => ({ vaultId, userId })));
    }
    if (agentIds) {
      await tx.delete(vaultAgent).where(eq(vaultAgent.vaultId, vaultId));
      if (agentIds.length) await tx.insert(vaultAgent).values(agentIds.map((agentId) => ({ vaultId, agentId })));
    }
  });
  // Removed from it by this very change: they no longer see it.
  if (memberIds && !memberIds.includes(viewer.id)) return null;
  return getVault(viewer.id, vaultId);
}

export async function deleteVault(viewer: Viewer, vaultId: string) {
  const row = await vaultOf(viewer.id, vaultId);
  if (row.kind !== "shared") throw new VaultError(tr(messages).notShared, 400);
  await db.delete(vault).where(eq(vault.id, vaultId));
}

/* ---------- items, for the people ---------- */

export async function listItems(userId: string, vaultId: string) {
  await vaultOf(userId, vaultId);
  const rows = await db.select().from(vaultItem).where(eq(vaultItem.vaultId, vaultId)).orderBy(asc(vaultItem.title));
  return rows.map(toItem);
}

async function itemOf(userId: string, vaultId: string, itemId: string) {
  await vaultOf(userId, vaultId);
  const [row] = await db.select().from(vaultItem).where(and(eq(vaultItem.id, itemId), eq(vaultItem.vaultId, vaultId)));
  if (!row) throw new VaultError(tr(messages).itemNotFound, 404);
  return row;
}

export async function createItem(userId: string, vaultId: string, input: ItemInput) {
  await vaultOf(userId, vaultId);
  const secrets = mergeSecret(input.kind, input.secret);
  const [row] = await db
    .insert(vaultItem)
    .values({
      id: crypto.randomUUID(),
      vaultId,
      kind: input.kind,
      title: input.title,
      website: input.website ?? null,
      fields: publicFields(input.kind, input.fields, secrets.number),
      secret: seal(JSON.stringify(secrets)),
      createdBy: userId,
    })
    .returning();
  return toItem(row!);
}

export async function updateItem(userId: string, vaultId: string, itemId: string, input: ItemPatch) {
  const row = await itemOf(userId, vaultId, itemId);
  if (input.kind && input.kind !== row.kind) throw new VaultError(tr(messages).kindChange, 400);
  const previous = readSecret(row);
  const secrets = input.secret ? mergeSecret(row.kind, input.secret, previous) : previous;
  const numberChanged = secrets.number && secrets.number !== previous.number ? secrets.number : undefined;
  const fields = input.fields ? publicFields(row.kind, input.fields, numberChanged, row.fields) : numberChanged ? publicFields(row.kind, row.fields, numberChanged) : row.fields;
  const [next] = await db
    .update(vaultItem)
    .set({
      ...(input.title !== undefined && { title: input.title }),
      ...(input.website !== undefined && { website: input.website }),
      fields,
      secret: seal(JSON.stringify(secrets)),
      updatedAt: new Date(),
    })
    .where(eq(vaultItem.id, row.id))
    .returning();
  return toItem(next!);
}

export async function deleteItem(userId: string, vaultId: string, itemId: string) {
  const row = await itemOf(userId, vaultId, itemId);
  await db.delete(vaultItem).where(eq(vaultItem.id, row.id));
}

/** The item's secrets, for the person themself (Afficher, Copier). */
export async function revealItem(userId: string, vaultId: string, itemId: string): Promise<VaultItemSecret> {
  const row = await itemOf(userId, vaultId, itemId);
  return pickSecret(row.kind, readSecret(row));
}

const pickSecret = (k: VaultItemKind, s: VaultItemSecret) => Object.fromEntries(SECRETS[k].flatMap((key) => (s[key] ? [[key, s[key]]] : []))) as VaultItemSecret;

/* ---------- for the bots ---------- */

/** Vaults the bot may read for this person: it is among their bots, and the person belongs to them. */
export async function readableVaults(agentId: string, userId: string) {
  return db
    .select({ id: vault.id, name: vault.name, kind: vault.kind })
    .from(vaultAgent)
    .innerJoin(vault, eq(vault.id, vaultAgent.vaultId))
    .leftJoin(vaultMember, and(eq(vaultMember.vaultId, vault.id), eq(vaultMember.userId, userId)))
    .where(and(eq(vaultAgent.agentId, agentId), or(eq(vault.ownerId, userId), and(eq(vault.kind, "shared"), eq(vaultMember.userId, userId)))));
}

/** What a bot sees of an item: never a secret, never more than its public fields. */
function forBot(row: ItemRow, vaultName: string) {
  return { id: row.id, vault: vaultName, kind: row.kind, title: row.title, website: row.website, ...pick(row.fields, PUBLIC_FIELDS[row.kind]) };
}

export async function botSearch(turn: VaultTurn, query?: string, k?: VaultItemKind) {
  const vaults = await readableVaults(turn.agentId, turn.requestedBy);
  if (!vaults.length) return [];
  const q = query?.trim().replace(/[\\%_]/g, (m) => `\\${m}`);
  const rows = await db
    .select()
    .from(vaultItem)
    .where(
      and(
        inArray(
          vaultItem.vaultId,
          vaults.map((v) => v.id),
        ),
        k ? eq(vaultItem.kind, k) : undefined,
        q ? or(ilike(vaultItem.title, `%${q}%`), ilike(vaultItem.website, `%${q}%`), sql`${vaultItem.fields}::text ilike ${`%${q}%`}`) : undefined,
      ),
    )
    .orderBy(asc(vaultItem.title))
    .limit(50);
  return rows.map((r) => forBot(r, vaults.find((v) => v.id === r.vaultId)!.name));
}

/** An item of a vault the bot may read for this person, else not found. */
async function botItem(turn: VaultTurn, itemId: string) {
  const vaults = await readableVaults(turn.agentId, turn.requestedBy);
  const [row] = vaults.length
    ? await db
        .select()
        .from(vaultItem)
        .where(
          and(
            eq(vaultItem.id, itemId),
            inArray(
              vaultItem.vaultId,
              vaults.map((v) => v.id),
            ),
          ),
        )
    : [];
  if (!row) throw new VaultError(tr(messages, "en").itemNotFound, 404);
  return { row, vault: vaults.find((v) => v.id === row.vaultId)! };
}

/** A contact's details: given without asking. */
export async function botContact(turn: VaultTurn, itemId: string) {
  const { row, vault: v } = await botItem(turn, itemId);
  if (row.kind !== "contact") throw new VaultError("Not a contact: use vault_use_login for a login. A card's number is never given.", 400);
  return forBot(row, v.name);
}

/** Pending requests older than the TTL become expired. */
async function expireStale(where = sql`true`) {
  await db
    .update(vaultRequest)
    .set({ status: "expired", decidedAt: new Date() })
    .where(and(eq(vaultRequest.status, "pending"), lt(vaultRequest.createdAt, new Date(Date.now() - REQUEST_TTL_MS)), where));
}

async function loadRequest(id: string) {
  await expireStale(eq(vaultRequest.id, id));
  const [row] = await db.select().from(vaultRequest).where(eq(vaultRequest.id, id));
  if (!row) throw new VaultError(tr(messages).requestNotFound, 404);
  return row;
}

type Announce = (conversationId: string, event: ConversationEvent) => Promise<unknown>;
const postEvent: Announce = async (conversationId, event) => (await import("./messages")).postEvent(conversationId, event);

/**
 * A bot asks to use a login: a request its person answers on the card posted in the conversation.
 * The same pending request is reused when the bot asks again.
 */
export async function requestLogin(turn: VaultTurn, itemId: string, reason: string, announce: Announce = postEvent) {
  const { row } = await botItem(turn, itemId);
  if (row.kind !== "login") throw new VaultError(row.kind === "card" ? "A card's number and security code are never given to bots." : "Not a login: use vault_contact for contact details.", 400);
  await expireStale(eq(vaultRequest.vaultItemId, row.id));
  const [pending] = await db
    .select()
    .from(vaultRequest)
    .where(
      and(
        eq(vaultRequest.kind, "use"),
        eq(vaultRequest.vaultItemId, row.id),
        eq(vaultRequest.agentId, turn.agentId),
        eq(vaultRequest.conversationId, turn.conversationId),
        eq(vaultRequest.requestedBy, turn.requestedBy),
        eq(vaultRequest.status, "pending"),
      ),
    );
  if (pending) return pending;
  const [created] = await db
    .insert(vaultRequest)
    .values({ id: crypto.randomUUID(), vaultItemId: row.id, agentId: turn.agentId, conversationId: turn.conversationId, requestedBy: turn.requestedBy, reason: reason.trim().slice(0, 500) })
    .returning();
  const [bot] = await db.select({ name: agent.name }).from(agent).where(eq(agent.id, turn.agentId));
  await announce(turn.conversationId, { type: "vault.request", bot: bot?.name ?? "bot", item: row.title, requestId: created!.id });
  return created!;
}

/** A site's name for its card: its host without "www.". */
const siteName = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/**
 * A bot needs a login it doesn't have (vault_search found none), for a website: its person types it on
 * the card posted in the conversation, it is saved in one of their vaults the bot may read, and the bot
 * gets it. The same pending request is reused when the bot asks again for that site.
 */
export async function askLogin(turn: VaultTurn, site: string, reason: string, announce: Announce = postEvent) {
  const parsed = website.safeParse(site);
  if (!parsed.success || !parsed.data) throw new VaultError("website must be the site's address, e.g. https://example.com", 400);
  const url = new URL(parsed.data).origin;
  if (!(await readableVaults(turn.agentId, turn.requestedBy)).length) throw new VaultError(tr(messages, "en").notReadable, 403);
  await expireStale(and(eq(vaultRequest.kind, "ask"), eq(vaultRequest.conversationId, turn.conversationId)));
  const [pending] = await db
    .select()
    .from(vaultRequest)
    .where(
      and(
        eq(vaultRequest.kind, "ask"),
        eq(vaultRequest.website, url),
        eq(vaultRequest.agentId, turn.agentId),
        eq(vaultRequest.conversationId, turn.conversationId),
        eq(vaultRequest.requestedBy, turn.requestedBy),
        eq(vaultRequest.status, "pending"),
      ),
    );
  if (pending) return pending;
  const [created] = await db
    .insert(vaultRequest)
    .values({ id: crypto.randomUUID(), kind: "ask", website: url, agentId: turn.agentId, conversationId: turn.conversationId, requestedBy: turn.requestedBy, reason: reason.trim().slice(0, 500) })
    .returning();
  const [bot] = await db.select({ name: agent.name }).from(agent).where(eq(agent.id, turn.agentId));
  await announce(turn.conversationId, { type: "vault.request", bot: bot?.name ?? "bot", item: siteName(url), requestId: created!.id, ask: true });
  return created!;
}

/**
 * Where a bot's request stands, polled by the plugin while it waits. Approved: the login, once its
 * person agreed and while they still belong to its vault and the bot may still read it.
 */
export async function botRequestStatus(turn: VaultTurn, requestId: string) {
  const req = await loadRequest(requestId).catch(() => null);
  if (!req || req.agentId !== turn.agentId || req.conversationId !== turn.conversationId || req.requestedBy !== turn.requestedBy)
    throw new VaultError(tr(messages, "en").requestNotFound, 404);
  if (req.status !== "approved" || !req.vaultItemId) return { status: req.status === "approved" ? ("expired" as const) : req.status };
  if (!req.decidedAt || Date.now() - req.decidedAt.getTime() > DELIVERY_MS) return { status: "expired" as const };
  const { row } = await botItem(turn, req.vaultItemId);
  const s = readSecret(row);
  return { status: req.status, website: row.website, username: row.fields.username ?? "", password: s.password ?? "" };
}

async function requestDto(row: RequestRow, viewer?: Viewer): Promise<VaultRequestDto> {
  const [[bot], [ctx]] = await Promise.all([
    db.select({ name: agent.name }).from(agent).where(eq(agent.id, row.agentId)),
    row.vaultItemId
      ? db
          .select({ title: vaultItem.title, website: vaultItem.website, fields: vaultItem.fields, vaultName: vault.name })
          .from(vaultItem)
          .innerJoin(vault, eq(vault.id, vaultItem.vaultId))
          .where(eq(vaultItem.id, row.vaultItemId))
      : [undefined],
  ]);
  // Waiting for its person to type the login: where it can be saved.
  const choosing = row.kind === "ask" && row.status === "pending" && !!viewer && viewer.id === row.requestedBy;
  const vaults = choosing ? (await readableVaults(row.agentId, viewer.id)).sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "personal" ? -1 : 1)) : null;
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    agentId: row.agentId,
    agentName: bot?.name ?? "",
    item: {
      id: row.vaultItemId,
      title: ctx?.title ?? (row.website ? siteName(row.website) : ""),
      website: ctx?.website ?? row.website,
      ...(ctx?.fields.username && { username: ctx.fields.username }),
    },
    vaultName: ctx?.vaultName ?? "",
    ...(vaults && { vaults: vaults.map((v) => ({ id: v.id, name: v.name, kind: v.kind })) }),
    reason: row.reason,
    requestedBy: row.requestedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Its requester, the conversation's members (read-only) and admins see a request. */
export async function getVaultRequest(viewer: Viewer, id: string) {
  const row = await loadRequest(id);
  if (viewer.role !== "admin" && viewer.id !== row.requestedBy) {
    const member = await db
      .select()
      .from(conversationMember)
      .where(and(eq(conversationMember.conversationId, row.conversationId), eq(conversationMember.userId, viewer.id)));
    if (!member.length) throw new VaultError(tr(messages).requestNotFound, 404);
  }
  return requestDto(row, viewer);
}

/**
 * The person who started the bot's turn agrees or refuses. `live`: whether that turn is still
 * running (bot-runner.ts): a bot that gave up no longer waits for the answer.
 */
export async function decideVaultRequest(viewer: Viewer, id: string, approve: boolean, live: (r: RequestRow) => boolean = () => true) {
  const row = await loadRequest(id);
  if (row.requestedBy !== viewer.id) {
    if (viewer.role === "admin" || (await db.select().from(conversationMember).where(and(eq(conversationMember.conversationId, row.conversationId), eq(conversationMember.userId, viewer.id)))).length)
      throw new VaultError(tr(messages).notYours, 403);
    throw new VaultError(tr(messages).requestNotFound, 404);
  }
  if (row.status === "expired") throw new VaultError(tr(messages).expired, 409);
  if (row.status !== "pending") throw new VaultError(tr(messages).alreadyHandled, 409);
  if (approve && row.kind === "ask") throw new VaultError(tr(messages).notAsk, 400);
  let status: VaultRequestStatus = approve ? "approved" : "denied";
  if (approve && row.vaultItemId) {
    const itemId = row.vaultItemId;
    const [item] = await db.select({ vaultId: vaultItem.vaultId }).from(vaultItem).where(eq(vaultItem.id, itemId));
    const readable = item && (await readableVaults(row.agentId, viewer.id)).some((v) => v.id === item.vaultId);
    if (!readable || !live(row)) status = "expired";
  }
  const [next] = await db
    .update(vaultRequest)
    .set({ status, decidedAt: new Date() })
    .where(and(eq(vaultRequest.id, id), eq(vaultRequest.status, "pending")))
    .returning();
  if (!next) throw new VaultError(tr(messages).alreadyHandled, 409);
  if (status === "expired") throw new VaultError(tr(messages).expired, 409);
  return requestDto(next);
}

export const loginAnswer = z.object({
  vaultId: z.string().min(1).max(100),
  username: z.string().trim().min(1).max(500),
  password: z.string().min(1).max(500),
});

/**
 * Its person types the login a bot asked for: it is saved in the vault they chose (one the bot may read),
 * and the request, approved, points to it, so the bot collects it as any other.
 */
export async function answerLoginRequest(viewer: Viewer, id: string, answer: z.infer<typeof loginAnswer>, live: (r: RequestRow) => boolean = () => true) {
  const row = await loadRequest(id);
  if (row.requestedBy !== viewer.id) {
    if (viewer.role === "admin" || (await db.select().from(conversationMember).where(and(eq(conversationMember.conversationId, row.conversationId), eq(conversationMember.userId, viewer.id)))).length)
      throw new VaultError(tr(messages).notYours, 403);
    throw new VaultError(tr(messages).requestNotFound, 404);
  }
  if (row.kind !== "ask" || !row.website) throw new VaultError(tr(messages).notAsk, 400);
  if (row.status === "expired") throw new VaultError(tr(messages).expired, 409);
  if (row.status !== "pending") throw new VaultError(tr(messages).alreadyHandled, 409);
  if (!(await readableVaults(row.agentId, viewer.id)).some((v) => v.id === answer.vaultId)) throw new VaultError(tr(messages).notReadable, 403);
  // The bot gave up waiting: the login is still worth keeping, the request isn't.
  const waiting = live(row);
  const item = await createItem(viewer.id, answer.vaultId, {
    kind: "login",
    title: siteName(row.website),
    website: row.website,
    fields: { username: answer.username },
    secret: { password: answer.password },
  });
  const [next] = await db
    .update(vaultRequest)
    .set({ vaultItemId: item.id, status: waiting ? "approved" : "expired", decidedAt: new Date() })
    .where(and(eq(vaultRequest.id, id), eq(vaultRequest.status, "pending")))
    .returning();
  if (!next) throw new VaultError(tr(messages).alreadyHandled, 409);
  return requestDto(next, viewer);
}

/** The bot can read at least one vault for this person: its prompt mentions the tools. */
export async function hasReadableVault(agentId: string, userId: string | null) {
  if (!userId) return false;
  return (await readableVaults(agentId, userId)).length > 0;
}

/**
 * The standing rule of a bot that may read a vault for the person who started the turn (Hermes
 * engine: the agora_vault plugin).
 */
export const VAULT_PROMPT = [
  "# Coffre-fort",
  "Tu peux lire le coffre-fort de la personne qui t'a sollicité avec les outils vault_search, vault_contact, vault_use_login et vault_ask_login (tool_describe si tu ne vois pas leurs paramètres).",
  "Les coordonnées (vault_contact) te sont données directement : utilise-les pour remplir un formulaire à sa place.",
  "Le mot de passe d'un identifiant passe toujours par vault_use_login, avec la raison : la personne reçoit une carte dans la conversation et doit l'autoriser. L'outil attend sa réponse. Ne recopie jamais un mot de passe dans ta réponse, un fichier ou une mémoire : saisis-le là où il sert, puis oublie-le.",
  "Un site demande de se connecter et vault_search ne trouve aucun identifiant pour lui : appelle vault_ask_login avec l'adresse du site et la raison. La personne saisit son identifiant et son mot de passe sur une carte dans la conversation ; ils sont enregistrés dans son coffre-fort et l'outil te les rend. Ne lui demande jamais un mot de passe dans le fil de la conversation.",
  "Le numéro et le code de sécurité d'une carte de paiement ne te sont jamais donnés : pour un paiement, demande à la personne de le finaliser elle-même.",
].join("\n");
