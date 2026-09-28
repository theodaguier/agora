/**
 * Metrics of the machine and the instance, for the admin Server tab.
 *
 * The machine is sampled every minute in memory: its history starts with the
 * process and is lost on restart (no table for it). The rest is read on demand
 * from the database.
 */
import type { ServerHistoryRange, ServerReport } from "@agora/core";
import { and, eq, gte, sql } from "drizzle-orm";
import { existsSync, readFileSync } from "node:fs";
import { statfs } from "node:fs/promises";
import os from "node:os";
import { db, schema } from "./db";
import { env } from "./env";
import { onlineUserIds } from "./events";
import { workingAgentIds } from "./bot-runner";
import { getOrg } from "./org";
import { version } from "./version";

const { agent, attachment, conversation, message, pendingTurn, task, user } = schema;

const SAMPLE_MS = 60_000;
/** 24 hours of samples. */
const KEEP = (24 * 3_600_000) / SAMPLE_MS;

export type Sample = {
  t: number;
  /** 0–1, every core together. */
  cpu: number;
  memUsed: number;
  rss: number;
  online: number;
  working: number;
};

const samples: Sample[] = [];
let sampler: ReturnType<typeof setInterval> | undefined;
let lastTimes: { idle: number; total: number } | undefined;

function cpuTimes() {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    idle += c.times.idle;
    total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq;
  }
  return { idle, total };
}

/** Share of the CPU used since the previous call (0 on the first one). */
function cpuUsage() {
  const now = cpuTimes();
  const prev = lastTimes;
  lastTimes = now;
  if (!prev || now.total <= prev.total) return 0;
  return Math.min(1, Math.max(0, 1 - (now.idle - prev.idle) / (now.total - prev.total)));
}

/** Memory in use; on Linux, what `free` calls available (page cache is not "used"). */
function memory() {
  const total = os.totalmem();
  try {
    const info = readFileSync("/proc/meminfo", "utf8");
    const kb = (key: string) => Number(info.match(new RegExp(`^${key}:\\s+(\\d+)`, "m"))?.[1] ?? NaN) * 1024;
    const available = kb("MemAvailable");
    const swapTotal = kb("SwapTotal");
    const swapFree = kb("SwapFree");
    if (Number.isFinite(available)) {
      return { total, used: total - available, swap: Number.isFinite(swapTotal) && swapTotal > 0 ? { total: swapTotal, used: swapTotal - swapFree } : null };
    }
  } catch {}
  return { total, used: total - os.freemem(), swap: null };
}

function sample() {
  samples.push({
    t: Date.now(),
    cpu: cpuUsage(),
    memUsed: memory().used,
    rss: process.memoryUsage.rss(),
    online: onlineUserIds().length,
    working: workingAgentIds().length,
  });
  if (samples.length > KEEP) samples.splice(0, samples.length - KEEP);
}

export function startServerSampler() {
  if (sampler) return;
  cpuUsage();
  // A first point a few seconds in, once the CPU delta means something.
  setTimeout(sample, 5_000);
  sampler = setInterval(sample, SAMPLE_MS);
}

/** Averages the samples into `points` buckets over the last `hours`. */
function history(hours: number, points: number) {
  const now = Date.now();
  const width = (hours * 3_600_000) / points;
  const start = now - hours * 3_600_000;
  const out: (Omit<Sample, "t"> & { t: string; n: number })[] = [];
  for (let i = 0; i < points; i++) {
    const from = start + i * width;
    const inside = samples.filter((s) => s.t > from && s.t <= from + width);
    const avg = (k: keyof Omit<Sample, "t">) => (inside.length ? inside.reduce((sum, s) => sum + s[k], 0) / inside.length : 0);
    out.push({
      t: new Date(from + width).toISOString(),
      n: inside.length,
      cpu: avg("cpu"),
      memUsed: avg("memUsed"),
      rss: avg("rss"),
      online: inside.length ? Math.max(...inside.map((s) => s.online)) : 0,
      working: inside.length ? Math.max(...inside.map((s) => s.working)) : 0,
    });
  }
  return out;
}

async function disk(path: string) {
  try {
    const s = await statfs(path);
    return { path, total: s.blocks * s.bsize, free: s.bavail * s.bsize };
  } catch {
    return null;
  }
}

/** Where the instance keeps its files: the Hermes volume in production, the root otherwise. */
async function disks() {
  const main = await disk(env.HERMES_HOME && existsSync(env.HERMES_HOME) ? env.HERMES_HOME : "/");
  return main ? [main] : [];
}

/** The org's timezone, safe to inline in SQL (it is also checked by Intl). */
async function timezone() {
  const tz = (await getOrg()).timezone;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    if (/^[A-Za-z0-9_/+-]+$/.test(tz)) return tz;
  } catch {}
  return "UTC";
}

const count = sql<number>`count(*)::int`;

async function database() {
  const [size, connections, tables] = await Promise.all([
    db.execute<{ bytes: string; version: string }>(sql`select pg_database_size(current_database())::text as bytes, current_setting('server_version') as version`),
    db.execute<{ state: string | null; n: number }>(sql`select state, count(*)::int as n from pg_stat_activity where datname = current_database() group by state`),
    db.execute<{ name: string; bytes: string; rows: string }>(sql`
      select c.relname as name, pg_total_relation_size(c.oid)::text as bytes, greatest(c.reltuples, 0)::bigint::text as rows
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind = 'r' and n.nspname = 'public'
      order by pg_total_relation_size(c.oid) desc
      limit 8`),
  ]);
  return {
    version: size[0]?.version ?? null,
    bytes: Number(size[0]?.bytes ?? 0),
    connections: {
      active: connections.filter((c) => c.state === "active").reduce((s, c) => s + c.n, 0),
      total: connections.reduce((s, c) => s + c.n, 0),
    },
    tables: tables.map((t) => ({ name: t.name, bytes: Number(t.bytes), rows: Number(t.rows) })),
  };
}

async function activity() {
  const tz = await timezone();
  const [counts, files, days, active] = await Promise.all([
    Promise.all([
      db.select({ n: count }).from(user),
      db.select({ n: count }).from(agent),
      db.select({ n: count }).from(conversation),
      db.select({ n: count }).from(message),
      db.select({ n: count }).from(task),
      db.select({ n: count }).from(pendingTurn),
    ]),
    db.select({ n: count, bytes: sql<string>`coalesce(sum(${attachment.size}), 0)::text` }).from(attachment),
    db.execute<{ t: string; user: number; bot: number }>(sql`
      with d as (
        select generate_series(
          date_trunc('day', now() at time zone ${tz}) - interval '29 days',
          date_trunc('day', now() at time zone ${tz}),
          interval '1 day'
        ) as day
      )
      select to_char(d.day, 'YYYY-MM-DD') as t,
        count(m.id) filter (where m.kind = 'user')::int as user,
        count(m.id) filter (where m.kind = 'bot')::int as bot
      from d left join ${message} m
        -- created_at is a UTC timestamp: the day's bounds are brought back to UTC.
        on m.created_at >= ((d.day at time zone ${tz}) at time zone 'UTC')
        and m.created_at < (((d.day + interval '1 day') at time zone ${tz}) at time zone 'UTC')
      group by d.day order by d.day`),
    Promise.all([1, 7, 30].map((days) =>
      db
        .select({ n: sql<number>`count(distinct ${message.authorUserId})::int` })
        .from(message)
        .where(and(eq(message.kind, "user"), gte(message.createdAt, new Date(Date.now() - days * 86_400_000)))),
    )),
  ]);
  const [users, agents, conversations, messages, tasks, queued] = counts.map((r) => r[0]?.n ?? 0);
  return {
    totals: { users, agents, conversations, messages, tasks, files: files[0]?.n ?? 0, filesBytes: Number(files[0]?.bytes ?? 0) },
    queuedTurns: queued,
    activeUsers: { day: active[0]![0]?.n ?? 0, week: active[1]![0]?.n ?? 0, month: active[2]![0]?.n ?? 0 },
    messagesPerDay: days.map((d) => ({ t: d.t, user: d.user, bot: d.bot })),
  };
}

const HISTORY: Record<ServerHistoryRange, { hours: number; points: number }> = { "1h": { hours: 1, points: 60 }, "24h": { hours: 24, points: 96 } };

export async function serverReport(range: ServerHistoryRange): Promise<ServerReport> {
  const mem = memory();
  const cpus = os.cpus();
  const [base, act, storage] = await Promise.all([database(), activity(), disks()]);
  const heap = process.memoryUsage();
  return {
    at: new Date().toISOString(),
    host: {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpuModel: cpus[0]?.model.trim() ?? null,
      cpuCount: cpus.length,
      uptime: os.uptime(),
      loadavg: os.loadavg(),
    },
    process: {
      runtime: process.versions.bun ? `Bun ${process.versions.bun}` : `Node ${process.versions.node}`,
      uptime: process.uptime(),
      rss: heap.rss,
      heapUsed: heap.heapUsed,
      app: version.app,
      hermes: version.hermes,
      commit: version.commit,
    },
    now: {
      cpu: samples.at(-1)?.cpu ?? null,
      memory: mem,
      online: onlineUserIds().length,
      working: workingAgentIds().length,
    },
    disks: storage,
    database: base,
    activity: act,
    history: { range, since: samples[0] ? new Date(samples[0].t).toISOString() : null, points: history(HISTORY[range].hours, HISTORY[range].points) },
  };
}
