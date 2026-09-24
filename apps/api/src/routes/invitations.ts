import { Hono } from "hono";
import { z } from "zod";
import { auth } from "../auth";
import { acceptInvitation, findInvitation, InvitationError } from "../invitations";
import { profileInput } from "../profile";
import { profileError, usernameTaken } from "./me";
import { errors } from "../errors.messages";
import { defineMessages, tr } from "../i18n";

const messages = defineMessages({
  en: { passwordTooShort: "The password must be at least 10 characters." },
  fr: { passwordTooShort: "Le mot de passe doit faire au moins 10 caractères." },
});

const fail = (err: unknown) => {
  if (err instanceof InvitationError) return { error: err.message, status: err.status };
  throw err;
};

/** Public routes for the invitation link: the token stands in for a session. */
export const invitations = new Hono()
  .get("/:token", async (c) => {
    try {
      const row = await findInvitation(c.req.param("token"));
      return c.json({ email: row.email });
    } catch (err) {
      const { error, status } = fail(err);
      return c.json({ error }, status);
    }
  })

  /** Creates the account, then opens the session (the cookie comes from Better Auth). */
  .post("/:token/accept", async (c) => {
    const body = profileInput.extend({ password: z.string().min(10).max(128) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      const password = body.error.issues.some((i) => i.path[0] === "password");
      return c.json({ error: password ? tr(messages).passwordTooShort : profileError(body.error.issues) }, 400);
    }
    const { password, ...profile } = body.data;
    if (await usernameTaken(profile.username)) return c.json({ error: tr(errors).usernameTaken }, 409);
    let email: string;
    try {
      email = await acceptInvitation(c.req.param("token"), profile, password);
    } catch (err) {
      const { error, status } = fail(err);
      return c.json({ error }, status);
    }
    return auth.api.signInEmail({ body: { email, password }, headers: c.req.raw.headers, asResponse: true });
  });
