/**
 * The app's own integrations (Settings › Integrations): third-party services
 * Agora itself runs on, not the bots' MCP connectors. Resend sends the
 * invitation and password emails, logo.dev draws the brands' logos.
 *
 * Stored in the `setting` table, one JSON row per integration. Secret fields
 * are encrypted with a key derived from BETTER_AUTH_SECRET: a database dump
 * alone doesn't leak them. The environment variables stay a fallback, for
 * instances configured before this screen existed.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { env } from "./env";
import { defineMessages, tr } from "./i18n";

const messages = defineMessages({
  en: {
    unknown: "Unknown integration.",
    missing: (field: string) => `${field} is required.`,
    resendInvalid: "Resend refused this API key.",
    logoDevInvalid: "logo.dev refused this publishable key.",
    unreachable: (service: string) => `${service} is unreachable, try again.`,
    badFrom: "Expected an address like Agora <no-reply@your-domain.com>.",
  },
  fr: {
    unknown: "Intégration inconnue.",
    missing: (field: string) => `${field} est obligatoire.`,
    resendInvalid: "Resend a refusé cette clé API.",
    logoDevInvalid: "logo.dev a refusé cette clé publique.",
    unreachable: (service: string) => `${service} est injoignable, réessaie.`,
    badFrom: "Adresse attendue du type Agora <no-reply@ton-domaine.com>.",
  },
});

type FieldDef = { name: string; secret: boolean; required: boolean };
type Def = { id: string; fields: FieldDef[]; fromEnv: () => Record<string, string> | null; check: (v: Record<string, string>) => Promise<void> };

export class IntegrationError extends Error {}

const FROM = /^(?:[^<>]*<[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>|[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)$/;

const DEFS = [
  {
    id: "resend",
    fields: [
      { name: "apiKey", secret: true, required: true },
      { name: "from", secret: false, required: true },
    ],
    fromEnv: () => (env.RESEND_API_KEY ? { apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM } : null),
    check: async (v) => {
      if (!FROM.test(v.from!)) throw new IntegrationError(tr(messages).badFrom);
      const res = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${v.apiKey}` },
        signal: AbortSignal.timeout(8000),
      }).catch(() => null);
      if (!res) throw new IntegrationError(tr(messages).unreachable("Resend"));
      if (res.ok) return;
      // A "sending access" key can't list domains, but Resend recognized it.
      const body = (await res.json().catch(() => ({}))) as { name?: string };
      if (body.name !== "restricted_api_key") throw new IntegrationError(tr(messages).resendInvalid);
    },
  },
  {
    id: "logodev",
    fields: [{ name: "publishableKey", secret: false, required: true }],
    fromEnv: () => null,
    check: async (v) => {
      const res = await fetch(`https://img.logo.dev/resend.com?token=${encodeURIComponent(v.publishableKey!)}&size=16`, {
        signal: AbortSignal.timeout(8000),
      }).catch(() => null);
      if (!res) throw new IntegrationError(tr(messages).unreachable("logo.dev"));
      if (res.status === 401 || res.status === 403) throw new IntegrationError(tr(messages).logoDevInvalid);
    },
  },
] satisfies Def[];

export type IntegrationId = (typeof DEFS)[number]["id"];

const settingKey = (id: string) => `integration_${id}`;

/* AES-256-GCM, "iv.tag.ciphertext" in base64url. */
const cryptoKey = () => createHash("sha256").update(`agora-integrations:${env.BETTER_AUTH_SECRET}`).digest();

function seal(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cryptoKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

function open(sealed: string) {
  const [iv, tag, data] = sealed.split(".").map((s) => Buffer.from(s, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", cryptoKey(), iv!);
  decipher.setAuthTag(tag!);
  return Buffer.concat([decipher.update(data!), decipher.final()]).toString("utf8");
}

type Stored = Record<string, string>;
let cache: { at: number; rows: Map<string, Stored> } | null = null;

async function stored(): Promise<Map<string, Stored>> {
  if (cache && Date.now() - cache.at < 10_000) return cache.rows;
  const rows = new Map<string, Stored>();
  for (const def of DEFS) {
    const [row] = await db.select({ value: schema.setting.value }).from(schema.setting).where(eq(schema.setting.key, settingKey(def.id)));
    if (!row) continue;
    try {
      const raw = JSON.parse(row.value) as Stored;
      const values: Stored = {};
      for (const f of def.fields) if (raw[f.name]) values[f.name] = f.secret ? open(raw[f.name]!) : raw[f.name]!;
      rows.set(def.id, values);
    } catch (err) {
      // Unreadable (BETTER_AUTH_SECRET changed): treated as not configured.
      console.error(`integration ${def.id}: unreadable configuration`, err);
    }
  }
  cache = { at: Date.now(), rows };
  return rows;
}

const defOf = (id: string) => DEFS.find((d) => d.id === id);

/** Values in use: the ones saved in the app, else those of the environment. */
export async function integrationConfig(id: IntegrationId): Promise<Stored | null> {
  return (await stored()).get(id) ?? defOf(id)!.fromEnv();
}

/** "re_1a…9f": enough to recognize a key, never enough to use it. */
const redact = (v: string) => (v.length > 10 ? `${v.slice(0, 5)}…${v.slice(-3)}` : "…");

export type IntegrationState = {
  id: IntegrationId;
  /** Where the values in use come from; null = not configured. */
  source: "app" | "env" | null;
  /** Non-secret values in clear, secret ones redacted. */
  values: Record<string, string>;
};

export async function listIntegrations(): Promise<IntegrationState[]> {
  const rows = await stored();
  return DEFS.map((def) => {
    const values: Stored | null = rows.get(def.id) ?? def.fromEnv();
    const source = rows.has(def.id) ? "app" : values ? "env" : null;
    const shown = Object.fromEntries(def.fields.filter((f) => values?.[f.name]).map((f) => [f.name, f.secret ? redact(values![f.name]!) : values![f.name]!]));
    return { id: def.id as IntegrationId, source, values: shown };
  });
}

/** Checks the values against the service, then saves them. An empty secret keeps the current one. */
export async function saveIntegration(id: string, input: Record<string, string>, userId: string) {
  const def = defOf(id);
  if (!def) throw new IntegrationError(tr(messages).unknown);
  const current = (await integrationConfig(def.id as IntegrationId)) ?? {};
  const values: Stored = {};
  for (const f of def.fields) {
    const v = input[f.name]?.trim() || (f.secret ? current[f.name] : "") || "";
    if (f.required && !v) throw new IntegrationError(tr(messages).missing(f.name));
    if (v) values[f.name] = v;
  }
  await def.check(values);
  const raw = JSON.stringify(Object.fromEntries(def.fields.filter((f) => values[f.name]).map((f) => [f.name, f.secret ? seal(values[f.name]!) : values[f.name]!])));
  await db
    .insert(schema.setting)
    .values({ key: settingKey(id), value: raw, updatedBy: userId })
    .onConflictDoUpdate({ target: schema.setting.key, set: { value: raw, updatedBy: userId } });
  cache = null;
}

/** Back to the environment's values, if any. */
export async function removeIntegration(id: string) {
  if (!defOf(id)) throw new IntegrationError(tr(messages).unknown);
  await db.delete(schema.setting).where(eq(schema.setting.key, settingKey(id)));
  cache = null;
}
