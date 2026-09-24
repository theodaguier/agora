import { expect, test } from "bun:test";
import { invitationMail, passwordResetMail } from "./mail";

const base = {
  email: "camille@example.com",
  invitedBy: "Théo",
  link: "https://app.test/invite/abc",
  expiresAt: new Date("2026-09-30T22:30:00Z"),
  orgName: "Acme",
  locale: "fr" as const,
  timezone: "Europe/Paris",
};

test("escapes what the admin typed", () => {
  const { html } = invitationMail({ ...base, invitedBy: `<img src=x onerror="a">`, orgName: "R&D" });
  expect(html).not.toContain("<img src=x");
  expect(html).toContain("R&#38;D");
});

test("date in the organization's time zone, organization's language", () => {
  expect(invitationMail(base).text).toContain("jusqu'au 1er octobre");
  const en = invitationMail({ ...base, locale: "en" });
  expect(en.subject).toBe("Théo invited you to Acme");
  expect(en.html).toContain("Create my account");
});

test("password reset in the user's language, link escaped", () => {
  const fr = passwordResetMail({ link: "https://app.test/reset-password/a&b", orgName: "Acme", locale: "fr" });
  expect(fr.subject).toBe("Réinitialise ton mot de passe Acme");
  expect(fr.html).toContain("reset-password/a&#38;b");
  expect(fr.text).toContain("https://app.test/reset-password/a&b");
  expect(passwordResetMail({ link: "x", orgName: "Acme", locale: "en" }).html).toContain("Choose a new password");
});
