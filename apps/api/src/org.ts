import { eq, inArray } from "drizzle-orm";
import { db, schema } from "./db";

/**
 * Organization settings, chosen at install time (first-run wizard) and then
 * editable by an admin. Stored in the `setting` table.
 */
export type Locale = "fr" | "en";
export type Org = {
  name: string;
  locale: Locale;
  timezone: string;
  setupCompleted: boolean;
  /** Every account must turn on two-step verification before using the app (middleware.ts). */
  requireTwoFactor: boolean;
  image: string | null;
};

const KEYS = {
  name: "org_name",
  locale: "org_locale",
  timezone: "org_timezone",
  setupCompleted: "setup_completed",
  requireTwoFactor: "require_two_factor",
} as const;

export const DEFAULT_ORG: Org = { name: "Agora", locale: "fr", timezone: "Europe/Paris", setupCompleted: false, requireTwoFactor: false, image: null };

/** Row id of the single organization logo. */
export const ORG_AVATAR_ID = "org";

/** Logo URL; changes with every new logo, hence the long cache on the image. */
export const orgAvatarUrl = (at: Date) => `/api/org/avatar?v=${at.getTime()}`;

export const LANGUAGE: Record<Locale, string> = { fr: "français", en: "English" };

let cache: { at: number; org: Org } | null = null;

export async function getOrg(): Promise<Org> {
  if (cache && Date.now() - cache.at < 5000) return cache.org;
  const rows = await db.select().from(schema.setting).where(inArray(schema.setting.key, Object.values(KEYS)));
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  const [logo] = await db.select({ updatedAt: schema.orgAvatar.updatedAt }).from(schema.orgAvatar).where(eq(schema.orgAvatar.id, ORG_AVATAR_ID));
  const org: Org = {
    name: get(KEYS.name) || DEFAULT_ORG.name,
    locale: get(KEYS.locale) === "en" ? "en" : "fr",
    timezone: get(KEYS.timezone) || DEFAULT_ORG.timezone,
    // Setting missing on an instance that already has accounts: installed before
    // the wizard existed (it writes "false" as soon as the admin account is created).
    setupCompleted: get(KEYS.setupCompleted) === undefined ? (await userCount()) > 0 : get(KEYS.setupCompleted) === "true",
    requireTwoFactor: get(KEYS.requireTwoFactor) === "true",
    image: logo ? orgAvatarUrl(logo.updatedAt) : null,
  };
  cache = { at: Date.now(), org };
  return org;
}

export async function saveOrg(patch: Partial<Org>, userId?: string) {
  for (const [field, key] of Object.entries(KEYS) as [keyof typeof KEYS, string][]) {
    const value = patch[field];
    if (value === undefined) continue;
    await db
      .insert(schema.setting)
      .values({ key, value: String(value), updatedBy: userId ?? null })
      .onConflictDoUpdate({ target: schema.setting.key, set: { value: String(value), updatedBy: userId ?? null } });
  }
  cache = null;
}

/** After the logo changed. */
export const invalidateOrg = () => {
  cache = null;
};

export async function userCount() {
  const rows = await db.select({ id: schema.user.id }).from(schema.user).limit(1);
  return rows.length;
}

/** Language chosen by an account, otherwise the organization's. */
export async function userLocale(locale: string | null | undefined): Promise<Locale> {
  return locale === "fr" || locale === "en" ? locale : (await getOrg()).locale;
}

/**
 * Block shared by every agent context: organization memory and language.
 * The language is the other party's (their preference, otherwise the organization's).
 */
export async function orgContext(memory: string, locale?: string | null) {
  const org = await getOrg();
  return [
    memory && `# Mémoire de l'organisation ${org.name} (partagée par tous les agents)\n\n${memory}`,
    `# Langue\nRéponds en ${LANGUAGE[await userLocale(locale)]}, sauf si ton interlocuteur t'écrit dans une autre langue.`,
  ].filter(Boolean) as string[];
}

export { eq };
