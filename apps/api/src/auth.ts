import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins/admin";
import { bearer } from "better-auth/plugins/bearer";
import { twoFactor } from "better-auth/plugins/two-factor";
import { db, schema } from "./db";
import { env } from "./env";
import { mailEnabled, passwordResetMail, sendMail } from "./mail";
import { getOrg, userLocale } from "./org";

export const auth = betterAuth({
  appName: "Agora",
  database: drizzleAdapter(db, { provider: "pg", schema }),
  // No open sign-up: accounts are created from an email invitation (invitations.ts).
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 10,
    resetPasswordTokenExpiresIn: 3600,
    // A reset is often the answer to a leaked password: every open session is closed.
    revokeSessionsOnPasswordReset: true,
    // The link points to the web app (not Better Auth's redirect endpoint); the screen posts the token back.
    sendResetPassword: async ({ user, token }) => {
      const link = `${env.WEB_ORIGIN}/reset-password/${token}`;
      if (!(await mailEnabled())) return console.log(`password reset ${user.email}: ${link}`);
      // Not awaited (lookups included): the response time must not reveal whether the address has an account.
      void (async () => {
        const org = await getOrg();
        const mail = passwordResetMail({ link, orgName: org.name, locale: await userLocale((user as { locale?: string | null }).locale) });
        await sendMail(user.email, mail.subject, mail.html, mail.text);
      })().catch((err) => console.error("password reset mail", err));
    },
  },
  // Profile, editable only through our routes (/api/me): `input: false` closes these fields to the Better Auth API.
  user: {
    additionalFields: {
      firstName: { type: "string", required: false, defaultValue: "", input: false },
      lastName: { type: "string", required: false, defaultValue: "", input: false },
      username: { type: "string", required: false, input: false },
      bio: { type: "string", required: false, defaultValue: "", input: false },
      title: { type: "string", required: false, defaultValue: "", input: false },
      locale: { type: "string", required: false, input: false },
      releaseNotesSeen: { type: "string", required: false, input: false },
      digestSeen: { type: "string", required: false, input: false },
    },
  },
  trustedOrigins: [env.WEB_ORIGIN],
  // Profile updates go through /api/me: name is recomputed, photo is served by the API rather than an arbitrary URL.
  disabledPaths: ["/update-user"],
  // bearer: the mobile app sends its session token as `Authorization: Bearer …` (routes/mobile.ts).
  // twoFactor: TOTP (authenticator app) + backup codes, turned on by each person from their profile.
  // The issuer shown in the authenticator is sent by the web app (organization name); "Agora" otherwise.
  plugins: [admin({ defaultRole: "user", adminRoles: ["admin"] }), bearer(), twoFactor({ issuer: "Agora" })],
});

export type SessionUser = typeof auth.$Infer.Session.user;
