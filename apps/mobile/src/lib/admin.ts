import { queryOptions } from "@tanstack/react-query";
import { ApiError, api, apiUrl, authHeaders } from "./api";
import { readLocalFile } from "./files";
import { defineMessages, locale } from "./i18n";
import type { AvatarShape } from "./types";

/* Admin data of the settings screens: apps/web/src/lib/api.ts and queries.ts (admin part). */

const messages = defineMessages({
  en: { uploadFailed: "Couldn't upload the image." },
  fr: { uploadFailed: "Impossible d'envoyer l'image." },
});

/* ---------- Types ---------- */

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  image: string | null;
  username: string | null;
  title: string;
  agents: string[];
};

export type AdminInvitation = { id: string; email: string; role: "admin" | "user"; expiresAt: string; createdAt: string };

/** Invitation send response: without email configured, the link must be passed on by hand. */
export type InvitationSent = { sent: boolean; link: string | null; error?: string };

export type AdminAgent = { id: string; name: string; hermesProfile: string; avatarShape: AvatarShape; avatarColor: string };

export type AdminModels = {
  /** Providers signed in on the agents' Hermes profiles, and Claude Code's, with their models. */
  providers: { provider: string; models: { id: string; reasoning: boolean; label?: string }[]; onlyFor: string | null }[];
  /** Forbidden models (`provider::model`) per employee. */
  blocked: Record<string, string[]>;
  /** Profiles whose models Hermes could not provide. */
  unreachable: number;
};

export type Org = { name: string; locale: "fr" | "en"; timezone: string; image: string | null };

export type DigestConfig = { enabled: boolean; time: string; days: number[]; weeklyDay: number | null; personal: boolean; usageForMembers: boolean };

export type DigestAdmin = {
  config: DigestConfig;
  timezone: string;
  last: { day: string; periodStart: string; periodEnd: string; status: "ready" | "empty" | "failed"; error: string | null; updatedAt: string } | null;
  next: { day: string; time: string } | null;
  running: boolean;
};

export type CheckState = "ok" | "warn" | "down" | "off";
export type Restart = "process" | "container" | "curator";
export type Check = { id: string; state: CheckState; detail?: string; latencyMs?: number; restart?: Restart };
export type StatusReport = { checkedAt: string; checks: Check[] };

export type LocalModel = { id: string; parameters?: string; quantization?: string; family?: string; size?: number; loaded: boolean };
export type LocalRuntime = { id: "ollama" | "lmstudio"; url: string; running: boolean; models: LocalModel[] };
export type HostCli = {
  id: string;
  name: string;
  installed: boolean;
  path: string | null;
  version: string | null;
  latest: string | null;
  outdated: boolean;
  update: "self" | "managed" | "manual";
  job: { startedAt: string; endedAt?: string; ok?: boolean; output?: string } | null;
};

/** Error surfaced by the update service; `code` + `params` are translated, `message` is the fallback. */
export type UpdateError = { message: string; code?: string; params?: Record<string, unknown> };
export type UpdateStep = { at: string; message: string; ok?: boolean; code?: string; params?: Record<string, unknown> & { error?: UpdateError } };
export type UpdateRun = {
  id: string;
  target: "hermes" | "app";
  from: string;
  to: string;
  trigger: "auto" | "manual";
  startedAt: string;
  endedAt?: string;
  status: "running" | "succeeded" | "rolled_back" | "failed";
  steps: UpdateStep[];
  backup?: string;
  contract?: { ok: boolean; checks: { name: string; ok: boolean; detail?: string }[] };
};
export type UpdateSettings = { autoApp: boolean; autoHermes: boolean; windowStart: number; windowEnd: number };
export type UpdatesStatus = {
  server: { app: string; hermes: string; commit: string | null; builtAt: string | null };
  running?: { target: string; to: string } | null;
  unavailable?: string;
  current?: { app: string; hermes: string };
  available?: { app: string[]; hermes: string[] };
  rejected?: { app: string[]; hermes: string[] };
  settings?: UpdateSettings;
  lastCheck?: string | null;
  inWindow?: boolean;
  history?: UpdateRun[];
};

export type Device = { id: string; name: string; pairedAt: string; lastActiveAt: string };

/* ---------- Queries (same keys as the web) ---------- */

export const adminUsersQuery = queryOptions({ queryKey: ["admin", "users"], queryFn: () => api<AdminUser[]>("/admin/users") });
export const adminInvitationsQuery = queryOptions({ queryKey: ["admin", "invitations"], queryFn: () => api<AdminInvitation[]>("/admin/invitations") });
export const adminAgentsQuery = queryOptions({ queryKey: ["admin", "agents"], queryFn: () => api<AdminAgent[]>("/admin/agents") });
export const adminModelsQuery = queryOptions({ queryKey: ["admin", "models"], queryFn: () => api<AdminModels>("/admin/models") });
/** apps/web/src/lib/queries.ts: AI providers known to Hermes (API key or signed in on the server) and the default model. */
export type AiProvider = { slug: string; name: string; keyEnv: string | null; configured: boolean; models: string[] };
export type AiProviders = { current: { provider: string; model: string }; providers: AiProvider[] };
export const providersQuery = queryOptions({ queryKey: ["admin", "providers"], queryFn: () => api<AiProviders>("/admin/hermes/providers") });
export const adminOrgQuery = queryOptions({ queryKey: ["admin", "org"], queryFn: () => api<Org>("/admin/org") });
export const digestConfigQuery = queryOptions({ queryKey: ["digest", "config"], queryFn: () => api<DigestAdmin>("/digest/config") });
export const statusQuery = queryOptions({ queryKey: ["admin", "status"], queryFn: () => api<StatusReport>("/admin/status") });
export const updatesQuery = queryOptions({ queryKey: ["admin", "updates"], queryFn: () => api<UpdatesStatus>("/admin/updates") });
export const hostModelsQuery = queryOptions({ queryKey: ["admin", "host", "models"], queryFn: () => api<{ runtimes: LocalRuntime[] }>("/admin/host/models") });
export const hostClisQuery = queryOptions({ queryKey: ["admin", "host", "clis"], queryFn: () => api<{ clis: HostCli[] }>("/admin/host/clis") });
export const devicesQuery = queryOptions({ queryKey: ["mobile", "devices"], queryFn: () => api<Device[]>("/mobile/devices") });

/* ---------- Helpers ---------- */

/** Blocked-model key, as stored by the API. */
export const modelKey = (provider: string, id: string) => `${provider}::${id}`;

/** Uploads an image already cropped by the picker (raw body, like the web's uploadAvatar). */
export async function uploadImage(path: string, file: { uri: string; mime: string }) {
  const body = await readLocalFile(file.uri);
  let res: Response;
  try {
    res = await fetch(apiUrl(path), { method: "PUT", headers: { "Content-Type": file.mime, "X-Agora-Locale": locale, ...authHeaders() }, body });
  } catch {
    throw new ApiError(0, messages.uploadFailed);
  }
  if (!res.ok) throw new ApiError(res.status, ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? messages.uploadFailed);
  return (await res.json()) as { image: string };
}

/** apps/web/src/components/ProviderLogo.tsx `providerName`: display name of known Hermes providers; the raw slug otherwise. */
const providerNames: Record<string, string> = {
  "claude-code": "Claude Code",
  anthropic: "Anthropic",
  openai: "OpenAI",
  "openai-codex": "OpenAI Codex",
  gemini: "Google Gemini",
  google: "Google",
  deepseek: "DeepSeek",
  kimi: "Kimi",
  "kimi-coding": "Kimi",
  moonshot: "Moonshot",
  minimax: "MiniMax",
  openrouter: "OpenRouter",
  mistral: "Mistral",
  xai: "xAI",
  qwen: "Qwen",
  nous: "Nous Research",
  copilot: "GitHub Copilot",
  zai: "Z.ai",
  zhipu: "Zhipu",
  huggingface: "Hugging Face",
  ollama: "Ollama",
  lmstudio: "LM Studio",
  "opencode-free": "OpenCode Free",
};

export const providerName = (provider: string) => providerNames[provider.toLowerCase()] ?? provider;

/** IANA time zones; Hermes may lack `Intl.supportedValuesOf`, then the common ones. */
export function timeZones(current: string) {
  let zones: string[] = [];
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {}
  if (!zones.length) zones = FALLBACK_ZONES;
  return zones.includes(current) ? zones : [current, ...zones];
}

const FALLBACK_ZONES = [
  "UTC",
  "Europe/Paris",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Lisbon",
  "Europe/Madrid",
  "Europe/Brussels",
  "Europe/Amsterdam",
  "Europe/Luxembourg",
  "Europe/Zurich",
  "Europe/Berlin",
  "Europe/Rome",
  "Europe/Vienna",
  "Europe/Prague",
  "Europe/Warsaw",
  "Europe/Stockholm",
  "Europe/Oslo",
  "Europe/Copenhagen",
  "Europe/Helsinki",
  "Europe/Athens",
  "Europe/Bucharest",
  "Europe/Istanbul",
  "Europe/Kyiv",
  "Europe/Moscow",
  "Africa/Casablanca",
  "Africa/Algiers",
  "Africa/Tunis",
  "Africa/Dakar",
  "Africa/Abidjan",
  "Africa/Lagos",
  "Africa/Cairo",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "Indian/Reunion",
  "Indian/Mauritius",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Seoul",
  "Asia/Tokyo",
  "Australia/Perth",
  "Australia/Sydney",
  "Pacific/Noumea",
  "Pacific/Auckland",
  "Pacific/Tahiti",
  "America/Martinique",
  "America/Guadeloupe",
  "America/Cayenne",
  "America/Sao_Paulo",
  "America/Buenos_Aires",
  "America/Bogota",
  "America/Mexico_City",
  "America/New_York",
  "America/Toronto",
  "America/Montreal",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];
