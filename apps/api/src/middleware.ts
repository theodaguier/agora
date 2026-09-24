import { createMiddleware } from "hono/factory";
import { auth, type SessionUser } from "./auth";
import { getOrg } from "./org";

export type AppEnv = { Variables: { user: SessionUser } };

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "unauthorized" }, 401);
  c.set("user", session.user);
  // Two-step verification required by the organization: an account without it can only read
  // its own profile until it turns it on (Better Auth's /auth/two-factor/*, outside this middleware).
  if (!session.user.twoFactorEnabled && !(c.req.method === "GET" && /^\/api\/me(\/|$)/.test(c.req.path)) && (await getOrg()).requireTwoFactor)
    return c.json({ error: "two_factor_required" }, 403);
  await next();
});

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get("user").role !== "admin") return c.json({ error: "forbidden" }, 403);
  await next();
});
