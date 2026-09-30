import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { defineMessages, tr } from "./i18n";
import { seal, unseal } from "./sealed";
import { parseEnv } from "./vault";

/**
 * A project's credentials: the .env a GitHub repository needs to run (API keys, database URL…),
 * which its clone does not have since it is never committed. Kept by Agora per repository, in the
 * `setting` table, encrypted (sealed.ts); written into the worktree of each Claude Code session
 * started on it (code-git.ts writeCredentials).
 */

const messages = defineMessages({
  en: {
    badLine: (n: number) => `Line ${n}: expected NAME=value.`,
  },
  fr: {
    badLine: (n: number) => `Ligne ${n} : NOM=valeur attendu.`,
  },
});

export class RepoEnvError extends Error {}

const settingKey = (repo: string) => `repo_env:${repo.toLowerCase()}`;

/** The repository's .env, in clear, as its owner wrote it (comments included); empty when it has none. */
export async function repoEnv(repo: string) {
  const [row] = await db.select({ value: schema.setting.value }).from(schema.setting).where(eq(schema.setting.key, settingKey(repo)));
  if (!row) return "";
  try {
    return unseal(row.value);
  } catch (err) {
    // Unreadable (BETTER_AUTH_SECRET changed): treated as none.
    console.error(`repo env ${repo}: unreadable`, err);
    return "";
  }
}

/** Replaces the repository's .env; an empty text deletes it. */
export async function saveRepoEnv(repo: string, text: string, userId: string) {
  const { entries, errors } = parseEnv(text);
  if (errors.length) throw new RepoEnvError(tr(messages).badLine(errors[0]!.line));
  const key = settingKey(repo);
  if (!entries.length) {
    await db.delete(schema.setting).where(eq(schema.setting.key, key));
    return "";
  }
  const clean = `${text.replace(/\r\n/g, "\n").trim()}\n`;
  const value = seal(clean);
  await db
    .insert(schema.setting)
    .values({ key, value, updatedBy: userId })
    .onConflictDoUpdate({ target: schema.setting.key, set: { value, updatedBy: userId } });
  return clean;
}
