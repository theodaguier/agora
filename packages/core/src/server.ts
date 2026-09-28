/** GET /admin/server: the machine and the instance, for the admin Server tab (apps/api/src/server.ts). */

export type ServerHistoryRange = "1h" | "24h";

export type ServerPoint = {
  /** End of the bucket, ISO. */
  t: string;
  /** Samples in the bucket; 0 before the server started. */
  n: number;
  /** 0–1. */
  cpu: number;
  memUsed: number;
  rss: number;
  online: number;
  working: number;
};

export type ServerReport = {
  at: string;
  host: {
    hostname: string;
    platform: string;
    release: string;
    arch: string;
    cpuModel: string | null;
    cpuCount: number;
    /** Seconds. */
    uptime: number;
    loadavg: number[];
  };
  process: { runtime: string; uptime: number; rss: number; heapUsed: number; app: string; hermes: string; commit: string | null };
  now: {
    /** 0–1, null until the first sample. */
    cpu: number | null;
    memory: { total: number; used: number; swap: { total: number; used: number } | null };
    online: number;
    working: number;
  };
  disks: { path: string; total: number; free: number }[];
  database: {
    version: string | null;
    bytes: number;
    connections: { active: number; total: number };
    tables: { name: string; bytes: number; rows: number }[];
  };
  activity: {
    totals: { users: number; agents: number; conversations: number; messages: number; tasks: number; files: number; filesBytes: number };
    queuedTurns: number;
    activeUsers: { day: number; week: number; month: number };
    /** The last 30 days, in the org's time zone. */
    messagesPerDay: { t: string; user: number; bot: number }[];
  };
  history: { range: ServerHistoryRange; since: string | null; points: ServerPoint[] };
};

const UNITS = ["byte", "kilobyte", "megabyte", "gigabyte", "terabyte"] as const;

/** A size in the largest binary unit that keeps it ≥ 1, for Intl's `unit` style. */
export function byteUnit(bytes: number): { value: number; unit: (typeof UNITS)[number] } {
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < UNITS.length - 1) {
    value /= 1024;
    i++;
  }
  return { value, unit: UNITS[i]! };
}

/** Seconds as the two largest units: [days, hours] or [hours, minutes] or [minutes]. */
export function durationParts(seconds: number): { d: number; h: number; m: number } {
  const s = Math.max(0, Math.floor(seconds));
  return { d: Math.floor(s / 86_400), h: Math.floor((s % 86_400) / 3_600), m: Math.floor((s % 3_600) / 60) };
}
