import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "./env";
import { childEnv, claudeEnv } from "./harden";
import { defineMessages, tr } from "./i18n";
import { AccountNotFound, subscriptionAccounts, type SubscriptionAccountsState } from "./subscription-accounts";

/**
 * Claude subscriptions the Claude Code engine runs on (Settings › Models, Claude Code row): the
 * machine's own `claude` login, plus accounts signed in from Agora with `claude auth login`, each in
 * its own config directory whose `projects/` links the machine's (subscription-accounts.ts).
 * They all belong to the Claude Code owner (CLAUDE_CODE_OWNER_EMAIL).
 */

const messages = defineMessages({
  en: {
    noUrl: "Claude Code didn't give a sign-in link.",
    loginGone: "This sign-in expired: start again.",
    codeRefused: (detail: string) =>
      `Claude refused this code${detail ? ` (${detail})` : ""}. A code only works once, for the page opened from this window: open the sign-in page again and paste the new code.`,
    loginTimeout: "Claude Code didn't confirm the sign-in: start again.",
    machineAccount: "This account is already this machine's login.",
    duplicate: "This account is already added.",
    notFound: "Unknown Claude account.",
  },
  fr: {
    noUrl: "Claude Code n'a pas donné de lien de connexion.",
    loginGone: "Cette connexion a expiré : recommence.",
    codeRefused: (detail: string) =>
      `Claude a refusé ce code${detail ? ` (${detail})` : ""}. Un code ne sert qu'une fois, pour la page ouverte depuis cette fenêtre : rouvre la page de connexion et colle le nouveau code.`,
    loginTimeout: "Claude Code n'a pas confirmé la connexion : recommence.",
    machineAccount: "Ce compte est déjà celui de la connexion de cette machine.",
    duplicate: "Ce compte est déjà ajouté.",
    notFound: "Compte Claude inconnu.",
  },
});

export class ClaudeAccountError extends Error {}

/** The machine's config directory, whose `projects/` every account shares. */
const machineConfigDir = () => process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");

/** `claude` in an account's directory: an API key in the environment would take precedence over its login. */
function accountEnv(dir: string) {
  const out = childEnv({ CLAUDE_CONFIG_DIR: dir, BROWSER: "true" });
  delete out.ANTHROPIC_API_KEY;
  delete out.ANTHROPIC_AUTH_TOKEN;
  delete out.CLAUDE_CODE_OAUTH_TOKEN;
  return out;
}

async function logout(dir: string) {
  const proc = Bun.spawn([env.CLAUDE_CODE_BIN, "auth", "logout"], { cwd: tmpdir(), env: accountEnv(dir), stdout: "ignore", stderr: "ignore", stdin: "ignore", timeout: 15_000 });
  await proc.exited;
}

const accounts = subscriptionAccounts({
  key: "claude_code_accounts",
  folder: "claude-accounts",
  shared: () => [{ name: "projects", target: join(machineConfigDir(), "projects") }],
  logout,
});

/** Id of the account in use, null for the machine's login: the models Claude Code offers depend on it. */
export const activeClaudeAccountId = () => accounts.activeId();

/** Environment of a `claude` process: the active account's directory, else the machine's login (its token, if set). */
export async function claudeCodeEnv() {
  const id = await accounts.activeId();
  if (!id) return claudeEnv();
  await accounts.prepare(accounts.dir(id));
  return accountEnv(accounts.dir(id));
}

type AuthStatus = { loggedIn?: boolean; email?: string; subscriptionType?: string };
const statusCache = new Map<string, { at: number; status: Promise<AuthStatus | null> }>();

/** `claude auth status` of a config directory (undefined: the machine's), cached a minute. */
function authStatus(dir?: string, fresh = false): Promise<AuthStatus | null> {
  const key = dir ?? "";
  const cached = statusCache.get(key);
  if (!fresh && cached && Date.now() - cached.at < 60_000) return cached.status;
  const status = (async () => {
    const proc = Bun.spawn([env.CLAUDE_CODE_BIN, "auth", "status", "--json"], {
      cwd: tmpdir(),
      env: dir ? accountEnv(dir) : claudeEnv(),
      stdout: "pipe",
      stderr: "ignore",
      stdin: "ignore",
      timeout: 15_000,
    });
    try {
      return JSON.parse(await new Response(proc.stdout).text()) as AuthStatus;
    } catch {
      return null;
    }
  })();
  statusCache.set(key, { at: Date.now(), status });
  return status;
}

export async function listClaudeAccounts(): Promise<SubscriptionAccountsState> {
  const [s, active, machine] = await Promise.all([accounts.stored(), accounts.activeId(), authStatus()]);
  const statuses = await Promise.all(s.accounts.map((a) => authStatus(accounts.dir(a.id))));
  return {
    machine: { loggedIn: !!machine?.loggedIn, email: machine?.email ?? null, plan: machine?.subscriptionType ?? null },
    active,
    accounts: s.accounts.map((a, i) => ({ ...a, plan: statuses[i]?.subscriptionType ?? a.plan, loggedIn: !!statuses[i]?.loggedIn })),
  };
}

const notFound = (err: unknown): never => {
  throw err instanceof AccountNotFound ? new ClaudeAccountError(tr(messages).notFound) : err;
};

export const activateClaudeAccount = (id: string | null, userId: string) => accounts.activate(id, userId).catch(notFound);

export async function removeClaudeAccount(id: string, userId: string) {
  await accounts.remove(id, userId).catch(notFound);
  statusCache.delete(accounts.dir(id));
}

/* ---------- Signing an account in ---------- */

/** `output`: what the CLI printed so far. */
type Login = { dir: string; proc: Bun.Subprocess<"pipe", "pipe", "pipe">; output: () => string; timer: Timer };
/** Sign-ins waiting for their code, by account id. */
const logins = new Map<string, Login>();
const LOGIN_TTL = 10 * 60_000;

/** Ends a sign-in; `keep`: its directory became an account. */
async function dropLogin(id: string, keep = false) {
  const login = logins.get(id);
  if (!login) return;
  logins.delete(id);
  clearTimeout(login.timer);
  if (login.proc.exitCode === null) login.proc.kill();
  if (!keep) await accounts.discard(login.dir);
}

/**
 * Starts `claude auth login` in a new account directory. Returns the page where the owner signs in;
 * the code that page shows then goes to `finishClaudeLogin`.
 */
export async function startClaudeLogin(): Promise<{ loginId: string; url: string }> {
  await accounts.sweep(logins.keys());
  const id = crypto.randomUUID();
  const dir = accounts.dir(id);
  await accounts.prepare(dir);
  // `timeout`: a sign-in the API forgot (dev reload) doesn't wait forever.
  const proc = Bun.spawn([env.CLAUDE_CODE_BIN, "auth", "login", "--claudeai"], {
    cwd: tmpdir(),
    env: accountEnv(dir),
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    timeout: LOGIN_TTL,
  });
  const decoder = new TextDecoder();
  let text = "";
  let found: (url: string) => void = () => {};
  const url = new Promise<string | null>((resolve) => {
    found = resolve;
    setTimeout(() => resolve(null), 20_000);
  });
  const read = async (stream: ReadableStream<Uint8Array>) => {
    for await (const chunk of stream) {
      text += decoder.decode(chunk, { stream: true });
      const m = text.match(/https:\/\/\S+\/oauth\/authorize\?\S+/);
      if (m) found(m[0]);
    }
  };
  void Promise.all([read(proc.stdout), read(proc.stderr)]);
  logins.set(id, { dir, proc, output: () => text, timer: setTimeout(() => void dropLogin(id), LOGIN_TTL) });
  const link = await url;
  if (!link) {
    await dropLogin(id);
    throw new ClaudeAccountError(tr(messages).noUrl);
  }
  return { loginId: id, url: link };
}

/** Hands the code to the waiting `claude auth login`, then adds the account it signed in. */
export async function finishClaudeLogin(loginId: string, code: string, userId: string) {
  const t = tr(messages);
  const login = logins.get(loginId);
  if (!login || login.proc.exitCode !== null) {
    await dropLogin(loginId);
    throw new ClaudeAccountError(t.loginGone);
  }
  login.proc.stdin.write(`${code.trim()}\n`);
  login.proc.stdin.flush();
  login.proc.stdin.end();

  // The CLI doesn't always exit once signed in: its own status says when the login went through.
  let status: AuthStatus | null = null;
  let failed = "";
  const until = Date.now() + 60_000;
  while (Date.now() < until) {
    await Bun.sleep(1000);
    // "Paste code here if prompted > Login failed: Request failed with status code 400": a wrong or reused code.
    failed = login.output().replace(/Paste code here if prompted >/g, "\n").split("\n").map((l) => l.trim()).find((l) => /^Login failed/i.test(l)) ?? "";
    if (failed) break;
    status = await authStatus(login.dir, true);
    if (status?.loggedIn && status.email) break;
    if (login.proc.exitCode !== null && login.proc.exitCode !== 0) break;
  }
  if (!status?.loggedIn || !status.email) {
    console.error(`claude login: not signed in (exit ${login.proc.exitCode})`, login.output().replace(/https:\/\/\S+/g, "<url>").slice(-500));
    await dropLogin(loginId);
    if (!failed && login.proc.exitCode === null) throw new ClaudeAccountError(t.loginTimeout);
    const detail = failed && !/status code 400/.test(failed) ? failed.replace(/^Login failed:\s*/i, "") : "";
    throw new ClaudeAccountError(t.codeRefused(detail.slice(0, 200)));
  }

  const email = status.email.toLowerCase();
  const [s, machine] = await Promise.all([accounts.stored(), authStatus()]);
  if (machine?.email?.toLowerCase() === email || s.accounts.some((a) => a.email.toLowerCase() === email)) {
    // Signs the extra directory out; the account itself stays signed in elsewhere.
    await dropLogin(loginId);
    throw new ClaudeAccountError(machine?.email?.toLowerCase() === email ? t.machineAccount : t.duplicate);
  }
  await dropLogin(loginId, true);
  await accounts.add({ id: loginId, email: status.email, plan: status.subscriptionType ?? null, addedAt: new Date().toISOString() }, userId);
}

/** Abandoned sign-in (dialog closed). */
export const cancelClaudeLogin = (loginId: string) => dropLogin(loginId);
