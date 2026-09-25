import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { codexAppServer } from "./codex-app-server";
import { env } from "./env";
import { childEnv } from "./harden";
import { defineMessages, tr } from "./i18n";
import { AccountNotFound, subscriptionAccounts, type SubscriptionAccountsState } from "./subscription-accounts";

/**
 * ChatGPT subscriptions the Codex engine runs on (Settings › Models, Codex row): the machine's own
 * `codex` login, plus accounts signed in from Agora with `codex login --device-auth`, each in its own
 * CODEX_HOME whose `sessions/` links the machine's (subscription-accounts.ts).
 * They all belong to the Codex owner (CODEX_OWNER_EMAIL, else CLAUDE_CODE_OWNER_EMAIL).
 */

const messages = defineMessages({
  en: {
    noCode: "Codex didn't give a sign-in code.",
    loginGone: "This sign-in expired: start again.",
    loginFailed: "The sign-in didn't go through: start again.",
    machineAccount: "This account is already this machine's login.",
    duplicate: "This account is already added.",
    notFound: "Unknown ChatGPT account.",
  },
  fr: {
    noCode: "Codex n'a pas donné de code de connexion.",
    loginGone: "Cette connexion a expiré : recommence.",
    loginFailed: "La connexion n'a pas abouti : recommence.",
    machineAccount: "Ce compte est déjà celui de la connexion de cette machine.",
    duplicate: "Ce compte est déjà ajouté.",
    notFound: "Compte ChatGPT inconnu.",
  },
});

export class CodexAccountError extends Error {}

/** The machine's CODEX_HOME, whose `sessions/` every account shares. */
const machineHome = () => process.env.CODEX_HOME || join(homedir(), ".codex");

/** `codex` in an account's directory: an API key in the environment would take precedence over its login. */
function accountEnv(dir: string) {
  const out = childEnv({ CODEX_HOME: dir, BROWSER: "true" });
  delete out.OPENAI_API_KEY;
  delete out.CODEX_API_KEY;
  return out;
}

async function logout(dir: string) {
  const proc = Bun.spawn([env.CODEX_BIN, "logout"], { cwd: tmpdir(), env: accountEnv(dir), stdout: "ignore", stderr: "ignore", stdin: "ignore", timeout: 15_000 });
  await proc.exited;
}

const accounts = subscriptionAccounts({
  key: "codex_accounts",
  folder: "codex-accounts",
  shared: () => ["sessions", "archived_sessions"].map((name) => ({ name, target: join(machineHome(), name) })),
  logout,
});

/** Id of the account in use, null for the machine's login: the models Codex offers depend on it. */
export const activeCodexAccountId = () => accounts.activeId();

/** Environment of a `codex` process: the active account's directory, else the machine's login. */
export async function codexEnv() {
  const id = await accounts.activeId();
  if (!id) return childEnv();
  await accounts.prepare(accounts.dir(id));
  return accountEnv(accounts.dir(id));
}

type Account = { email: string | null; plan: string | null } | null;
const accountCache = new Map<string, { at: number; account: Promise<Account> }>();

/** The ChatGPT account signed in a CODEX_HOME (undefined: the machine's), cached a minute. */
function accountOf(dir?: string, fresh = false): Promise<Account> {
  const key = dir ?? "";
  const cached = accountCache.get(key);
  if (!fresh && cached && Date.now() - cached.at < 60_000) return cached.account;
  const account = codexAppServer<[{ account?: { type?: string; email?: string; planType?: string } | null }]>(dir ? accountEnv(dir) : childEnv(), [
    { method: "account/read" },
  ])
    .then(([r]) => (r.account ? { email: r.account.email ?? null, plan: r.account.planType ?? null } : null))
    .catch(() => null);
  accountCache.set(key, { at: Date.now(), account });
  return account;
}

export async function listCodexAccounts(): Promise<SubscriptionAccountsState> {
  const [s, active, machine] = await Promise.all([accounts.stored(), accounts.activeId(), accountOf()]);
  const signedIn = await Promise.all(s.accounts.map((a) => accountOf(accounts.dir(a.id))));
  return {
    machine: { loggedIn: !!machine, email: machine?.email ?? null, plan: machine?.plan ?? null },
    active,
    accounts: s.accounts.map((a, i) => ({ ...a, plan: signedIn[i]?.plan ?? a.plan, loggedIn: !!signedIn[i] })),
  };
}

const notFound = (err: unknown): never => {
  throw err instanceof AccountNotFound ? new CodexAccountError(tr(messages).notFound) : err;
};

export const activateCodexAccount = (id: string | null, userId: string) => accounts.activate(id, userId).catch(notFound);

export async function removeCodexAccount(id: string, userId: string) {
  await accounts.remove(id, userId).catch(notFound);
  accountCache.delete(accounts.dir(id));
}

/* ---------- Signing an account in (device code) ---------- */

type Login = { dir: string; proc: Bun.Subprocess<"ignore", "pipe", "pipe">; state: "pending" | "done" | "failed"; error?: string };
/** Sign-ins in progress or just ended, by account id. */
const logins = new Map<string, Login>();
/** How long OpenAI keeps a device code valid. */
const CODE_TTL = 15 * 60_000;

/** Ends a sign-in; `keep`: its directory became an account. */
async function dropLogin(id: string, keep = false) {
  const login = logins.get(id);
  if (!login) return;
  if (login.proc.exitCode === null) login.proc.kill();
  if (!keep) await accounts.discard(login.dir);
}

/**
 * Starts `codex login --device-auth` in a new account directory. Returns the page and the one-time
 * code to enter there; the sign-in then completes by itself (`codexLoginState`).
 */
export async function startCodexLogin(userId: string): Promise<{ loginId: string; url: string; code: string }> {
  await accounts.sweep([...logins].filter(([, l]) => l.state === "pending").map(([id]) => id));
  const id = crypto.randomUUID();
  const dir = accounts.dir(id);
  await accounts.prepare(dir);
  const proc = Bun.spawn([env.CODEX_BIN, "login", "--device-auth"], { cwd: tmpdir(), env: accountEnv(dir), stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: CODE_TTL });
  const login: Login = { dir, proc, state: "pending" };
  logins.set(id, login);

  const decoder = new TextDecoder();
  let text = "";
  let found: (v: { url: string; code: string }) => void = () => {};
  const prompt = new Promise<{ url: string; code: string } | null>((resolve) => {
    found = resolve;
    setTimeout(() => resolve(null), 20_000);
  });
  const read = async (stream: ReadableStream<Uint8Array>) => {
    for await (const chunk of stream) {
      // Colors and the rest of the terminal formatting out.
      text += decoder.decode(chunk, { stream: true }).replace(/\x1b\[[0-9;]*m/g, "");
      const url = text.match(/https:\/\/\S+\/device\b\S*/)?.[0];
      const code = text.match(/\b[A-Z0-9]{4}-[A-Z0-9]{4,6}\b/)?.[0];
      if (url && code) found({ url, code });
    }
  };
  void Promise.all([read(proc.stdout), read(proc.stderr)]);
  void proc.exited.then((exit) => finishLogin(id, exit, userId));

  const shown = await prompt;
  if (!shown) {
    await dropLogin(id);
    logins.delete(id);
    throw new CodexAccountError(tr(messages).noCode);
  }
  return { loginId: id, ...shown };
}

/** `codex login` exited: signed in (the account is added) or not. */
async function finishLogin(id: string, exit: number, userId: string) {
  const login = logins.get(id);
  if (!login || login.state !== "pending") return;
  const t = tr(messages);
  const fail = async (error: string) => {
    login.state = "failed";
    login.error = error;
    await dropLogin(id);
  };
  const account = exit === 0 ? await accountOf(login.dir, true) : null;
  if (!account?.email) return fail(t.loginFailed);
  const email = account.email.toLowerCase();
  const [s, machine] = await Promise.all([accounts.stored(), accountOf()]);
  if (machine?.email?.toLowerCase() === email) return fail(t.machineAccount);
  if (s.accounts.some((a) => a.email.toLowerCase() === email)) return fail(t.duplicate);
  await accounts.add({ id, email: account.email, plan: account.plan, addedAt: new Date().toISOString() }, userId);
  login.state = "done";
}

/** Where a sign-in stands; forgotten once read after it ended. */
export function codexLoginState(loginId: string): { state: Login["state"]; error?: string } {
  const login = logins.get(loginId);
  if (!login) return { state: "failed", error: tr(messages).loginGone };
  if (login.state !== "pending") logins.delete(loginId);
  return { state: login.state, error: login.error };
}

/** Abandoned sign-in (dialog closed). */
export async function cancelCodexLogin(loginId: string) {
  const login = logins.get(loginId);
  if (!login || login.state !== "pending") return;
  login.state = "failed";
  await dropLogin(loginId);
  logins.delete(loginId);
}
