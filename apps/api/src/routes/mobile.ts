import { and, desc, eq, gt, isNotNull, isNull, lt, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { auth } from "../auth";
import { env } from "../env";
import { db, schema } from "../db";
import { defineMessages, tr } from "../i18n";
import { requireUser, type AppEnv } from "../middleware";

const messages = defineMessages({
  en: {
    expired: "This QR code has expired or was already used. Show a new one from Settings on the web.",
    forbidden: "This account can't sign in.",
    notFound: "Device not found.",
  },
  fr: {
    expired: "Ce QR code a expiré ou a déjà servi. Affiches-en un nouveau depuis les Paramètres sur le web.",
    forbidden: "Ce compte ne peut pas se connecter.",
    notFound: "Appareil introuvable.",
  },
});

const { mobileLink, session } = schema;

/** Long enough to take out a phone and scan, short enough that a photographed QR code is useless. */
const CODE_TTL_MS = 2 * 60 * 1000;

const hash = (code: string) => new Bun.CryptoHasher("sha256").update(code).digest("hex");

type SignedIn = { token: string; user: { id: string; name: string; email: string; image?: string | null } };

/** Only what Better Auth needs: no browser cookie, so no origin to check (the app is not a browser). */
function forwardedHeaders(req: Request) {
  const headers = new Headers({ "Content-Type": "application/json" });
  for (const name of ["user-agent", "x-forwarded-for", "x-real-ip"]) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

/** Records the phone of a password sign-in like a QR pairing (listed, can be signed out). */
async function pairDevice(signedIn: SignedIn, deviceName?: string) {
  const ctx = await auth.$context;
  const created = await ctx.internalAdapter.findSession(signedIn.token);
  if (created) {
    await db.insert(mobileLink).values({
      id: crypto.randomUUID(),
      userId: signedIn.user.id,
      // No code for a password sign-in: a random value that can never be presented.
      codeHash: hash(newCode()),
      expiresAt: new Date(),
      usedAt: new Date(),
      sessionId: created.session.id,
      deviceName: deviceName?.trim() ?? "",
    });
  }
  const { id, name, email, image } = signedIn.user;
  return { token: signedIn.token, user: { id, name, email, image: image ?? null } };
}

const newCode = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");

/**
 * Pairing of the mobile app by QR code. The web app builds the QR code from `/link`
 * and its own origin; the app posts the code to `/exchange` and receives a session token
 * of its own, which it sends as `Authorization: Bearer …` (bearer plugin, auth.ts).
 */
export const mobile = new Hono<AppEnv>()
  /** Public: the code stands in for a session. Single use, even with two concurrent scans. */
  .post("/exchange", async (c) => {
    const body = z
      .object({ code: z.string().min(1).max(200), deviceName: z.string().max(100).optional() })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: tr(messages).expired }, 400);

    const [link] = await db
      .update(mobileLink)
      .set({ usedAt: new Date(), deviceName: body.data.deviceName?.trim() ?? "" })
      .where(and(eq(mobileLink.codeHash, hash(body.data.code)), isNull(mobileLink.usedAt), gt(mobileLink.expiresAt, new Date())))
      .returning();
    if (!link) return c.json({ error: tr(messages).expired }, 410);

    const ctx = await auth.$context;
    let created: Awaited<ReturnType<typeof ctx.internalAdapter.createSession>>;
    try {
      created = await ctx.internalAdapter.createSession(link.userId, false, {
        ipAddress: c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "",
        userAgent: c.req.header("user-agent") ?? "",
      });
    } catch {
      // Refused by the admin plugin (banned account).
      return c.json({ error: tr(messages).forbidden }, 403);
    }
    await db.update(mobileLink).set({ sessionId: created.id }).where(eq(mobileLink.id, link.id));

    const user = await ctx.internalAdapter.findUserById(link.userId);
    return c.json({
      token: created.token,
      user: user && { id: user.id, name: user.name, email: user.email, image: user.image ?? null },
    });
  })

  /**
   * Email and password, for when there's no computer at hand to show a QR code.
   * Goes through Better Auth's own endpoint (same checks and rate limit as the web login),
   * then records the device like a QR pairing, so it shows up in the list and can be signed out.
   * With two-factor sign-in on, no session yet: the answer carries an opaque `challenge`
   * (Better Auth's signed two_factor cookie) that the app posts back with the code to `/two-factor`.
   */
  .post("/sign-in", async (c) => {
    const body = z
      .object({ email: z.string().max(320), password: z.string().max(128), deviceName: z.string().max(100).optional() })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid" }, 400);

    const res = await auth.handler(
      new Request(new URL("/api/auth/sign-in/email", c.req.url), {
        method: "POST",
        headers: forwardedHeaders(c.req.raw),
        body: JSON.stringify({ email: body.data.email, password: body.data.password, rememberMe: true }),
      }),
    );
    // Better Auth's errors (401 wrong credentials, 429 too many attempts…) are passed as is: the app maps the status.
    if (!res.ok) return c.json({ error: "sign_in_failed", status: res.status }, res.status as 401);
    const signedIn = (await res.json()) as SignedIn | { twoFactorRedirect: true; twoFactorMethods?: string[] };
    if ("twoFactorRedirect" in signedIn) {
      const cookie = res.headers.getSetCookie().find((h) => /^(__Secure-)?[\w.-]*two_factor=/.test(h));
      if (!cookie) return c.json({ error: "sign_in_failed", status: 500 }, 500);
      const challenge = Buffer.from(cookie.split(";")[0]!).toString("base64url");
      return c.json({ twoFactor: true as const, challenge, methods: signedIn.twoFactorMethods ?? ["totp"] });
    }
    return c.json(await pairDevice(signedIn, body.data.deviceName));
  })

  /** Second step of `/sign-in`: authenticator code (or backup code) against the challenge. */
  .post("/two-factor", async (c) => {
    const body = z
      .object({
        challenge: z.string().min(1).max(2000),
        code: z.string().min(1).max(64),
        backupCode: z.boolean().optional(),
        deviceName: z.string().max(100).optional(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const cookie = Buffer.from(body.data.challenge, "base64url").toString();
    if (!/^(__Secure-)?[\w.-]*two_factor=[^;\s]+$/.test(cookie)) return c.json({ error: "invalid" }, 400);

    const headers = forwardedHeaders(c.req.raw);
    headers.set("cookie", cookie);
    // A request carrying a cookie must come from a trusted origin (Better Auth's CSRF check).
    headers.set("origin", env.WEB_ORIGIN);
    const path = body.data.backupCode ? "/api/auth/two-factor/verify-backup-code" : "/api/auth/two-factor/verify-totp";
    const res = await auth.handler(
      new Request(new URL(path, c.req.url), { method: "POST", headers, body: JSON.stringify({ code: body.data.code.replace(/\s/g, "") }) }),
    );
    // Better Auth's code (INVALID_CODE, INVALID_TWO_FACTOR_COOKIE…) is passed on: the app maps it.
    if (!res.ok) {
      const code = ((await res.json().catch(() => null)) as { code?: string } | null)?.code;
      return c.json({ error: code ?? "two_factor_failed", status: res.status }, res.status as 401);
    }
    return c.json(await pairDevice((await res.json()) as SignedIn, body.data.deviceName));
  })

  .use(requireUser)

  /** New pairing code for the signed-in account; the previous unused ones are dropped. */
  .post("/link", async (c) => {
    const userId = c.get("user").id;
    const code = newCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);
    await db.transaction(async (tx) => {
      await tx
        .delete(mobileLink)
        .where(and(eq(mobileLink.userId, userId), isNull(mobileLink.sessionId), or(isNull(mobileLink.usedAt), lt(mobileLink.expiresAt, new Date()))));
      await tx.insert(mobileLink).values({ id: crypto.randomUUID(), userId, codeHash: hash(code), expiresAt });
    });
    return c.json({ code, expiresAt: expiresAt.toISOString() });
  })

  /** Phones signed in to this account. */
  .get("/devices", async (c) => {
    const rows = await db
      .select({ id: mobileLink.id, name: mobileLink.deviceName, pairedAt: mobileLink.usedAt, lastActiveAt: session.updatedAt })
      .from(mobileLink)
      .innerJoin(session, eq(session.id, mobileLink.sessionId))
      .where(and(eq(mobileLink.userId, c.get("user").id), isNotNull(mobileLink.sessionId), gt(session.expiresAt, new Date())))
      .orderBy(desc(mobileLink.usedAt));
    return c.json(rows);
  })

  /** Signs a phone out from the web: its session is deleted, the row goes with it (cascade). */
  .delete("/devices/:id", async (c) => {
    const [link] = await db
      .select({ sessionId: mobileLink.sessionId })
      .from(mobileLink)
      .where(and(eq(mobileLink.id, c.req.param("id")), eq(mobileLink.userId, c.get("user").id)));
    if (!link?.sessionId) return c.json({ error: tr(messages).notFound }, 404);
    await db.delete(session).where(eq(session.id, link.sessionId));
    return c.json({ ok: true });
  })

  /** The app's Expo push token on this phone (null: notifications turned off), kept on its pairing row. */
  .put("/push-token", async (c) => {
    const body = z.object({ token: z.string().max(200).nullable() }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const current = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!current) return c.json({ error: tr(messages).notFound }, 404);
    // A token belongs to one phone: another account signed in on it before stops receiving.
    if (body.data.token) await db.update(mobileLink).set({ pushToken: null }).where(eq(mobileLink.pushToken, body.data.token));
    const done = await db
      .update(mobileLink)
      .set({ pushToken: body.data.token })
      .where(and(eq(mobileLink.sessionId, current.session.id), eq(mobileLink.userId, c.get("user").id)))
      .returning({ id: mobileLink.id });
    if (!done.length) return c.json({ error: tr(messages).notFound }, 404);
    return c.json({ ok: true });
  })

  /** Sign-out from the app itself (its bearer session only). */
  .post("/sign-out", async (c) => {
    const current = await auth.api.getSession({ headers: c.req.raw.headers });
    if (current) await db.delete(session).where(eq(session.id, current.session.id));
    return c.json({ ok: true });
  });
