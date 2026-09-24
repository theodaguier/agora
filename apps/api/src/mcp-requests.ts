/**
 * MCP connectors requested by a bot in a conversation.
 *
 * The bot emits a ```mcp-request``` block (same mechanism as ```choices```, so
 * it works for every engine); the app stores the declaration in the database,
 * an admin approves it, then the employee enters the secrets or authorizes
 * OAuth from the conversation. Hermes only receives a copy of the declaration,
 * and secrets go straight into its .env without touching the database.
 */
import { guessIntegrationType, INTEGRATION_TYPES, type IntegrationType } from "@agora/core";
import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "./db";
import { env } from "./env";
import { dashboard, HermesError, restartGateway, setAgentMcp, setMcpOAuth } from "./hermes-admin";
import { errors } from "./errors.messages";
import { defineMessages, tr } from "./i18n";

const messages = defineMessages({
  en: {
    notApproved: "Request not approved",
    missing: (names: string) => `Required: ${names}`,
    connectionFailed: "Connection failed",
    cannotConnect: (reason: string) => `Can't connect: ${reason}`,
    notResponding: "the server isn't responding",
    nothingToAuthorize: "Nothing to authorize",
    nameTaken: (name: string) => `A connector named “${name}” already exists`,
  },
  fr: {
    notApproved: "Demande non validée",
    missing: (names: string) => `À renseigner : ${names}`,
    connectionFailed: "Connexion impossible",
    cannotConnect: (reason: string) => `Connexion impossible : ${reason}`,
    notResponding: "le serveur ne répond pas",
    nothingToAuthorize: "Rien à autoriser",
    nameTaken: (name: string) => `Un connecteur « ${name} » existe déjà`,
  },
});
import { isDefaultProfile } from "./hermes";
import { getTypes, setType } from "./integrations";
import { postEvent } from "./messages";

const { agent, mcpServer, user } = schema;
type Row = typeof mcpServer.$inferSelect;

const envName = z.string().regex(/^[A-Z][A-Z0-9_]*$/);

/** Block emitted by the bot. */
export const mcpRequestSchema = z
  .object({
    name: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,59}$/),
    title: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(500).default(""),
    url: z.string().url().startsWith("https://").optional(),
    command: z.string().regex(/^[\w.-]{1,40}$/).optional(),
    args: z.array(z.string().max(500)).max(30).default([]),
    env: z
      .array(z.object({ name: envName, description: z.string().max(300).optional(), required: z.boolean().default(true), secret: z.boolean().default(true) }))
      .max(20)
      .default([]),
    auth: z.enum(["none", "header", "oauth"]).default("none"),
    docs: z.string().url().optional(),
    type: z.enum(INTEGRATION_TYPES).optional(),
  })
  .refine((r) => !!r.url !== !!r.command, "url or command, not both")
  .refine((r) => !r.command || r.auth === "none", "auth is only for remote servers")
  .refine((r) => !r.url || (!r.env.length && !r.args.length), "env and args are only for commands");

export type McpRequestBlock = z.infer<typeof mcpRequestSchema>;

/** Instruction added to the bots' context. */
export const MCP_REQUEST_PROMPT = [
  "# Ajouter un connecteur MCP",
  "Si on te demande de te connecter à un service qui n'est pas parmi tes outils et qu'il existe un serveur MCP pour lui, cherche sa configuration officielle (documentation de l'éditeur, dépôt, registre MCP), puis demande-le à l'app avec ce bloc, seul, à la fin de ta réponse :",
  "```mcp-request",
  '{"name": "pennylane", "title": "Pennylane", "description": "…", "url": "https://…", "auth": "oauth", "docs": "https://…", "type": "finance"}',
  "```",
  "- Serveur distant : `url` (https) et `auth` = `oauth` (connexion via le navigateur), `header` (jeton Bearer) ou `none`.",
  "- OAuth : la plupart des serveurs MCP enregistrent l'app d'eux-mêmes. Si la documentation exige de créer soi-même une application OAuth (Client ID / secret), dis-le dans `description` avec le lien vers la page où la créer : la fiche propose de saisir ce client.",
  '- Serveur local : `command` (ex. `npx`), `args` (ex. `["-y", "paquet@version"]`) et `env` : `[{"name": "API_KEY", "description": "…", "required": true, "secret": true}]`.',
  "- Préfère le serveur officiel de l'éditeur, distant de préférence, à un paquet communautaire ; dis dans `description` d'où il vient.",
  `- \`type\` : ce à quoi le connecteur donne accès, parmi ${INTEGRATION_TYPES.map((t) => `\`${t}\``).join(", ")}.`,
  "- `name` : minuscules, chiffres et tirets. Ne demande JAMAIS de clé ou de jeton dans la conversation : l'app affiche un formulaire au salarié.",
  "Un administrateur valide la demande ; tu auras les outils `mcp__<name>__*` une fois le connecteur installé.",
].join("\n");

export type McpRequestDto = ReturnType<typeof toDto>;

function toDto(row: Row, viewer: { id: string; role?: string | null }, types: Record<string, IntegrationType>) {
  const admin = viewer.role === "admin";
  return {
    type: types[row.name] ?? guessIntegrationType(row.name, row.title, row.description),
    id: row.id,
    name: row.name,
    title: row.title,
    description: row.description,
    transport: row.url ? ("remote" as const) : ("stdio" as const),
    url: row.url,
    command: row.command ? [row.command, ...row.args].join(" ") : null,
    env: row.env,
    auth: row.auth,
    docsUrl: row.docsUrl,
    status: row.status,
    error: row.error,
    tools: row.tools,
    agentId: row.agentId,
    conversationId: row.conversationId,
    createdAt: row.createdAt,
    canDecide: admin && row.status === "pending",
    canConnect: (admin || viewer.id === row.requestedBy) && (row.status === "approved" || row.status === "authorizing"),
    /** To declare in the provider's app when registering an OAuth client by hand. */
    redirectUri: row.auth === "oauth" ? oauthRedirectUri(row.name) : null,
  };
}

async function load(id: string) {
  const [row] = await db.select().from(mcpServer).where(eq(mcpServer.id, id));
  if (!row) throw new HermesError(tr(errors).requestNotFound, 404);
  return row;
}

/** Readable by an admin, the requester, or a member of the originating conversation. */
export async function getRequest(id: string, viewer: { id: string; role?: string | null }) {
  const row = await load(id);
  if (viewer.role !== "admin" && viewer.id !== row.requestedBy) {
    const member = row.conversationId
      ? await db
          .select()
          .from(schema.conversationMember)
          .where(and(eq(schema.conversationMember.conversationId, row.conversationId), eq(schema.conversationMember.userId, viewer.id)))
      : [];
    if (!member.length) throw new HermesError(tr(errors).requestNotFound, 404);
  }
  return toDto(row, viewer, await getTypes());
}

export async function listRequests(viewer: { id: string; role?: string | null }) {
  const [rows, types] = await Promise.all([db.select().from(mcpServer).orderBy(mcpServer.createdAt), getTypes()]);
  return rows.map((r) => toDto(r, viewer, types)).reverse();
}

/** Name already taken in Hermes or by another request still alive. */
async function nameTaken(name: string) {
  const [servers, rows] = await Promise.all([
    dashboard<{ servers: { name: string }[] }>("/api/mcp/servers").catch(() => ({ servers: [] })),
    db.select({ id: mcpServer.id }).from(mcpServer).where(and(eq(mcpServer.name, name), ne(mcpServer.status, "rejected"))),
  ]);
  return servers.servers.some((s) => s.name === name) || rows.length > 0;
}

/**
 * An earlier attempt left unfinished (OAuth abandoned, connection failed) doesn't hold
 * the name: a new request, from a bot or an admin, replaces it.
 */
async function releaseStale(name: string) {
  const stale = await db
    .select({ id: mcpServer.id })
    .from(mcpServer)
    .where(and(eq(mcpServer.name, name), inArray(mcpServer.status, ["approved", "authorizing"])));
  if (!stale.length) return;
  await cancelOAuth(name);
  await dashboard(`/api/mcp/servers/${name}`, { method: "DELETE" }).catch(() => {});
  await db.delete(mcpServer).where(inArray(mcpServer.id, stale.map((r) => r.id)));
}

/** Stores the request emitted by a bot; auto-approved if the requester is an admin. */
export async function createRequest(block: McpRequestBlock, ctx: { conversationId: string; agentId: string; requestedBy: string | null }) {
  await releaseStale(block.name);
  if (await nameTaken(block.name)) {
    await postEvent(ctx.conversationId, { type: "mcp.exists", name: block.name });
    return null;
  }
  const [requester] = ctx.requestedBy ? await db.select({ role: user.role }).from(user).where(eq(user.id, ctx.requestedBy)) : [];
  const admin = requester?.role === "admin";
  const [row] = await db
    .insert(mcpServer)
    .values({
      id: crypto.randomUUID(),
      name: block.name,
      title: block.title ?? block.name,
      description: block.description,
      url: block.url ?? null,
      command: block.command ?? null,
      args: block.args,
      env: block.env,
      auth: block.auth,
      docsUrl: block.docs ?? null,
      status: admin ? "approved" : "pending",
      requestedBy: ctx.requestedBy,
      agentId: ctx.agentId,
      conversationId: ctx.conversationId,
      ...(admin && { decidedBy: ctx.requestedBy, decidedAt: new Date() }),
    })
    .returning();
  await setType(block.name, block.type ?? guessIntegrationType(block.name, block.title, block.description));
  if (admin && needsNothing(row!)) await install(row!, {}).catch(() => {});
  return row!;
}

/**
 * Custom connector declared by an admin from the marketplace: approved right
 * away, then installed by the same steps as a bot's request (secrets or OAuth).
 */
export async function createCustom(block: McpRequestBlock & { type: IntegrationType }, admin: { id: string; role?: string | null }) {
  await releaseStale(block.name);
  if (await nameTaken(block.name)) throw new HermesError(tr(messages).nameTaken(block.name), 409);
  const [row] = await db
    .insert(mcpServer)
    .values({
      id: crypto.randomUUID(),
      name: block.name,
      title: block.title ?? block.name,
      description: block.description,
      url: block.url ?? null,
      command: block.command ?? null,
      args: block.args,
      env: block.env,
      auth: block.auth,
      docsUrl: block.docs ?? null,
      status: "approved",
      requestedBy: admin.id,
      decidedBy: admin.id,
      decidedAt: new Date(),
    })
    .returning();
  await setType(block.name, block.type);
  return toDto(row!, admin, { [block.name]: block.type });
}

const needsNothing = (row: Row) => row.auth === "none" && !row.env.some((e) => e.required);

export async function decide(id: string, adminId: string, approve: boolean) {
  const row = await load(id);
  if (row.status !== "pending") throw new HermesError(tr(errors).requestAlreadyHandled, 409);
  const [next] = await db
    .update(mcpServer)
    .set({ status: approve ? "approved" : "rejected", decidedBy: adminId, decidedAt: new Date() })
    .where(eq(mcpServer.id, id))
    .returning();
  if (row.conversationId) {
    await postEvent(row.conversationId, { type: approve ? "mcp.approved" : "mcp.refused", title: row.title });
  }
  if (approve && needsNothing(next!)) await install(next!, {}).catch(() => {});
}

/**
 * Declares the server in Hermes with the entered secrets. OAuth: it still has
 * to be authorized (startOAuth); otherwise test the connection and enable it right away.
 */
/** Client registered by hand with the provider, for services without dynamic client registration. */
export type OAuthClient = { client_id: string; client_secret?: string; scope?: string };

/** Hermes .env variable holding a server's OAuth client secret (never in the database or config.yaml). */
const clientSecretVar = (name: string) => `MCP_${name.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_CLIENT_SECRET`;

export async function install(
  rowOrId: Row | string,
  secrets: { env?: Record<string, string>; bearer_token?: string; oauth_client?: OAuthClient },
) {
  const row = typeof rowOrId === "string" ? await load(rowOrId) : rowOrId;
  if (row.status !== "approved" && row.status !== "authorizing") throw new HermesError(tr(messages).notApproved, 409);
  const values = secrets.env ?? {};
  const missing = row.env.filter((e) => e.required && !values[e.name]);
  if (missing.length) throw new HermesError(tr(messages).missing(missing.map((e) => e.name).join(", ")), 400);
  if (row.auth === "header" && !secrets.bearer_token) throw new HermesError(tr(errors).accessTokenRequired, 400);

  const body = row.url
    ? { name: row.name, url: row.url, auth: row.auth, ...(row.auth === "header" && { bearer_token: secrets.bearer_token }) }
    : {
        name: row.name,
        command: row.command,
        args: row.args,
        env: Object.fromEntries(row.env.filter((e) => values[e.name]).map((e) => [e.name, values[e.name]!])),
      };
  // New attempt: start from a clean declaration.
  await dashboard(`/api/mcp/servers/${row.name}`, { method: "DELETE" }).catch(() => {});
  await dashboard("/api/mcp/servers", { method: "POST", body: JSON.stringify(body) });

  if (row.auth === "oauth") {
    const client = secrets.oauth_client;
    if (client?.client_secret) {
      await dashboard("/api/env", { method: "PUT", body: JSON.stringify({ key: clientSecretVar(row.name), value: client.client_secret }) });
    } else {
      // No secret this time: don't leave an earlier one behind in Hermes's .env.
      await dashboard("/api/env", { method: "DELETE", body: JSON.stringify({ key: clientSecretVar(row.name) }) }).catch(() => {});
    }
    await setMcpOAuth(row.name, {
      redirect_uri: oauthRedirectUri(row.name),
      client_id: client?.client_id,
      client_secret: client?.client_secret ? `\${${clientSecretVar(row.name)}}` : undefined,
      scope: client?.scope,
    });
    await db.update(mcpServer).set({ status: "authorizing", error: null }).where(eq(mcpServer.id, row.id));
    return;
  }
  const test = await dashboard<{ ok?: boolean; tools?: { name: string }[]; error?: string }>(`/api/mcp/servers/${row.name}/test`, { method: "POST" }).catch(
    (err: Error) => ({ ok: false, error: err.message, tools: undefined }),
  );
  if (!test.ok) {
    await dashboard(`/api/mcp/servers/${row.name}`, { method: "DELETE" }).catch(() => {});
    await db.update(mcpServer).set({ error: test.error ?? tr(messages).connectionFailed }).where(eq(mcpServer.id, row.id));
    throw new HermesError(tr(messages).cannotConnect(test.error ?? tr(messages).notResponding), 400);
  }
  await finish(row, (test.tools ?? []).map((t) => t.name));
}

export const oauthRedirectUri = (name: string) => `${env.WEB_ORIGIN.replace(/\/$/, "")}/api/mcp-oauth/callback/${encodeURIComponent(name)}`;

/**
 * Last OAuth flow started per server. Hermes allows one flow per server at a time
 * and keeps an abandoned one for 5 minutes: a new attempt cancels it first.
 */
const flows = new Map<string, string>();

export async function cancelOAuth(name: string) {
  const flow = flows.get(name);
  if (!flow) return;
  flows.delete(name);
  await dashboard(`/api/mcp/oauth/flows/${encodeURIComponent(flow)}`, { method: "DELETE" }).catch(() => {});
}

/** Starts OAuth authorization: returns the URL the employee opens in their browser. */
export async function startOAuth(id: string) {
  const row = await load(id);
  if (row.status !== "authorizing") throw new HermesError(tr(messages).nothingToAuthorize, 409);
  await cancelOAuth(row.name);
  // A cancelled flow frees its slot once Hermes's worker thread has exited: retry for a few seconds.
  for (let attempt = 0; ; attempt++) {
    try {
      const flow = await dashboard<{ flow_id: string; status: string; authorization_url: string | null; error: string | null }>(
        `/api/mcp/servers/${row.name}/auth`,
        { method: "POST" },
      );
      flows.set(row.name, flow.flow_id);
      return flow;
    } catch (err) {
      if (!(err instanceof HermesError && err.status === 409) || attempt >= 25) throw err;
      await Bun.sleep(800);
    }
  }
}

/** Tracks authorization; once granted, finishes the installation. */
export async function oauthStatus(id: string, flowId: string) {
  const row = await load(id);
  const flow = await dashboard<{ status: string; error: string | null; tools?: { name: string }[] }>(`/api/mcp/oauth/flows/${encodeURIComponent(flowId)}`);
  if (flow.status === "approved" && row.status === "authorizing") await finish(row, (flow.tools ?? []).map((t) => t.name));
  if (flow.status === "error") await db.update(mcpServer).set({ error: flow.error }).where(eq(mcpServer.id, row.id));
  return { status: flow.status, error: flow.error };
}

/** Relays the OAuth callback to the Hermes dashboard, which only listens locally. */
export async function relayOAuthCallback(name: string, query: string) {
  const res = await fetch(new URL(`/api/mcp/oauth/callback/${encodeURIComponent(name)}?${query}`, env.HERMES_DASHBOARD_URL));
  return res.ok;
}

/** Connector reachable: enabled for the requesting bot, then a clean gateway restart. */
async function finish(row: Row, tools: string[]) {
  const [bot] = row.agentId ? await db.select().from(agent).where(eq(agent.id, row.agentId)) : [];
  if (bot && !isDefaultProfile(bot.hermesProfile)) await setAgentMcp(bot.hermesProfile, row.name, true);
  await db.update(mcpServer).set({ status: "installed", tools, error: null }).where(eq(mcpServer.id, row.id));
  let restarted = true;
  await restartGateway().catch((err) => {
    restarted = false;
    console.error("mcp: gateway restart", err);
  });
  if (row.conversationId) {
    await postEvent(row.conversationId, { type: "mcp.installed", title: row.title, tools: tools.length, bot: bot?.name ?? null, restartNeeded: !restarted });
  }
}
