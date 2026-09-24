import { eq, isNull, or } from "drizzle-orm";
import { Hono } from "hono";
import { schedulesOf } from "../availability";
import { workingAgentIds } from "../bot-runner";
import { db, schema } from "../db";
import { onlineUserIds } from "../events";
import { requireUser, type AppEnv } from "../middleware";

const { user } = schema;

/** Snapshot at load time; updates then arrive over /events (presence, agent.status, availability). */
export const presence = new Hono<AppEnv>().use(requireUser).get("/", async (c) => {
  const rows = await db
    .select({ id: user.id, lastSeenAt: user.lastSeenAt })
    .from(user)
    .where(or(isNull(user.banned), eq(user.banned, false)));
  const online = new Set(onlineUserIds());
  const schedules = await schedulesOf();
  return c.json({
    schedules: Object.fromEntries(schedules),
    users: Object.fromEntries(rows.map((r) => [r.id, { online: online.has(r.id), lastSeenAt: r.lastSeenAt?.toISOString() ?? null }])),
    workingAgents: workingAgentIds(),
  });
});
