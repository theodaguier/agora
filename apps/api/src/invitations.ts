import { getOrg } from "./org";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { auth } from "./auth";
import { db, schema } from "./db";
import { env } from "./env";
import { invitationMail, mailEnabled, sendMail } from "./mail";
import { fullName } from "./profile";
import { defineMessages, tr } from "./i18n";

// Returned to the admin or to the invitee during their request: in the interface language.
// The email itself is written in the organization's language (the invitee has no account yet).
const messages = defineMessages({
  en: {
    accountExists: "An account already exists for this address.",
    notFound: "Invitation not found.",
    sendFailed: "The email couldn't be sent.",
    invalidLink: "This invitation link is no longer valid.",
    expired: "This invitation link has expired. Ask for a new one.",
  },
  fr: {
    accountExists: "Un compte existe déjà pour cette adresse.",
    notFound: "Invitation introuvable.",
    sendFailed: "L'email n'a pas pu être envoyé.",
    invalidLink: "Ce lien d'invitation n'est plus valable.",
    expired: "Ce lien d'invitation a expiré. Demande-en un nouveau.",
  },
});

const { invitation, user } = schema;

const TTL_MS = 7 * 24 * 3600 * 1000;

/** The admin only provides the address and access level: the invitee fills in the profile. */
export type InvitationInput = { email: string; role: "admin" | "user" };

const hash = (token: string) => new Bun.CryptoHasher("sha256").update(token).digest("hex");

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString("base64url");
}

export const invitationLink = (token: string) => `${env.WEB_ORIGIN}/invite/${token}`;

/**
 * Sends the link by email. Without Resend configured (dev), the link is logged
 * and returned to the admin, who passes it on themselves.
 */
async function deliver(row: typeof invitation.$inferSelect, token: string, invitedBy: string) {
  const link = invitationLink(token);
  if (!(await mailEnabled())) {
    console.log(`invitation ${row.email}: ${link}`);
    return { sent: false, link };
  }
  const org = await getOrg();
  const mail = invitationMail({
    email: row.email,
    expiresAt: row.expiresAt,
    invitedBy,
    link,
    orgName: org.name,
    locale: org.locale,
    timezone: org.timezone,
  });
  await sendMail(row.email, mail.subject, mail.html, mail.text);
  return { sent: true, link: null };
}

export class InvitationError extends Error {
  constructor(
    public status: 400 | 404 | 409 | 410 | 502,
    message: string,
  ) {
    super(message);
  }
}

/** Invites an address; a still-open invitation for the same address is replaced. */
export async function createInvitation(input: InvitationInput, invitedBy: { id: string; name: string }) {
  const email = input.email.trim().toLowerCase();
  const [existing] = await db.select({ id: user.id }).from(user).where(eq(sql`lower(${user.email})`, email));
  if (existing) throw new InvitationError(409, tr(messages).accountExists);

  const token = newToken();
  const row = await db.transaction(async (tx) => {
    await tx.delete(invitation).where(and(eq(invitation.email, email), isNull(invitation.acceptedAt)));
    const [row] = await tx
      .insert(invitation)
      .values({
        id: crypto.randomUUID(),
        ...input,
        email,
        tokenHash: hash(token),
        invitedBy: invitedBy.id,
        expiresAt: new Date(Date.now() + TTL_MS),
      })
      .returning();
    return row!;
  });
  return { id: row.id, ...(await send(row, token, invitedBy.name)) };
}

/** New link (the old one stops working) and a new send. */
export async function resendInvitation(id: string, invitedBy: { name: string }) {
  const token = newToken();
  const [row] = await db
    .update(invitation)
    .set({ tokenHash: hash(token), expiresAt: new Date(Date.now() + TTL_MS) })
    .where(and(eq(invitation.id, id), isNull(invitation.acceptedAt)))
    .returning();
  if (!row) throw new InvitationError(404, tr(messages).notFound);
  return send(row, token, invitedBy.name);
}

async function send(row: typeof invitation.$inferSelect, token: string, invitedBy: string) {
  try {
    return await deliver(row, token, invitedBy);
  } catch (err) {
    console.error("invitation: send", err);
    // The invitation stays valid: the admin can resend or copy the link.
    return { sent: false, link: invitationLink(token), error: tr(messages).sendFailed };
  }
}

/** Open invitation matching the link's token. */
export async function findInvitation(token: string) {
  const [row] = await db.select().from(invitation).where(eq(invitation.tokenHash, hash(token)));
  if (!row || row.acceptedAt) throw new InvitationError(404, tr(messages).invalidLink);
  if (row.expiresAt < new Date()) throw new InvitationError(410, tr(messages).expired);
  return row;
}

type Profile = { firstName: string; lastName: string; title: string; username: string; bio?: string };

/** Creates the account: the invitation is consumed first, so a link can only be used once. */
export async function acceptInvitation(token: string, profile: Profile, password: string) {
  const open = await findInvitation(token);
  const [claimed] = await db
    .update(invitation)
    .set({ acceptedAt: new Date() })
    .where(and(eq(invitation.id, open.id), isNull(invitation.acceptedAt), gt(invitation.expiresAt, new Date())))
    .returning();
  if (!claimed) throw new InvitationError(404, tr(messages).invalidLink);

  const ctx = await auth.$context;
  let userId: string | null = null;
  try {
    const created = await ctx.internalAdapter.createUser(
      {
        email: claimed.email,
        name: fullName(profile),
        emailVerified: true,
        role: claimed.role,
        firstName: profile.firstName,
        lastName: profile.lastName,
        title: profile.title,
        username: profile.username,
        bio: profile.bio ?? "",
      },
      { method: "admin" },
    );
    userId = created.id;
    await ctx.internalAdapter.linkAccount({
      userId: created.id,
      providerId: "credential",
      accountId: created.id,
      password: await ctx.password.hash(password),
    });
    return claimed.email;
  } catch (err) {
    // Nothing half-done: the link becomes usable again.
    if (userId) await db.delete(user).where(eq(user.id, userId));
    await db.update(invitation).set({ acceptedAt: null }).where(eq(invitation.id, claimed.id));
    throw err;
  }
}
