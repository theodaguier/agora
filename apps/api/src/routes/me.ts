import { and, eq, ne } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db, schema } from "../db";
import { requireUser, type AppEnv } from "../middleware";
import { avatarUrl, fullName, profileInput, readAvatar } from "../profile";
import { errors } from "../errors.messages";
import { defineMessages, tr } from "../i18n";
import { version } from "../version";

const messages = defineMessages({
  en: {
    usernameInvalid: "Username: 2 to 30 characters, lowercase letters, digits, “.” or “_”.",
    profileRequired: "First name, last name, role and username are required.",
    unknownLanguage: "Unknown language.",
  },
  fr: {
    usernameInvalid: "Username : 2 à 30 caractères, lettres minuscules, chiffres, « . » ou « _ ».",
    profileRequired: "Prénom, nom, rôle et username sont obligatoires.",
    unknownLanguage: "Langue inconnue.",
  },
});

const { user, userAvatar } = schema;

/** Is the username already taken by another account? */
export async function usernameTaken(username: string, exceptUserId?: string) {
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(exceptUserId ? and(eq(user.username, username), ne(user.id, exceptUserId)) : eq(user.username, username));
  return !!row;
}

/** Error message for a rejected profile. */
export const profileError = (issues: { message: string }[]) =>
  issues.some((i) => i.message === "username_invalid") ? tr(messages).usernameInvalid : tr(messages).profileRequired;

/** Profile of the signed-in account. */
export const me = new Hono<AppEnv>()
  .use(requireUser)

  /** Versions of the product and of the Hermes engine, shown in the mobile app's profile. */
  .get("/version", (c) => c.json({ app: version.app, hermes: version.hermes }))

  .patch("/", async (c) => {
    const body = profileInput.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: profileError(body.error.issues) }, 400);
    const id = c.get("user").id;
    if (await usernameTaken(body.data.username, id)) return c.json({ error: tr(errors).usernameTaken }, 409);
    await db
      .update(user)
      .set({ ...body.data, name: fullName(body.data) })
      .where(eq(user.id, id));
    return c.body(null, 204);
  })

  /** Agent language for this account; null = the organization's. */
  .put("/locale", async (c) => {
    const body = z.object({ locale: z.enum(["fr", "en"]).nullable() }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: tr(messages).unknownLanguage }, 400);
    await db.update(user).set({ locale: body.data.locale }).where(eq(user.id, c.get("user").id));
    return c.body(null, 204);
  })

  /** Marks a "What's new" release as seen, so it doesn't open again on another device. */
  .put("/release-notes", async (c) => {
    const body = z.object({ id: z.string().min(1).max(64) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    await db.update(user).set({ releaseNotesSeen: body.data.id }).where(eq(user.id, c.get("user").id));
    return c.body(null, 204);
  })

  /** Raw body: the image, already cropped by the app. */
  .put("/avatar", async (c) => {
    const upload = await readAvatar(c.req);
    if ("error" in upload) return c.json({ error: upload.error }, upload.status);
    const { mime, data } = upload;
    const id = c.get("user").id;
    const at = new Date();
    await db.transaction(async (tx) => {
      await tx
        .insert(userAvatar)
        .values({ userId: id, mime, data, updatedAt: at })
        .onConflictDoUpdate({ target: userAvatar.userId, set: { mime, data, updatedAt: at } });
      await tx.update(user).set({ image: avatarUrl(id, at) }).where(eq(user.id, id));
    });
    return c.json({ image: avatarUrl(id, at) });
  })

  .delete("/avatar", async (c) => {
    const id = c.get("user").id;
    await db.transaction(async (tx) => {
      await tx.delete(userAvatar).where(eq(userAvatar.userId, id));
      await tx.update(user).set({ image: null }).where(eq(user.id, id));
    });
    return c.body(null, 204);
  });
