import { lstat, mkdir, readdir, rm, symlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";

/**
 * The subscriptions a CLI engine (Claude Code, Codex) runs on: the machine's own login, plus accounts
 * the owner signs in from Agora, each in its own config directory under ~/.agora/<name>. The CLI keeps
 * and refreshes their credentials there; Agora only stores which account is active, and each one's
 * email and plan (a `setting` row).
 *
 * Every account directory links the machine's session folders (`shared`): a conversation keeps
 * resuming its session when the account changes.
 */
export type SubscriptionAccount = { id: string; email: string; plan: string | null; addedAt: string };
/** `active`: the account in use, null for the machine's own login. */
type Stored = { active: string | null; accounts: SubscriptionAccount[] };

/** What Settings › Models shows under the CLI's row. */
export type SubscriptionAccountsState = {
  machine: { loggedIn: boolean; email: string | null; plan: string | null };
  active: string | null;
  /** `loggedIn` false: its login expired or was revoked, to sign in again. */
  accounts: (SubscriptionAccount & { loggedIn: boolean })[];
};

export class AccountNotFound extends Error {}

export function subscriptionAccounts(opts: {
  /** `setting` key. */
  key: string;
  /** Folder name under ~/.agora. */
  folder: string;
  /** Session folders of the machine's config directory, linked into every account's. */
  shared: () => { name: string; target: string }[];
  /** Signs a directory out, so its credentials don't outlive it (the Keychain on macOS). */
  logout: (dir: string) => Promise<void>;
}) {
  let cache: Promise<Stored> | null = null;

  function stored(): Promise<Stored> {
    cache ??= db
      .select({ value: schema.setting.value })
      .from(schema.setting)
      .where(eq(schema.setting.key, opts.key))
      .then(([row]) => (row ? (JSON.parse(row.value) as Stored) : { active: null, accounts: [] }))
      .catch((err) => {
        cache = null;
        throw err;
      });
    return cache;
  }

  async function save(value: Stored, userId: string) {
    const raw = JSON.stringify(value);
    await db
      .insert(schema.setting)
      .values({ key: opts.key, value: raw, updatedBy: userId })
      .onConflictDoUpdate({ target: schema.setting.key, set: { value: raw, updatedBy: userId } });
    cache = Promise.resolve(value);
  }

  const root = () => join(homedir(), ".agora", opts.folder);
  const dir = (id: string) => join(root(), id);

  return {
    stored,
    dir,

    /** Creates the directory and links the shared session folders into it. */
    async prepare(target: string) {
      await mkdir(target, { recursive: true });
      for (const s of opts.shared()) {
        await mkdir(s.target, { recursive: true });
        if (!(await lstat(join(target, s.name)).catch(() => null))) await symlink(s.target, join(target, s.name));
      }
    },

    /** Id of the account in use, null for the machine's login. */
    async activeId() {
      const s = await stored();
      return s.accounts.some((a) => a.id === s.active) ? s.active : null;
    },

    async add(account: SubscriptionAccount, userId: string) {
      const s = await stored();
      await save({ ...s, accounts: [...s.accounts, account] }, userId);
    },

    /** The account the engine runs on from the next turn; null for the machine's login. */
    async activate(id: string | null, userId: string) {
      const s = await stored();
      if (id && !s.accounts.some((a) => a.id === id)) throw new AccountNotFound();
      await save({ ...s, active: id }, userId);
    },

    /** Signs the account out of Agora; removing the active one puts the engine back on the machine's login. */
    async remove(id: string, userId: string) {
      const s = await stored();
      if (!s.accounts.some((a) => a.id === id)) throw new AccountNotFound();
      await save({ active: s.active === id ? null : s.active, accounts: s.accounts.filter((a) => a.id !== id) }, userId);
      await opts.logout(dir(id));
      // The shared folders are links: rm removes the links, not the sessions.
      await rm(dir(id), { recursive: true, force: true });
    },

    /** Drops a directory: signed out, then deleted. */
    async discard(target: string) {
      await opts.logout(target);
      await rm(target, { recursive: true, force: true });
    },

    /** Directories of sign-ins cut short by an API restart: neither an account nor a sign-in in progress. */
    async sweep(pending: Iterable<string>) {
      const known = new Set([...(await stored()).accounts.map((a) => a.id), ...pending]);
      for (const id of (await readdir(root()).catch(() => [] as string[])).filter((d) => !known.has(d))) await this.discard(dir(id));
    },
  };
}
