import { integrationConfig } from "./app-integrations";

/** Resend settings in use (Settings › Integrations, else the environment); null = emails off. */
export async function mailConfig() {
  const cfg = await integrationConfig("resend");
  return cfg?.apiKey ? { apiKey: cfg.apiKey, from: cfg.from || "Agora <no-reply@localhost>" } : null;
}

export const mailEnabled = async () => !!(await mailConfig());

/** Sends an email through the Resend HTTP API. */
export async function sendMail(to: string, subject: string, html: string, text: string) {
  const cfg = await mailConfig();
  if (!cfg) throw new Error("Resend is not configured");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: cfg.from, to: [to], subject, html, text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/* App palette (index.css, single dark theme), in hex for mail clients. */
const C = {
  background: "#070707",
  card: "#0c0c0c",
  border: "#242424",
  foreground: "#f2f2f2",
  muted: "#989898",
  subtle: "#696969",
  bean: "#9a6a4b",
  eye: "#141414",
};
const FONT = `-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, 'Segoe UI', system-ui, sans-serif`;
const MONO = `'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace`;

/** "Bean" logo from the login screen, drawn in CSS: mail clients don't render SVG. */
const bean = `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="36" height="30" align="center" valign="middle" bgcolor="${C.bean}" style="width:36px;height:30px;border-radius:50%;background:${C.bean};line-height:0;font-size:0">
<span style="display:inline-block;width:3px;height:5px;border-radius:50%;background:${C.eye};margin:5px 2px 0"></span><span style="display:inline-block;width:3px;height:5px;border-radius:50%;background:${C.eye};margin:5px 2px 0"></span>
</td></tr></table>`;

type InvitationMailInput = {
  email: string;
  invitedBy: string;
  link: string;
  expiresAt: Date;
  orgName: string;
  locale: "fr" | "en";
  timezone: string;
};

const COPY = {
  fr: {
    subject: (i: InvitationMailInput) => `${i.invitedBy} t'invite sur ${i.orgName}`,
    preheader: (i: InvitationMailInput) => `Active ton compte ${i.orgName} en choisissant ton mot de passe.`,
    heading: (i: InvitationMailInput) => `Rejoins ${i.orgName}`,
    intro: (i: InvitationMailInput) => `${i.invitedBy} t'invite à rejoindre ${i.orgName}. Crée ton profil et choisis ton mot de passe pour activer ton compte.`,
    cta: "Créer mon compte",
    fallback: "Le bouton ne s'ouvre pas ? Copie ce lien dans ton navigateur :",
    footer: (until: string) => `Ce lien est valable jusqu'au ${until} et ne sert qu'une fois. Si tu n'attendais pas cette invitation, ignore cet email.`,
    greeting: "Bonjour,",
  },
  en: {
    subject: (i: InvitationMailInput) => `${i.invitedBy} invited you to ${i.orgName}`,
    preheader: (i: InvitationMailInput) => `Activate your ${i.orgName} account by choosing a password.`,
    heading: (i: InvitationMailInput) => `Join ${i.orgName}`,
    intro: (i: InvitationMailInput) => `${i.invitedBy} invited you to join ${i.orgName}. Set up your profile and choose a password to activate your account.`,
    cta: "Create my account",
    fallback: "Button not working? Paste this link into your browser:",
    footer: (until: string) => `This link is valid until ${until} and can only be used once. If you weren't expecting this invitation, you can ignore this email.`,
    greeting: "Hi,",
  },
};

const formatDay = (date: Date, locale: "fr" | "en", timezone: string) =>
  date
    .toLocaleDateString(locale === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "long", timeZone: timezone })
    .replace(/^1 /, locale === "fr" ? "1er " : "1 ");

export function invitationMail(input: InvitationMailInput) {
  const t = COPY[input.locale];
  const until = formatDay(input.expiresAt, input.locale, input.timezone);
  return layout({
    locale: input.locale,
    orgName: input.orgName,
    link: input.link,
    subject: t.subject(input),
    preheader: t.preheader(input),
    greeting: t.greeting,
    heading: t.heading(input),
    intro: t.intro(input),
    cta: t.cta,
    fallback: t.fallback,
    footer: t.footer(until),
  });
}

type PasswordResetMailInput = { link: string; orgName: string; locale: "fr" | "en" };

const RESET_COPY = {
  fr: {
    subject: (org: string) => `Réinitialise ton mot de passe ${org}`,
    preheader: "Choisis un nouveau mot de passe pour ton compte.",
    heading: "Mot de passe oublié ?",
    intro: (org: string) => `Une demande de réinitialisation du mot de passe de ton compte ${org} a été faite. Choisis-en un nouveau avec le bouton ci-dessous.`,
    cta: "Choisir un nouveau mot de passe",
    fallback: "Le bouton ne s'ouvre pas ? Copie ce lien dans ton navigateur :",
    footer: "Ce lien est valable une heure et ne sert qu'une fois. Si tu n'es pas à l'origine de cette demande, ignore cet email : ton mot de passe reste inchangé.",
    greeting: "Bonjour,",
  },
  en: {
    subject: (org: string) => `Reset your ${org} password`,
    preheader: "Choose a new password for your account.",
    heading: "Forgot your password?",
    intro: (org: string) => `Someone asked to reset the password of your ${org} account. Choose a new one with the button below.`,
    cta: "Choose a new password",
    fallback: "Button not working? Paste this link into your browser:",
    footer: "This link is valid for one hour and can only be used once. If you didn't ask for this, ignore this email: your password stays the same.",
    greeting: "Hi,",
  },
};

export function passwordResetMail(input: PasswordResetMailInput) {
  const t = RESET_COPY[input.locale];
  return layout({
    locale: input.locale,
    orgName: input.orgName,
    link: input.link,
    subject: t.subject(input.orgName),
    preheader: t.preheader,
    greeting: t.greeting,
    heading: t.heading,
    intro: t.intro(input.orgName),
    cta: t.cta,
    fallback: t.fallback,
    footer: t.footer,
  });
}

type Layout = {
  locale: "fr" | "en";
  orgName: string;
  link: string;
  subject: string;
  preheader: string;
  greeting: string;
  heading: string;
  intro: string;
  cta: string;
  fallback: string;
  footer: string;
};

/** Shared transactional layout: logo, card with a single call to action, fallback link, footer. */
function layout(m: Layout) {
  const { subject } = m;
  const text = [m.greeting, "", m.intro, "", `${m.cta}${m.locale === "fr" ? " : " : ": "}${m.link}`, "", m.footer].join("\n");
  const e = escape;
  const html = `<!doctype html>
<html lang="${m.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${e(subject)}</title>
<style>
  :root { color-scheme: dark; }
  a { color: ${C.foreground}; }
  @media (max-width: 520px) { .card { padding: 28px 22px !important; } .cta { width: 100% !important; } .cta a { display: block !important; text-align: center !important; } }
</style>
</head>
<body style="margin:0;padding:0;background:${C.background};color:${C.foreground};font-family:${FONT};-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.background}">${e(m.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.background}" style="background:${C.background}">
<tr><td align="center" style="padding:48px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px">
    <tr><td style="padding:0 4px 24px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="middle">${bean}</td>
        <td valign="middle" style="padding-left:12px;font-size:15px;font-weight:600;letter-spacing:-0.01em;color:${C.foreground}">${e(m.orgName)}</td>
      </tr></table>
    </td></tr>
    <tr><td class="card" bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.border};border-radius:24px;padding:36px 32px">
      <h1 style="margin:0;font-size:24px;line-height:1.25;font-weight:600;letter-spacing:-0.02em;color:${C.foreground}">${e(m.heading)}</h1>
      <p style="margin:12px 0 0;font-size:15px;line-height:1.55;color:${C.muted}">${e(m.intro)}</p>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="cta" style="margin:28px 0 0">
        <tr><td bgcolor="${C.foreground}" style="border-radius:999px;background:${C.foreground}">
          <a href="${e(m.link)}" target="_blank" style="display:inline-block;padding:13px 24px;font-size:15px;font-weight:600;line-height:18px;color:${C.background};text-decoration:none;border-radius:999px">${e(m.cta)}</a>
        </td></tr>
      </table>

      <p style="margin:28px 0 0;padding-top:20px;border-top:1px solid ${C.border};font-size:13px;line-height:1.5;color:${C.subtle}">${e(m.fallback)}<br>
        <a href="${e(m.link)}" target="_blank" style="font-family:${MONO};font-size:12px;color:${C.muted};text-decoration:none;word-break:break-all">${e(m.link)}</a>
      </p>
    </td></tr>
    <tr><td style="padding:24px 8px 0;font-size:12px;line-height:1.55;color:${C.subtle}">${e(m.footer)}</td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
  return { subject, html, text };
}
