import { createSign, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { env } from "./env";
import { seal, unseal } from "./sealed";

/**
 * GitHub connected the way GitHub intends it: a GitHub App of the instance, created from Agora in
 * one click (GitHub's manifest flow), then installed on the accounts and repositories it may use.
 * No token to copy: Agora signs a JWT with the app's key and gets short-lived installation tokens,
 * one per account it is installed on (E-Do-Studio, a person's account…).
 *
 * 1. `manifestForm` → the browser posts the manifest to GitHub, which creates the app.
 * 2. GitHub comes back to /api/github/app/created?code → `createFromCode` keeps its id and key,
 *    then sends the browser to the app's installation page.
 * 3. GitHub comes back to /api/github/app/installed: the installations are read from GitHub itself.
 *
 * Stored in the `setting` table (one JSON row), the private key and secrets sealed.
 */

const KEY = "github_app";
const API = "https://api.github.com";

type App = { id: number; slug: string; owner: string; pem: string; clientId: string; clientSecret: string; webhookSecret: string | null; htmlUrl: string };

let cache: { at: number; app: App | null } | null = null;

export async function githubApp(): Promise<App | null> {
  if (cache && Date.now() - cache.at < 10_000) return cache.app;
  const [row] = await db.select({ value: schema.setting.value }).from(schema.setting).where(eq(schema.setting.key, KEY));
  let app: App | null = null;
  if (row) {
    try {
      const raw = JSON.parse(row.value);
      app = { ...raw, pem: unseal(raw.pem), clientSecret: unseal(raw.clientSecret), webhookSecret: raw.webhookSecret ? unseal(raw.webhookSecret) : null };
    } catch (err) {
      console.error("github app: unreadable configuration", err);
    }
  }
  cache = { at: Date.now(), app };
  return app;
}

async function saveApp(app: App, userId: string) {
  const value = JSON.stringify({
    ...app,
    pem: seal(app.pem),
    clientSecret: seal(app.clientSecret),
    webhookSecret: app.webhookSecret ? seal(app.webhookSecret) : null,
  });
  await db
    .insert(schema.setting)
    .values({ key: KEY, value, updatedBy: userId })
    .onConflictDoUpdate({ target: schema.setting.key, set: { value, updatedBy: userId } });
  cache = null;
  tokens.clear();
  installationsCache = null;
}

/** Forgets the app (it stays on GitHub, where its owner can delete it). */
export async function removeGithubApp() {
  await db.delete(schema.setting).where(eq(schema.setting.key, KEY));
  cache = null;
  tokens.clear();
  installationsCache = null;
}

/* ---------- creation (manifest flow) ---------- */

const origin = () => env.WEB_ORIGIN.replace(/\/$/, "");

/** Pending creations: the state GitHub hands back, for the admin who started it. */
const states = new Map<string, { userId: string; at: number }>();
const STATE_TTL_MS = 30 * 60_000;

export function takeState(state: string | undefined, userId: string) {
  const s = state ? states.get(state) : undefined;
  if (!s) return false;
  states.delete(state!);
  return s.userId === userId && Date.now() - s.at < STATE_TTL_MS;
}

/** The form the browser posts to GitHub: on the organization when one is given, else on the admin's account. */
export function manifestForm(userId: string, org: string | null, name: string) {
  const state = randomBytes(16).toString("hex");
  states.set(state, { userId, at: Date.now() });
  const manifest = {
    name,
    url: origin(),
    redirect_url: `${origin()}/api/github/app/created`,
    setup_url: `${origin()}/api/github/app/installed`,
    setup_on_update: true,
    public: false,
    // What code sessions do: clone and push, open and merge pull requests, read issues and checks.
    default_permissions: { contents: "write", pull_requests: "write", issues: "write", statuses: "read", checks: "read", metadata: "read", workflows: "write" },
    hook_attributes: { url: `${origin()}/api/github/app/webhook`, active: false },
  };
  const base = org ? `https://github.com/organizations/${encodeURIComponent(org)}/settings/apps/new` : "https://github.com/settings/apps/new";
  return { action: `${base}?state=${state}`, manifest: JSON.stringify(manifest) };
}

/** GitHub's code after creation → the app's credentials, saved. Returns where to install it. */
export async function createFromCode(code: string, userId: string) {
  const res = await fetch(`${API}/app-manifests/${encodeURIComponent(code)}/conversions`, {
    method: "POST",
    headers: { Accept: "application/vnd.github+json", "User-Agent": "agora" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text().catch(() => "")}`);
  const a = (await res.json()) as {
    id: number;
    slug: string;
    html_url: string;
    owner: { login: string };
    pem: string;
    client_id: string;
    client_secret: string;
    webhook_secret: string | null;
  };
  await saveApp(
    { id: a.id, slug: a.slug, owner: a.owner.login, pem: a.pem, clientId: a.client_id, clientSecret: a.client_secret, webhookSecret: a.webhook_secret, htmlUrl: a.html_url },
    userId,
  );
  return `https://github.com/apps/${a.slug}/installations/new`;
}

/* ---------- tokens ---------- */

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");

/** The app's own JWT (10 minutes), to talk to GitHub as the app. */
function appJwt(app: App) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: String(app.id) }))}`;
  return `${body}.${createSign("RSA-SHA256").update(body).sign(app.pem, "base64url")}`;
}

async function asApp<T>(app: App, method: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${appJwt(app)}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "agora" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} on ${path}`);
  return (await res.json()) as T;
}

export type Installation = { id: number; account: string };

let installationsCache: { at: number; list: Installation[] } | null = null;

/** The accounts the app is installed on. Cached a minute. */
export async function installations(): Promise<Installation[]> {
  const app = await githubApp();
  if (!app) return [];
  if (installationsCache && Date.now() - installationsCache.at < 60_000) return installationsCache.list;
  const list = (await asApp<{ id: number; account: { login: string } | null }[]>(app, "GET", "/app/installations?per_page=100")).map((i) => ({
    id: i.id,
    account: i.account?.login ?? "",
  }));
  installationsCache = { at: Date.now(), list };
  return list;
}

export const forgetInstallations = () => {
  installationsCache = null;
};

const tokens = new Map<number, { token: string; expiresAt: number }>();
/** An installation token lives an hour: a new one when less than this is left, so a session's turn keeps it long enough. */
const MIN_LEFT_MS = 45 * 60_000;

async function installationToken(app: App, id: number) {
  const known = tokens.get(id);
  if (known && known.expiresAt - Date.now() > MIN_LEFT_MS) return known.token;
  const t = await asApp<{ token: string; expires_at: string }>(app, "POST", `/app/installations/${id}/access_tokens`);
  tokens.set(id, { token: t.token, expiresAt: Date.parse(t.expires_at) });
  return t.token;
}

/**
 * A token of the app for `repo` (owner/name): the installation on its owner, else the first one.
 * Null without the app or any installation.
 */
export async function githubAppToken(repo?: string | null): Promise<string | null> {
  const app = await githubApp();
  if (!app) return null;
  const list = await installations().catch((err) => (console.error("github app: installations", err), []));
  const owner = repo?.split("/")[0]?.toLowerCase();
  const inst = (owner && list.find((i) => i.account.toLowerCase() === owner)) || list[0];
  if (!inst) return null;
  return installationToken(app, inst.id).catch((err) => (console.error("github app: token", err), null));
}

/** Every installation's token, to list all the repositories the app reaches. */
export async function githubAppTokens(): Promise<string[]> {
  const app = await githubApp();
  if (!app) return [];
  const list = await installations().catch(() => []);
  const all = await Promise.all(list.map((i) => installationToken(app, i.id).catch(() => null)));
  return all.filter((t): t is string => !!t);
}

/** For Settings › Integrations: the app and where it is installed. */
export async function githubAppState() {
  const app = await githubApp();
  if (!app) return null;
  const list = await installations().catch(() => []);
  return { slug: app.slug, owner: app.owner, url: app.htmlUrl, installUrl: `https://github.com/apps/${app.slug}/installations/new`, accounts: list.map((i) => i.account) };
}
