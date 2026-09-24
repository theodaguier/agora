import { and, asc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { Hono } from "hono";
import { z } from "zod";
import { db, schema } from "../db";
import { requireAdmin, requireUser, type AppEnv } from "../middleware";
import { getOrg } from "../org";
import { estimateCost, priceBook, resetModelPrice, setModelPrice, type TokenTotals } from "../usage";

const { agent, usageEvent, user } = schema;

/** Period shown and the width of a chart bar. */
const RANGES = {
  "24h": { hours: 24, bucket: "hour", step: "1 hour" },
  "7d": { hours: 7 * 24, bucket: "day", step: "1 day" },
  "30d": { hours: 30 * 24, bucket: "day", step: "1 day" },
  "90d": { hours: 90 * 24, bucket: "week", step: "1 week" },
  "12m": { hours: 365 * 24, bucket: "month", step: "1 month" },
} as const;

const reportQuery = z.object({
  range: z.enum(Object.keys(RANGES) as [keyof typeof RANGES, ...(keyof typeof RANGES)[]]).default("30d"),
  userId: z.string().optional(),
  agentId: z.string().optional(),
  source: z.enum(["chat", "cron", "system"]).optional(),
});

const priceInput = z.object({
  provider: z.string().max(100),
  model: z.string().min(1).max(200),
  input: z.number().min(0).max(10_000),
  output: z.number().min(0).max(10_000),
  cacheRead: z.number().min(0).max(10_000),
  cacheWrite: z.number().min(0).max(10_000),
});

const num = (col: SQL | AnyPgColumn) => sql<number>`coalesce(sum(${col}), 0)::float8`.mapWith(Number);

/** The org's timezone, safe to inline in SQL (it is also checked by Intl). */
async function timezone() {
  const tz = (await getOrg()).timezone;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    if (/^[A-Za-z0-9_/+-]+$/.test(tz)) return tz;
  } catch {}
  return "UTC";
}

type Totals = TokenTotals & { cost: number };
const TOTALS = ["apiCalls", "inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "reasoningTokens", "cost"] as const;
const zero = (): Totals => ({ apiCalls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, cost: 0 });
function add(into: Totals, row: Totals) {
  for (const k of TOTALS) into[k] += row[k];
}
const tokens = (t: Totals) => t.inputTokens + t.outputTokens + t.cacheReadTokens + t.cacheWriteTokens;

export const usage = new Hono<AppEnv>()
  .use(requireUser)

  /**
   * Usage report. An admin sees everything and may filter; a member only
   * ever sees their own consumption (the filters are ignored).
   */
  .get("/", async (c) => {
    const me = c.get("user");
    const isAdmin = me.role === "admin";
    const q = reportQuery.parse(c.req.query());
    const range = RANGES[q.range];
    const to = new Date();
    const from = new Date(to.getTime() - range.hours * 3600_000);
    const tz = await timezone();

    const where = [gte(usageEvent.occurredAt, from), lt(usageEvent.occurredAt, to)];
    if (!isAdmin) where.push(eq(usageEvent.userId, me.id));
    else {
      if (q.userId) where.push(eq(usageEvent.userId, q.userId));
      if (q.agentId) where.push(eq(usageEvent.agentId, q.agentId));
      if (q.source) where.push(eq(usageEvent.source, q.source));
    }

    // Bucket in the org's local time; bucket and tz are whitelisted/validated, hence inlined.
    const bucket = sql<string>`to_char(date_trunc('${sql.raw(range.bucket)}', (${usageEvent.occurredAt} at time zone 'UTC') at time zone '${sql.raw(tz)}'), 'YYYY-MM-DD"T"HH24:MI')`;
    const [rows, buckets, book] = await Promise.all([
      db
        .select({
          t: bucket,
          userId: usageEvent.userId,
          agentId: usageEvent.agentId,
          source: usageEvent.source,
          taskId: usageEvent.taskId,
          taskName: usageEvent.taskName,
          provider: usageEvent.provider,
          model: usageEvent.model,
          apiCalls: num(usageEvent.apiCalls),
          inputTokens: num(usageEvent.inputTokens),
          outputTokens: num(usageEvent.outputTokens),
          cacheReadTokens: num(usageEvent.cacheReadTokens),
          cacheWriteTokens: num(usageEvent.cacheWriteTokens),
          reasoningTokens: num(usageEvent.reasoningTokens),
          reported: num(usageEvent.reportedCostUsd),
        })
        .from(usageEvent)
        .where(and(...where))
        .groupBy(sql.raw("1, 2, 3, 4, 5, 6, 7, 8")),
      db.execute<{ t: string }>(sql`
        select to_char(g, 'YYYY-MM-DD"T"HH24:MI') as t
        from generate_series(
          date_trunc('${sql.raw(range.bucket)}', (${from.toISOString()}::timestamp at time zone 'UTC') at time zone '${sql.raw(tz)}'),
          date_trunc('${sql.raw(range.bucket)}', (${to.toISOString()}::timestamp at time zone 'UTC') at time zone '${sql.raw(tz)}'),
          '${sql.raw(range.step)}'::interval
        ) g`),
      priceBook(),
    ]);

    const totals = zero();
    const series = new Map(buckets.map((b) => [b.t, zero()]));
    const byUser = new Map<string, Totals>();
    const byAgent = new Map<string, Totals>();
    const byTask = new Map<string, Totals & { source: string; name: string | null }>();
    const byModel = new Map<string, Totals & { provider: string; model: string; priced: string }>();
    const bump = <T extends Totals>(map: Map<string, T>, key: string, init: () => T, row: Totals) => {
      if (!map.has(key)) map.set(key, init());
      add(map.get(key)!, row);
    };

    for (const r of rows) {
      const p = book(r.provider, r.model);
      const row: Totals = { ...r, cost: estimateCost(p.price, r, r.reported) };
      add(totals, row);
      const point = series.get(r.t);
      if (point) add(point, row);
      bump(byUser, r.userId ?? "", zero, row);
      bump(byAgent, r.agentId ?? "", zero, row);
      const task = r.source === "chat" ? "chat" : `${r.source}:${r.taskId ?? ""}`;
      bump(byTask, task, () => ({ ...zero(), source: r.source, name: r.taskName ?? r.taskId ?? null }), row);
      bump(byModel, `${r.provider}\0${r.model}`, () => ({ ...zero(), provider: r.provider, model: r.model, priced: p.source }), row);
    }

    const [users, agents] = await Promise.all([
      db.select({ id: user.id, name: user.name, image: user.image }).from(user).orderBy(asc(user.name)),
      db.select({ id: agent.id, name: agent.name, avatarShape: agent.avatarShape, avatarColor: agent.avatarColor }).from(agent).orderBy(asc(agent.name)),
    ]);
    const summary = (t: Totals) => ({ tokens: tokens(t), inputTokens: t.inputTokens, outputTokens: t.outputTokens, cacheTokens: t.cacheReadTokens + t.cacheWriteTokens, apiCalls: t.apiCalls, cost: t.cost });
    const sorted = <T extends Totals>(map: Map<string, T>) => [...map.entries()].sort((a, b) => tokens(b[1]) - tokens(a[1]));

    return c.json({
      range: q.range,
      bucket: range.bucket,
      from: from.toISOString(),
      to: to.toISOString(),
      timezone: tz,
      scope: isAdmin ? ("all" as const) : ("self" as const),
      totals: summary(totals),
      series: [...series.entries()].map(([t, v]) => ({ t, ...summary(v) })),
      byUser: isAdmin
        ? sorted(byUser).map(([id, v]) => {
            const u = users.find((x) => x.id === id);
            return { id: id || null, name: u?.name ?? null, image: u?.image ?? null, ...summary(v) };
          })
        : [],
      byAgent: sorted(byAgent).map(([id, v]) => {
        const a = agents.find((x) => x.id === id);
        return { id: id || null, name: a?.name ?? null, avatarShape: a?.avatarShape ?? null, avatarColor: a?.avatarColor ?? null, ...summary(v) };
      }),
      byTask: isAdmin ? sorted(byTask).map(([id, v]) => ({ id, taskId: id === "chat" ? null : id.slice(id.indexOf(":") + 1) || null, name: v.name, source: v.source, ...summary(v) })) : [],
      byModel: sorted(byModel).map(([, v]) => ({ provider: v.provider, model: v.model, priced: v.priced, ...summary(v) })),
      options: isAdmin ? { users: users.map(({ id, name }) => ({ id, name })), agents: agents.map(({ id, name }) => ({ id, name })) } : null,
    });
  })

  /** Models seen in usage, with the price used for estimates and where it comes from. */
  .get("/prices", requireAdmin, async (c) => {
    const [seen, overrides, book] = await Promise.all([
      db.selectDistinct({ provider: usageEvent.provider, model: usageEvent.model }).from(usageEvent),
      db.select({ provider: schema.modelPrice.provider, model: schema.modelPrice.model }).from(schema.modelPrice),
      priceBook(),
    ]);
    const keys = new Map([...seen, ...overrides].map((m) => [`${m.provider}\0${m.model}`, m]));
    const list = [...keys.values()]
      .sort((a, b) => a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model))
      .map((m) => {
        const p = book(m.provider, m.model);
        return { ...m, price: p.price, source: p.source, catalogue: p.catalogue };
      });
    return c.json(list);
  })

  .put("/prices", requireAdmin, async (c) => {
    const body = priceInput.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const { provider, model, ...price } = body.data;
    await setModelPrice(provider, model, price, c.get("user").id);
    return c.json({ ok: true });
  })

  /** Back to the models.dev price. */
  .delete("/prices", requireAdmin, async (c) => {
    const provider = c.req.query("provider") ?? "";
    const model = c.req.query("model");
    if (!model) return c.json({ error: "invalid" }, 400);
    await resetModelPrice(provider, model);
    return c.json({ ok: true });
  });
