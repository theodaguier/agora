import { createHmac } from "node:crypto";
import { join } from "node:path";
import { env } from "./env";
import { newestFirst } from "./model-catalog";
import { defineMessages, tr } from "./i18n";
import type { EngineUsage } from "./usage";

/** Hermes profile: "default" means the instance's root profile. */
export const isDefaultProfile = (profile: string) => profile === "default";

export function profileHome(profile: string) {
  if (!env.HERMES_HOME) throw new Error("HERMES_HOME is not configured");
  return isDefaultProfile(profile) ? env.HERMES_HOME : join(env.HERMES_HOME, "profiles", profile);
}

/**
 * A profile's API key: explicit in the env (HERMES_KEY_<PROFILE>) or derived
 * from the HERMES_KEY_SECRET secret for profiles created from the admin.
 */
export function profileKey(profile: string) {
  if (isDefaultProfile(profile)) return env.HERMES_API_KEY;
  const explicit = process.env[`HERMES_KEY_${profile.toUpperCase().replace(/-/g, "_")}`];
  if (explicit) return explicit;
  if (!env.HERMES_KEY_SECRET) throw new Error(`No key for profile ${profile}`);
  return createHmac("sha256", env.HERMES_KEY_SECRET).update(`hermes-profile:${profile}`).digest("hex");
}

/** Call to the Hermes API server, routed to the right profile (/p/<profile> when multiplexed). */
export async function hermesApi(profile: string, path: string, init?: RequestInit) {
  if (!env.HERMES_API_URL) throw new Error("HERMES_API_URL is not configured");
  const base = isDefaultProfile(profile) ? env.HERMES_API_URL : `${env.HERMES_API_URL}/p/${encodeURIComponent(profile)}`;
  return fetch(`${base}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${profileKey(profile)}`, ...init?.headers },
  });
}

/** Pauses between attempts while Hermes restarts (~30 s in all). */
const RETRY_DELAYS = [1_000, 2_000, 4_000, 8_000, 15_000];

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(timer), reject(signal.reason)), { once: true });
  });

/**
 * Starts a turn on Hermes, trying again while it restarts: 503 (gateway
 * draining its work, "retry shortly") or connection refused. Nothing was
 * started on the Hermes side in either case, so sending again is safe.
 */
async function startWithRetry(send: () => Promise<Response>, signal?: AbortSignal) {
  for (let attempt = 0; ; attempt++) {
    const last = attempt >= RETRY_DELAYS.length;
    let res: Response;
    try {
      res = await send();
    } catch (err) {
      if (signal?.aborted || last) throw err;
      await wait(RETRY_DELAYS[attempt]!, signal);
      continue;
    }
    if (res.status !== 503 || last) return res;
    await res.body?.cancel().catch(() => {});
    await wait(RETRY_DELAYS[attempt]!, signal);
  }
}

async function hermesJson<T>(profile: string, path: string): Promise<T> {
  const res = await hermesApi(profile, path);
  if (!res.ok) throw new Error(`Hermes ${path} ${res.status}`);
  return res.json() as Promise<T>;
}

export type ModelInfo = { id: string; reasoning: boolean; label?: string; description?: string };
export type ProviderModels = { provider: string; models: ModelInfo[] };
export type ModelOptions = {
  provider: string;
  defaultModel: string;
  models: ModelInfo[];
  /** Other providers signed in on Hermes: a thread can use them through `provider::model`. */
  others: ProviderModels[];
};

type RawProvider = { slug: string; models: string[]; authenticated?: boolean; source?: string; capabilities?: Record<string, { reasoning?: boolean }> };
type RawModelOptions = { provider: string; model: string; providers: RawProvider[] };

const modelsOf = (p: RawProvider | undefined): ModelInfo[] =>
  (p?.models ?? []).map((id) => ({ id, reasoning: !!p?.capabilities?.[id]?.reasoning }));

/** Models actually available for the profile's provider and the other signed-in ones (Hermes's list, not a homemade one), newest first. */
export async function modelOptions(profile: string): Promise<ModelOptions> {
  const raw = await hermesJson<RawModelOptions>(profile, "/api/model/options");
  // "virtual" providers (Mixture of Agents) are not a model to pick.
  const others = raw.providers.filter((p) => p.slug !== raw.provider && p.authenticated && p.source !== "virtual" && p.models.length);
  return {
    provider: raw.provider,
    defaultModel: raw.model,
    models: await newestFirst(modelsOf(raw.providers.find((p) => p.slug === raw.provider))),
    others: await Promise.all(others.map(async (p) => ({ provider: p.slug, models: await newestFirst(modelsOf(p)) }))),
  };
}

export type Toolset = {
  name: string;
  label: string;
  description: string;
  enabled: boolean;
  configured: boolean;
  tools: string[];
  /** Hands the server to whoever talks to the agent (sandbox.ts): off unless an admin turns it on. */
  risky?: boolean;
};

/** Toolsets seen by this profile's API server sessions (config.yaml's `agent.disabled_toolsets` wins). */
export async function toolsets(profile: string) {
  const { deniedToolsets, isRisky } = await import("./sandbox");
  const [list, denied] = await Promise.all([hermesJson<{ data: Toolset[] }>(profile, "/v1/toolsets"), deniedToolsets(profile)]);
  return list.data.map((t) => ({ ...t, enabled: t.enabled && !denied.has(t.name), risky: isRisky(t.name) }));
}

/** Approval request from Hermes (sensitive command, question from an MCP server…). */
export type HermesApproval = {
  runId: string;
  requestId?: string;
  command: string;
  description: string;
  /** One of once, session, always, deny. */
  choices: string[];
};

export type HermesEvent =
  | { type: "delta"; text: string }
  | { type: "tool"; name: string; status: string; label?: string }
  | { type: "approval"; approval: HermesApproval }
  | { type: "approval.resolved"; choice: string }
  /** Tokens the engine reports for the turn (Claude Code only: Hermes usage is read from its state.db). */
  | { type: "usage"; usage: EngineUsage[] };

type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

/**
 * Sends a message to a Hermes profile and streams the reply.
 *
 * The Hermes session is identified by `sessionId`: Hermes reloads the history
 * from state.db itself, so only the new message is sent.
 */
export async function* chat(opts: {
  profile: string;
  sessionId: string;
  text: string;
  images?: string[];
  /** Model chosen for this thread, in Hermes's `provider::model` format. */
  model?: string | null;
  /** Context added to the system prompt for this turn only (not stored by Hermes). */
  system?: string;
  signal?: AbortSignal;
}): AsyncGenerator<HermesEvent> {
  if (!env.HERMES_API_URL) {
    yield* simulate(opts.text, opts.system, opts.signal);
    return;
  }
  // Runs relay approval requests, but not images yet.
  if (!opts.images?.length) {
    yield* run(opts);
    return;
  }

  const content: string | ContentPart[] = opts.images?.length
    ? [{ type: "text", text: opts.text }, ...opts.images.map((url) => ({ type: "image_url" as const, image_url: { url } }))]
    : opts.text;
  const [provider, model] = opts.model?.split("::") ?? [];

  const res = await startWithRetry(
    () =>
      hermesApi(opts.profile, "/v1/chat/completions", {
        method: "POST",
        signal: opts.signal,
        headers: { "X-Hermes-Session-Id": opts.sessionId },
        body: JSON.stringify({
          // With `provider`, Hermes applies the requested model; otherwise it keeps the profile's.
          ...(provider && model ? { model, provider } : { model: opts.profile }),
          stream: true,
          messages: [...(opts.system ? [{ role: "system", content: opts.system }] : []), { role: "user", content }],
        }),
      }),
    opts.signal,
  );
  if (!res.ok || !res.body) {
    throw new Error(`Hermes ${res.status}: ${await res.text().catch(() => "")}`);
  }

  for await (const { event, data } of readSse(res.body)) {
    if (data === "[DONE]") return;
    const payload = JSON.parse(data);
    if (event === "hermes.tool.progress") {
      yield { type: "tool", name: String(payload.tool ?? "outil"), status: String(payload.status ?? "running"), label: payload.label };
      continue;
    }
    const text = payload.choices?.[0]?.delta?.content;
    if (text) yield { type: "delta", text };
  }
}

/**
 * Turn via the Hermes runs API: same session and context as
 * /v1/chat/completions, but the agent can pause to request an approval,
 * which is answered with answerApproval().
 */
async function* run(opts: { profile: string; sessionId: string; text: string; model?: string | null; system?: string; signal?: AbortSignal }): AsyncGenerator<HermesEvent> {
  const [provider, model] = opts.model?.split("::") ?? [];
  const res = await startWithRetry(
    () =>
      hermesApi(opts.profile, "/v1/runs", {
        method: "POST",
        signal: opts.signal,
        body: JSON.stringify({
          input: opts.text,
          session_id: opts.sessionId,
          ...(opts.system && { instructions: opts.system }),
          ...(provider && model ? { model, provider } : {}),
        }),
      }),
    opts.signal,
  );
  if (!res.ok) throw new Error(`Hermes ${res.status}: ${await res.text().catch(() => "")}`);
  const { run_id: runId } = (await res.json()) as { run_id: string };

  // Closing the stream is not enough: the agent would keep running on the Hermes side.
  const stop = () => hermesApi(opts.profile, `/v1/runs/${runId}/stop`, { method: "POST" }).catch(() => {});
  opts.signal?.addEventListener("abort", stop, { once: true });
  try {
    const events = await hermesApi(opts.profile, `/v1/runs/${runId}/events`, { signal: opts.signal });
    if (!events.ok || !events.body) throw new Error(`Hermes ${events.status}: ${await events.text().catch(() => "")}`);
    let streamed = false;
    for await (const { data } of readSse(events.body)) {
      const ev = JSON.parse(data) as Record<string, unknown> & { event: string };
      switch (ev.event) {
        case "message.delta":
          if (typeof ev.delta === "string" && ev.delta) {
            streamed = true;
            yield { type: "delta", text: ev.delta };
          }
          break;
        case "tool.started":
          yield { type: "tool", name: String(ev.tool ?? "outil"), status: "running", label: typeof ev.preview === "string" ? ev.preview : undefined };
          break;
        case "approval.request":
          yield {
            type: "approval",
            approval: {
              runId,
              requestId: typeof ev.request_id === "string" ? ev.request_id : undefined,
              command: String(ev.command ?? ""),
              description: String(ev.description ?? ""),
              choices: Array.isArray(ev.choices) ? ev.choices.map(String) : ["once", "deny"],
            },
          };
          break;
        case "approval.responded":
          yield { type: "approval.resolved", choice: String(ev.choice ?? "") };
          break;
        case "run.completed":
          if (!streamed && typeof ev.output === "string" && ev.output) yield { type: "delta", text: ev.output };
          return;
        case "run.failed":
          throw new Error(`Hermes: ${String(ev.error ?? "run failed")}`);
        case "run.cancelled":
          return;
      }
    }
  } finally {
    opts.signal?.removeEventListener("abort", stop);
  }
}

/** Answers a run's approval request. */
export async function answerApproval(profile: string, approval: Pick<HermesApproval, "runId" | "requestId">, choice: string) {
  const res = await hermesApi(profile, `/v1/runs/${approval.runId}/approval`, {
    method: "POST",
    body: JSON.stringify({ choice, ...(approval.requestId && { request_id: approval.requestId }) }),
  });
  if (!res.ok) throw new Error(`Hermes ${res.status}: ${await res.text().catch(() => "")}`);
}

async function* readSse(body: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let end: number;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      let event = "message";
      const data: string[] = [];
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      if (data.length) yield { event, data: data.join("\n") };
    }
  }
}

const simulated = defineMessages({
  en: {
    thinking: "thinking",
    handoff: (next: string) => `Simulated mode: handing off to @${next} (handoff).`,
    echo: (text: string) => `Simulated mode (Hermes isn't connected yet). You wrote: **${text}**`,
  },
  fr: {
    thinking: "réflexion",
    handoff: (next: string) => `Mode simulé : je passe la main à @${next} (handoff).`,
    echo: (text: string) => `Mode simulé (Hermes n'est pas encore branché). Tu as écrit : **${text}**`,
  },
});

/** Fake replies while Hermes is not connected (HERMES_API_URL empty). */
async function* simulate(text: string, system = "", signal?: AbortSignal): AsyncGenerator<HermesEvent> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const t = tr(simulated);
  yield { type: "tool", name: t.thinking, status: "running" };
  await sleep(500);
  // "handoff" in a group: the fake bot hands off to the first other bot, to test handoffs.
  const next = /handoff/i.test(text) ? system.match(/Autres bots du groupe : @([^,\n]+?)(?:,|\.\n|\.$)/)?.[1] : undefined;
  // In a group, the last message of the context ("[Author] text"); otherwise the message as is.
  const last = text.split("\n").filter((l) => l.startsWith("[")).at(-1) ?? text;
  const reply = next ? t.handoff(next) : t.echo(last.slice(0, 300));
  for (const word of reply.split(/(?<= )/)) {
    await sleep(35);
    signal?.throwIfAborted();
    yield { type: "delta", text: word };
  }
}

export type SkillInfo = { name: string; description: string; category?: string };

/**
 * The profile's active skills. Read via the Hermes dashboard (/api/skills?profile=)
 * rather than the API server's /v1/skills, broken since Hermes v2026.9.14
 * (TypeError in _find_all_skills). The dashboard responds the same in 8.x and 9.x.
 */
export async function skills(profile: string): Promise<SkillInfo[]> {
  if (!env.HERMES_DASHBOARD_URL) return (await hermesJson<{ data: SkillInfo[] }>(profile, "/v1/skills")).data;
  const url = new URL("/api/skills", env.HERMES_DASHBOARD_URL);
  if (!isDefaultProfile(profile)) url.searchParams.set("profile", profile);
  const res = await fetch(url, { headers: { "X-Hermes-Session-Token": env.HERMES_DASHBOARD_TOKEN } });
  if (!res.ok) throw new Error(`Hermes /api/skills ${res.status}`);
  const list = (await res.json()) as (SkillInfo & { enabled: boolean })[];
  return list.filter((s) => s.enabled).map(({ name, description, category }) => ({ name, description, category }));
}

/** Skills every bot reads, listed in each profile's `skills.external_dirs` (skill-requests.ts). */
export const sharedSkillsDir = () => join(profileHome("default"), "shared-skills");

/**
 * Finds a skill's SKILL.md (<category>/…/<name>/SKILL.md): in the profile, then
 * among the shared skills, the order in which Hermes resolves them.
 */
export async function skillFile(profile: string, name: string) {
  for (const root of [join(profileHome(profile), "skills"), sharedSkillsDir()]) {
    const found = await findSkill(root, name).catch(() => null);
    if (found) return found;
  }
  return null;
}

export async function findSkill(root: string, name: string) {
  const glob = new Bun.Glob(`**/${name}/SKILL.md`);
  for await (const rel of glob.scan({ cwd: root, onlyFiles: true })) {
    if (rel.startsWith(".hub/")) continue;
    return join(root, rel);
  }
  return null;
}
