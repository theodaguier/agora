/**
 * Credentials vault: the variables of the Hermes .env files, edited through
 * the dashboard (/api/env), which also reconciles the copies Hermes keeps
 * elsewhere (config.yaml, credential pool) when a key rotates.
 *
 * The instance .env is the master copy: new agents are cloned from it. Under
 * the multiplexed gateway each agent only reads its OWN .env, so granting a
 * credential to an agent = writing it into its profile too. Who has what is
 * read back from the files, nothing is stored in the database.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { db, schema } from "./db";
import { env } from "./env";
import { dashboard, HermesError } from "./hermes-admin";
import { isDefaultProfile } from "./hermes";
import { defineMessages, tr } from "./i18n";

const messages = defineMessages({
  en: {
    managed: "This variable is managed by the app.",
    notFound: "Unknown credential",
    badLine: (n: number) => `Line ${n}: expected NAME=value.`,
    managedLine: (n: number, key: string) => `Line ${n}: ${key} is managed by the app.`,
    duplicate: (n: number, key: string) => `Line ${n}: ${key} is already defined above.`,
    emptyValue: (n: number, key: string) => `Line ${n}: ${key} has no value.`,
  },
  fr: {
    managed: "Cette variable est gérée par l'app.",
    notFound: "Credential inconnu",
    badLine: (n: number) => `Ligne ${n} : NOM=valeur attendu.`,
    managedLine: (n: number, key: string) => `Ligne ${n} : ${key} est gérée par l'app.`,
    duplicate: (n: number, key: string) => `Ligne ${n} : ${key} est déjà définie plus haut.`,
    emptyValue: (n: number, key: string) => `Ligne ${n} : ${key} n'a pas de valeur.`,
  },
});

export const KEY = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

/** Per-profile API server settings, written by the app when it creates a profile. */
export const isManaged = (key: string) => /^API_SERVER_/.test(key);

type EnvRow = {
  is_set: boolean;
  redacted_value: string | null;
  description: string;
  category: string;
  channel_managed?: boolean;
};

export type VaultSecret = {
  key: string;
  /** Redacted value, as Hermes shows it (start…end). */
  preview: string | null;
  description: string;
  /** In the instance .env (and so in every agent created from now on). */
  instance: boolean;
  /** Agents whose profile has it. */
  agents: string[];
};

/** Variables actually set in a profile's .env, minus what other screens own. */
export async function profileSecrets(profile: string) {
  const rows = await dashboard<Record<string, EnvRow>>("/api/env", { profile });
  return Object.entries(rows).filter(([key, r]) => r.is_set && !r.channel_managed && !isManaged(key));
}

async function agents() {
  return db.select({ id: schema.agent.id, profile: schema.agent.hermesProfile }).from(schema.agent);
}

type Agents = Awaited<ReturnType<typeof agents>>;

/** Agent profiles other than the instance's, each once. */
const agentProfiles = (all: Agents) => [...new Set(all.map((a) => a.profile).filter((p) => !isDefaultProfile(p)))];

async function buildVault(all: Agents): Promise<VaultSecret[]> {
  const profiles = ["default", ...agentProfiles(all)];
  const found = await Promise.all(profiles.map(async (p) => [p, await profileSecrets(p)] as const));

  const secrets = new Map<string, VaultSecret>();
  for (const [profile, rows] of found) {
    for (const [key, r] of rows) {
      const s = secrets.get(key) ?? { key, preview: r.redacted_value, description: r.description, instance: false, agents: [] };
      if (isDefaultProfile(profile)) {
        s.instance = true;
        s.preview = r.redacted_value;
      }
      s.agents.push(...all.filter((a) => a.profile === profile).map((a) => a.id));
      secrets.set(key, s);
    }
  }
  return [...secrets.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export const listVault = async () => buildVault(await agents());

const put = (profile: string, key: string, value: string) =>
  dashboard("/api/env", { method: "PUT", profile, body: JSON.stringify({ key, value, profile }) });

async function remove(profile: string, key: string) {
  try {
    await dashboard("/api/env", { method: "DELETE", profile, body: JSON.stringify({ key, profile }) });
  } catch (err) {
    if (!(err instanceof HermesError && err.status === 404)) throw err;
  }
}

/** Writes `value` (known) to the instance and to the agents in `agentIds`; removes it from the others. */
async function apply(all: Agents, current: VaultSecret | undefined, key: string, value: string, agentIds: string[], rewrite: boolean) {
  const wanted = new Set(agentIds);
  // A profile can back several agents (legacy): it keeps the key if any of them wants it.
  const had = new Set(all.filter((a) => current?.agents.includes(a.id)).map((a) => a.profile));

  if (rewrite) await put("default", key, value);
  for (const p of agentProfiles(all)) {
    if (all.some((a) => a.profile === p && wanted.has(a.id))) {
      // Unchanged value: only profiles that don't have it yet need a write.
      if (rewrite || !had.has(p)) await put(p, key, value);
    } else if (had.has(p)) {
      await remove(p, key);
    }
  }
}

/**
 * Creates or updates a credential: value in the instance .env, copied into
 * the chosen agents' profiles and removed from the others'. Without `value`,
 * only the agents change (the current value is read back from the instance).
 */
export async function saveSecret(key: string, input: { value?: string; agentIds: string[] }) {
  if (isManaged(key)) throw new HermesError(tr(messages).managed, 400);
  const all = await agents();
  const current = (await buildVault(all)).find((s) => s.key === key);

  let value = input.value;
  if (value === undefined) {
    if (!current?.instance) throw new HermesError(tr(messages).notFound, 404);
    value = (await dashboard<{ value: string }>("/api/env/reveal", { method: "POST", body: JSON.stringify({ key }) })).value;
  }
  await apply(all, current, key, value, input.agentIds, input.value !== undefined);
}

async function deleteEverywhere(all: Agents, key: string) {
  for (const p of ["default", ...agentProfiles(all)]) await remove(p, key);
}

/** Removes the credential from the instance and from every agent. */
export async function deleteSecret(key: string) {
  if (isManaged(key)) throw new HermesError(tr(messages).managed, 400);
  await deleteEverywhere(await agents(), key);
}

/* ---------- developer view: the instance .env as text ---------- */

/** Unquotes a .env value the way python-dotenv (Hermes) reads it, for the common cases. */
function unquote(raw: string) {
  const v = raw.trim();
  const q = v[0];
  if ((q === '"' || q === "'") && v.length >= 2 && v.endsWith(q)) {
    const inner = v.slice(1, -1);
    return q === '"' ? inner.replace(/\\(["\\])/g, "$1").replace(/\\n/g, "\n") : inner;
  }
  // Unquoted: an inline comment starts at " #".
  return v.replace(/\s+#.*$/, "");
}

export type EnvLine = { line: number; key: string; value: string };

/** Parses a .env text; `errors` lists the lines that aren't NAME=value. */
export function parseEnv(text: string) {
  const entries: EnvLine[] = [];
  const errors: { line: number; text: string }[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const l = raw.trim();
    if (!l || l.startsWith("#")) return;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(l);
    if (!m) errors.push({ line: i + 1, text: l });
    else entries.push({ line: i + 1, key: m[1]!, value: unquote(m[2]!) });
  });
  return { entries, errors };
}

/** Quotes a value only when a .env reader would otherwise misread it. */
const quote = (v: string) => (/^[^\s"'#\\]*$/.test(v) ? v : `"${v.replace(/(["\\])/g, "\\$1")}"`);

/** The vault's credentials of the instance .env, in clear: NAME=value per line. */
export async function rawVault() {
  const visible = (await buildVault(await agents())).filter((s) => s.instance).map((s) => s.key);
  const file = await readFile(join(env.HERMES_HOME, ".env"), "utf8").catch(() => "");
  const values = new Map(parseEnv(file).entries.map((e) => [e.key, e.value]));
  return visible
    .filter((k) => values.has(k))
    .map((k) => `${k}=${quote(values.get(k)!)}`)
    .join("\n");
}

/**
 * Applies an edited .env text: new names go to every agent, changed values
 * are rewritten where the credential already is, missing names are deleted
 * everywhere. Returns what changed.
 */
export async function saveRaw(text: string) {
  const { entries, errors } = parseEnv(text);
  const t = tr(messages);
  if (errors.length) throw new HermesError(t.badLine(errors[0]!.line), 400);
  const seen = new Set<string>();
  for (const e of entries) {
    if (isManaged(e.key)) throw new HermesError(t.managedLine(e.line, e.key), 400);
    if (seen.has(e.key)) throw new HermesError(t.duplicate(e.line, e.key), 400);
    if (!e.value) throw new HermesError(t.emptyValue(e.line, e.key), 400);
    seen.add(e.key);
  }

  const all = await agents();
  const vault = await buildVault(all);
  const file = await readFile(join(env.HERMES_HOME, ".env"), "utf8").catch(() => "");
  const values = new Map(parseEnv(file).entries.map((e) => [e.key, e.value]));
  const byKey = new Map(vault.map((s) => [s.key, s]));
  const changes = { added: [] as string[], updated: [] as string[], removed: [] as string[] };

  for (const e of entries) {
    const current = byKey.get(e.key);
    if (!current) {
      await apply(all, undefined, e.key, e.value, all.map((a) => a.id), true);
      changes.added.push(e.key);
    } else if (!current.instance || values.get(e.key) !== e.value) {
      await apply(all, current, e.key, e.value, current.agents, true);
      changes.updated.push(e.key);
    }
  }
  // Only what the developer view showed can be removed from it.
  for (const s of vault) {
    if (s.instance && values.has(s.key) && !seen.has(s.key)) {
      await deleteEverywhere(all, s.key);
      changes.removed.push(s.key);
    }
  }
  return changes;
}
