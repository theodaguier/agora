/**
 * AI providers of the instance: the API keys Hermes signs in with and the
 * default model. Shared by the setup wizard and Admin › Models.
 *
 * A key goes to the instance .env and to every agent's: under the multiplexed
 * gateway each agent only reads its own (vault.ts).
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { db, schema } from "./db";
import { hermesApi, isDefaultProfile, profileHome } from "./hermes";
import { dashboard, HermesError, restartGateway } from "./hermes-admin";
import { deleteSecret, saveSecret } from "./vault";
import { defineMessages, tr } from "./i18n";

const messages = defineMessages({
  en: {
    hermesUnreachable: (status: number) => `Hermes is unreachable (${status})`,
    noApiKey: "This provider can't be configured with an API key here.",
    keyRejected: "Key rejected by the provider.",
    noReply: (status: number) => `No reply from the model (HTTP ${status}).`,
  },
  fr: {
    hermesUnreachable: (status: number) => `Hermes injoignable (${status})`,
    noApiKey: "Ce fournisseur ne se configure pas par clé API ici.",
    keyRejected: "Clé refusée par le fournisseur.",
    noReply: (status: number) => `Pas de réponse du modèle (HTTP ${status}).`,
  },
});

export type Provider = { slug: string; name: string; keyEnv: string | null; configured: boolean; models: string[] };

type RawProvider = { slug: string; name: string; auth_type?: string | null; key_env?: string | null; authenticated?: boolean; models?: string[] };

/** Providers configurable by API key, plus the ones already signed in some other way (OAuth from the CLI). */
export async function providerList() {
  const res = await hermesApi("default", "/api/model/options?refresh=true");
  if (!res.ok) throw new HermesError(tr(messages).hermesUnreachable(res.status));
  const raw = (await res.json()) as { provider: string; model: string; providers: RawProvider[] };
  return {
    current: { provider: raw.provider, model: raw.model },
    providers: raw.providers
      .filter((p) => (p.auth_type === "api_key" && p.key_env) || (p.authenticated && p.models?.length && p.auth_type !== "virtual"))
      .map((p): Provider => ({ slug: p.slug, name: p.name, keyEnv: p.key_env || null, configured: !!p.authenticated, models: p.models ?? [] }))
      .sort((a, b) => Number(b.configured) - Number(a.configured) || a.name.localeCompare(b.name)),
  };
}

async function keyProvider(slug: string) {
  const provider = (await providerList()).providers.find((p) => p.slug === slug);
  if (!provider?.keyEnv) throw new HermesError(tr(messages).noApiKey, 400);
  return { ...provider, keyEnv: provider.keyEnv };
}

const agentIds = async () => (await db.select({ id: schema.agent.id }).from(schema.agent)).map((a) => a.id);

/**
 * Checks the key with the provider, then gives it to the instance and every agent.
 * `restart`: agents only read their .env when the gateway starts (not needed in the
 * wizard, which has no agent yet).
 */
export async function saveProviderKey(slug: string, apiKey: string, opts: { restart: boolean }) {
  const provider = await keyProvider(slug);
  const check = await dashboard<{ ok: boolean; reachable: boolean; message?: string }>("/api/providers/validate", {
    method: "POST",
    body: JSON.stringify({ key: provider.keyEnv, value: apiKey }),
  });
  if (!check.ok && check.reachable) throw new HermesError(check.message || tr(messages).keyRejected, 400);
  await saveSecret(provider.keyEnv, { value: apiKey, agentIds: await agentIds() });
  if (opts.restart) await restartGateway();

  const refreshed = (await providerList()).providers.find((p) => p.slug === slug);
  return { unverified: !check.ok, models: refreshed?.models ?? [] };
}

/** Removes the key from the instance and every agent. */
export async function removeProviderKey(slug: string) {
  const provider = await keyProvider(slug);
  await deleteSecret(provider.keyEnv);
  await restartGateway();
}

/**
 * Instance default model (new agents are cloned from it). Agents whose provider
 * isn't signed in can't reply at all: they get it too. The others keep theirs.
 * Returns how many agents were switched.
 */
export async function setDefaultModel(slug: string, model: string, baseUrl?: string) {
  await dashboard("/api/model/set", {
    method: "POST",
    body: JSON.stringify({ scope: "main", provider: slug, model, ...(baseUrl ? { base_url: baseUrl } : {}) }),
  });

  const { parseDocument } = await import("yaml");
  const read = async (profile: string) => parseDocument(await readFile(join(profileHome(profile), "config.yaml"), "utf8").catch(() => ""));
  const instanceModel = (await read("default")).toJS()?.model;
  if (!instanceModel) return 0;

  const signedIn = new Set((await providerList()).providers.filter((p) => p.configured).map((p) => p.slug));
  const profiles = new Set((await db.select({ p: schema.agent.hermesProfile }).from(schema.agent)).map((r) => r.p).filter((p) => !isDefaultProfile(p)));
  let switched = 0;
  for (const profile of profiles) {
    const doc = await read(profile);
    if (signedIn.has(String(doc.getIn(["model", "provider"]) ?? ""))) continue;
    doc.set("model", doc.createNode(instanceModel));
    await writeFile(join(profileHome(profile), "config.yaml"), doc.toString());
    switched++;
  }
  return switched;
}

/** Checks end to end that Hermes replies with the default model. */
export async function testDefaultModel() {
  const res = await hermesApi("default", "/v1/chat/completions", {
    method: "POST",
    headers: { "X-Hermes-Session-Id": `agora-provider-test-${Date.now()}` },
    body: JSON.stringify({ model: "hermes-agent", stream: false, messages: [{ role: "user", content: "Réponds uniquement : OK" }] }),
    signal: AbortSignal.timeout(120_000),
  });
  const data = (await res.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!res.ok || !text) throw new HermesError(data.error?.message || tr(messages).noReply(res.status), 502);
  return text.slice(0, 200);
}
