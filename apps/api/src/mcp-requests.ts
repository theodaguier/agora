/**
 * MCP connectors requested by a bot in a conversation.
 *
 * The bot emits a ```mcp-request``` block (same mechanism as ```choices```, so
 * it works for every engine); the app stores the declaration in the database,
 * an admin approves it, then the employee enters the secrets or authorizes
 * OAuth from the conversation. Hermes only receives a copy of the declaration,
 * and secrets go straight into its .env without touching the database.
 */
import { guessIntegrationType, INTEGRATION_TYPES, MCP_ENV_INPUTS, type IntegrationType } from "@agora/core";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "./db";
import { env } from "./env";
import {
  agentMcpServers,
  carryMcpSettings,
  dashboard,
  HermesError,
  refreshAgentMcp,
  restartGateway,
  restoreMcpServer,
  setAgentMcp,
  setMcpOAuth,
  shareMcpTokens,
  snapshotMcpServer,
} from "./hermes-admin";
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
    pluginManaged: (name: string) => `“${name}” comes from a Hermes plugin: it's configured in the plugin.`,
  },
  fr: {
    notApproved: "Demande non validée",
    missing: (names: string) => `À renseigner : ${names}`,
    connectionFailed: "Connexion impossible",
    cannotConnect: (reason: string) => `Connexion impossible : ${reason}`,
    notResponding: "le serveur ne répond pas",
    nothingToAuthorize: "Rien à autoriser",
    nameTaken: (name: string) => `Un connecteur « ${name} » existe déjà`,
    pluginManaged: (name: string) => `« ${name} » vient d'un plugin Hermes : il se configure dans le plugin.`,
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
      .array(
        z
          .object({
            name: envName,
            description: z.string().max(300).optional(),
            required: z.boolean().default(true),
            secret: z.boolean().default(false),
            input: z.enum(MCP_ENV_INPUTS).optional(),
            options: z.array(z.string().trim().min(1).max(200)).max(40).optional(),
            accept: z.string().max(120).optional(),
            placeholder: z.string().max(120).optional(),
          })
          .superRefine((row, ctx) => {
            if (row.input === "select" && !row.options?.length) ctx.addIssue({ code: "custom", message: "select needs options", path: ["options"] });
          }),
      )
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
  "- Un serveur distant ne s'authentifie que par `oauth`, `header` ou `none` : il ne reçoit ni variable d'environnement ni fichier. Une clé de compte de service (fichier JSON) ne passe donc que par un serveur local (`command`) avec une entrée `env` de type `file`.",
  "- Serveur local : `command` (ex. `npx`), `args` (ex. `[\"-y\", \"paquet@version\"]`) et `env`. Chaque entrée dit comment la saisir :",
  '  `{"name":"API_TOKEN","description":"…","required":true,"secret":true}` masque la saisie ;',
  '  `{"name":"SERVICE_ACCOUNT_KEY","description":"Fichier JSON du compte de service","required":true,"secret":true,"input":"file","accept":".json,application/json"}` propose un fichier, dont le contenu devient la valeur ;',
  '  `{"name":"SITE_URL","description":"Propriété, ex. sc-domain:exemple.com","required":true,"secret":false}` reste un texte visible ;',
  '  `{"name":"REGION","input":"select","options":["eu","us"],"required":true,"secret":false}` est une liste ; `textarea` sert au texte long.',
  "  `input` vaut `text` (défaut), `secret`, `textarea`, `file` ou `select`. `secret: true` seulement pour un jeton, un mot de passe ou une clé : une URL, un e-mail ou un identifiant public reste visible.",
  "- Préfère le serveur officiel de l'éditeur, distant de préférence, à un paquet communautaire ; dis dans `description` d'où il vient.",
  `- \`type\` : ce à quoi le connecteur donne accès, parmi ${INTEGRATION_TYPES.map((t) => `\`${t}\``).join(", ")}.`,
  "- `name` : minuscules, chiffres et tirets. Ne demande JAMAIS de clé ou de jeton dans la conversation : l'app affiche un formulaire au salarié.",
  "- Regarde d'abord la section « Tes connecteurs MCP » : un connecteur qui y figure déjà ne se redemande pas sous un autre nom.",
  "Un administrateur valide la demande ; une fois le connecteur installé, l'app l'active pour toi et recharge tes outils (préfixe `mcp__<name>__`).",
].join("\n");

/** Prefix of a server's tools in Hermes (tools/mcp_tool_schema.py). */
const toolPrefix = (name: string) => `mcp__${name.replace(/[^A-Za-z0-9_]/g, "_")}__`;

/**
 * The bot's actual connectors, recomputed every turn. Without it the bot can
 * only guess why a tool is missing, and ends up asking the employee to
 * restart a session or re-requesting a connector that already exists.
 */
export async function connectorsPrompt(profile: string, engine: "hermes" | "claude-code" | "codex") {
  const [servers, inProgress] = await Promise.all([
    agentMcpServers(profile).catch(() => []),
    db
      .select({ name: mcpServer.name, status: mcpServer.status })
      .from(mcpServer)
      .where(inArray(mcpServer.status, ["pending", "approved", "authorizing"])),
  ]);
  const on = servers.filter((s) => s.enabled);
  const available = servers.filter((s) => !s.enabled && s.instanceEnabled);
  const where = (s: { url?: string; command?: string }) => (s.url ? `url ${s.url}` : `command ${s.command}`);
  const waiting = { pending: "attend la validation d'un administrateur", approved: "attend ses secrets ou sa connexion", authorizing: "attend l'autorisation OAuth" };
  const lines = ["# Tes connecteurs MCP (état réel, recalculé à chaque message)"];
  if (engine !== "hermes") {
    const name = engine === "codex" ? "Codex" : "Claude Code";
    lines.push(`Tu tournes en ce moment sur le moteur ${name} : aucun connecteur MCP n'y est branché. Si la demande en a besoin, dis-le et propose de repasser sur un modèle Hermes avec le sélecteur de modèle.`);
  } else if (on.length) {
    lines.push(`Activés pour toi : ${on.map((s) => `\`${s.name}\` (outils \`${toolPrefix(s.name)}*\`)`).join(", ")}.`);
  } else {
    lines.push("Aucun connecteur n'est activé pour toi.");
  }
  if (available.length) {
    lines.push(
      `Installés sur l'instance mais pas activés pour toi : ${available.map((s) => `\`${s.name}\` (${where(s)})`).join(", ")}. ` +
        "Pour en obtenir un, émets un bloc `mcp-request` avec exactement ce `name` et la même url ou commande : l'app te l'active sans nouvelle installation (tout de suite si c'est un administrateur qui te parle).",
    );
  }
  if (inProgress.length) lines.push(`En cours d'installation : ${inProgress.map((r) => `\`${r.name}\` (${waiting[r.status as keyof typeof waiting] ?? r.status})`).join(", ")}. Ne les redemande pas.`);
  lines.push(
    "- Ne demande JAMAIS de relancer la session, d'ouvrir une nouvelle conversation ou de redémarrer quoi que ce soit : après une installation, l'app recharge tes outils d'elle-même avant ton message suivant.",
    "- Ne crée pas un deuxième connecteur pour un service déjà listé ci-dessus : utilise ou demande celui qui existe.",
    "- Si un connecteur est activé pour toi mais que tu n'as aucun outil qui commence par son préfixe, ou que ses outils échouent faute de clé ou d'autorisation, dis-le clairement, une seule fois : un administrateur peut ressaisir ses secrets ou relancer sa connexion OAuth avec « Reconfigurer », sur sa ligne dans Marketplace › Installés.",
    "- Pour un connecteur installé, l'app ne propose que ceci : son type, « Reconfigurer » (le même formulaire qu'à l'installation : secrets déclarés, jeton, OAuth), l'interrupteur et la suppression. N'invente aucun autre écran, onglet ou champ. Un serveur distant ne reçoit jamais de fichier ni de variable : s'il lui faut une clé JSON, propose de le retirer et de demander un serveur local à la place.",
  );
  return lines.join("\n");
}

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
    canConnect:
      ((admin || viewer.id === row.requestedBy) && (row.status === "approved" || row.status === "authorizing")) ||
      // An installed connector: only an admin reconfigures it (Marketplace › Installés).
      (admin && row.status === "installed"),
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

/**
 * Name already taken in Hermes or by another request still alive. An installed
 * request whose server was since removed from Installés no longer holds it.
 */
async function nameTaken(name: string) {
  const [servers, rows] = await Promise.all([
    dashboard<{ servers: { name: string }[] }>("/api/mcp/servers").catch(() => ({ servers: [] })),
    db
      .select({ id: mcpServer.id })
      .from(mcpServer)
      .where(and(eq(mcpServer.name, name), inArray(mcpServer.status, ["pending", "approved", "authorizing"]))),
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

type RequestCtx = { conversationId: string; agentId: string; requestedBy: string | null };

async function isAdmin(userId: string | null) {
  const [requester] = userId ? await db.select({ role: user.role }).from(user).where(eq(user.id, userId)) : [];
  return requester?.role === "admin";
}

/**
 * The bot asked for a connector the instance already has (installed from the
 * marketplace, or for another bot): rather than ignoring the request, give it
 * to this bot — right away when an admin asked, otherwise say who can.
 */
async function attachExisting(name: string, ctx: RequestCtx) {
  const [servers, [row], [bot]] = await Promise.all([
    dashboard<{ servers: { name: string }[] }>("/api/mcp/servers").catch(() => ({ servers: [] })),
    db.select({ title: mcpServer.title }).from(mcpServer).where(and(eq(mcpServer.name, name), ne(mcpServer.status, "rejected"))),
    db.select().from(agent).where(eq(agent.id, ctx.agentId)),
  ]);
  const title = row?.title ?? name;
  if (!servers.servers.some((s) => s.name === name)) {
    await postEvent(ctx.conversationId, { type: "mcp.pending", title });
    return;
  }
  if (!bot) return;
  const enabled = (await agentMcpServers(bot.hermesProfile)).find((s) => s.name === name)?.enabled;
  // The default profile sees every server the instance leaves on: an off one is the admin's call.
  if (!enabled && (isDefaultProfile(bot.hermesProfile) || !(await isAdmin(ctx.requestedBy)))) {
    await postEvent(ctx.conversationId, { type: "mcp.notEnabled", title, bot: bot.name });
    return;
  }
  // Already enabled, its tools can only be missing because the profile couldn't read the OAuth tokens.
  let changed = true;
  if (enabled) changed = await shareMcpTokens(bot.hermesProfile);
  else await setAgentMcp(bot.hermesProfile, name, true);
  let restarted = true;
  if (changed) {
    await restartGateway().catch((err) => {
      restarted = false;
      console.error("mcp: gateway restart", err);
    });
  }
  await postEvent(ctx.conversationId, { type: "mcp.enabled", title, bot: bot.name, restartNeeded: !restarted });
}

/** Stores the request emitted by a bot; auto-approved if the requester is an admin. */
export async function createRequest(block: McpRequestBlock, ctx: RequestCtx) {
  await releaseStale(block.name);
  if (await nameTaken(block.name)) {
    await attachExisting(block.name, ctx);
    return null;
  }
  const admin = await isAdmin(ctx.requestedBy);
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

/** What the dashboard says about an instance server (hermes_cli/web_server_mcp.py). */
type HermesServer = {
  name: string;
  url?: string | null;
  command?: string | null;
  args?: string[];
  env?: Record<string, string>;
  auth?: string | null;
  source?: "config" | "plugin";
};

/**
 * Opens an installed connector again, to enter new secrets or authorize again
 * (Marketplace › Installés › Reconfigurer). Returns its request, which the form
 * installs like a first time. A connector installed from a catalog or the
 * registry has none: it's rebuilt from its Hermes declaration, its variables
 * becoming the fields of the form.
 */
export async function reconfigure(name: string, admin: { id: string; role?: string | null }) {
  const { servers } = await dashboard<{ servers: HermesServer[] }>("/api/mcp/servers");
  const server = servers.find((s) => s.name === name);
  if (!server) throw new HermesError(tr(errors).unknownMcpServer, 404);
  if (server.source === "plugin") throw new HermesError(tr(messages).pluginManaged(name), 409);
  const [existing] = await db
    .select()
    .from(mcpServer)
    .where(and(eq(mcpServer.name, name), inArray(mcpServer.status, ["installed", "approved", "authorizing"])))
    .orderBy(desc(mcpServer.createdAt))
    .limit(1);
  const types = await getTypes();
  // Its request, unless the name now points to another server (removed, then installed again from a catalog).
  if (existing && (existing.url ?? existing.command) === (server.url ?? server.command)) return toDto(existing, admin, types);
  const [row] = await db
    .insert(mcpServer)
    .values({
      id: crypto.randomUUID(),
      name,
      title: name,
      url: server.url ?? null,
      command: server.command ?? null,
      args: server.args ?? [],
      // Left empty, a field keeps its current value: none is required.
      env: Object.keys(server.env ?? {}).map((key) => ({ name: key, required: false, secret: false })),
      auth: server.auth === "oauth" || server.auth === "header" ? server.auth : "none",
      status: "installed",
      tools: [],
      requestedBy: admin.id,
      decidedBy: admin.id,
      decidedAt: new Date(),
    })
    .returning();
  return toDto(row!, admin, types);
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
  secrets: { env?: Record<string, string>; bearer_token?: string; oauth_client?: OAuthClient; auth?: Row["auth"] },
) {
  let row = typeof rowOrId === "string" ? await load(rowOrId) : rowOrId;
  if (row.status !== "approved" && row.status !== "authorizing" && row.status !== "installed") throw new HermesError(tr(messages).notApproved, 409);
  // A remote server can change how it authenticates when it's reconfigured.
  if (secrets.auth && row.url && secrets.auth !== row.auth) {
    row = (await db.update(mcpServer).set({ auth: secrets.auth }).where(eq(mcpServer.id, row.id)).returning())[0]!;
  }
  const reconfiguring = row.status === "installed";
  // The declaration in place: a field left empty keeps its value, and a failed reconfiguration puts it back.
  const previous = await snapshotMcpServer(row.name);
  const kept = Object.entries((previous?.cfg.env ?? {}) as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === "string" && !!e[1]);
  const values = { ...Object.fromEntries(kept), ...Object.fromEntries(Object.entries(secrets.env ?? {}).filter(([, v]) => v)) };
  const missing = row.env.filter((e) => e.required && !values[e.name]);
  if (missing.length) throw new HermesError(tr(messages).missing(missing.map((e) => e.name).join(", ")), 400);
  if (row.auth === "header" && !secrets.bearer_token) throw new HermesError(tr(errors).accessTokenRequired, 400);

  const body = row.url
    ? { name: row.name, url: row.url, auth: row.auth, ...(row.auth === "header" && { bearer_token: secrets.bearer_token }) }
    : { name: row.name, command: row.command, args: row.args, env: values };
  // New attempt: start from a clean declaration.
  await dashboard(`/api/mcp/servers/${row.name}`, { method: "DELETE" }).catch(() => {});
  try {
    await dashboard("/api/mcp/servers", { method: "POST", body: JSON.stringify(body) });
  } catch (err) {
    if (reconfiguring && previous) await restoreMcpServer(row.name, previous).catch((e) => console.error("mcp: restore", e));
    throw err;
  }
  if (previous) await carryMcpSettings(row.name, previous.cfg);

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
    // The connector worked before: a mistyped key mustn't take it away.
    if (reconfiguring && previous) await restoreMcpServer(row.name, previous).catch((e) => console.error("mcp: restore", e));
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
  // Never installed before: the bot that asked gets it. Reconfigured: the agents that have it get the new secrets.
  if (row.tools === null) {
    if (bot && !isDefaultProfile(bot.hermesProfile)) await setAgentMcp(bot.hermesProfile, row.name, true);
  } else {
    await refreshAgentMcp(row.name);
  }
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
