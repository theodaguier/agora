import { config } from "./config";

import type { Params } from "./coded";

/**
 * `message` is the French text (logs, and fallback for runs stored before codes
 * existed); `code` + `params` are what the admin panel translates.
 */
export type Step = { at: string; message: string; ok?: boolean; code?: string; params?: Params };

export type UpdateRun = {
  id: string;
  target: "hermes" | "app";
  from: string;
  to: string;
  trigger: "auto" | "manual";
  startedAt: string;
  endedAt?: string;
  status: "running" | "succeeded" | "rolled_back" | "failed";
  steps: Step[];
  backup?: string;
  contract?: unknown;
};

export type Settings = {
  autoApp: boolean;
  autoHermes: boolean;
  /** Time window for automatic updates (hours, in the config.tz timezone). */
  windowStart: number;
  windowEnd: number;
  /** Timezone of the time window (chosen at install); default: the container's TZ. */
  timezone?: string;
};

export type State = {
  settings: Settings;
  lastCheck: string | null;
  available: { app: string[]; hermes: string[] };
  history: UpdateRun[];
  /** Rejected versions (canary or rollback): no automatic retry. */
  rejected: { hermes: string[]; app: string[] };
};

const defaults: State = {
  settings: { autoApp: true, autoHermes: true, windowStart: 3, windowEnd: 5 },
  lastCheck: null,
  available: { app: [], hermes: [] },
  history: [],
  rejected: { hermes: [], app: [] },
};

let cache: State | null = null;

export async function loadState(): Promise<State> {
  if (cache) return cache;
  const file = Bun.file(config.stateFile);
  cache = (await file.exists()) ? { ...defaults, ...(await file.json()) } : structuredClone(defaults);
  return cache!;
}

export async function saveState() {
  if (!cache) return;
  cache.history = cache.history.slice(-50);
  await Bun.write(config.stateFile, JSON.stringify(cache, null, 2));
}
