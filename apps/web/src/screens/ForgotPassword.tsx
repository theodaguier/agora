import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { FormLabel } from "@/components/FormLabel";
import { Button } from "@/components/ui/button";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";
import { authClient } from "@/lib/auth";

const messages = defineMessages({
  en: {
    title: "Forgot your password?",
    hint: "Enter your account's email: we'll send you a link to choose a new one.",
    email: "Email",
    emailPlaceholder: "name@example.com",
    sending: "Sending…",
    send: "Send the link",
    tooMany: "Too many requests. Try again in a minute.",
    sentTitle: "Check your inbox",
    sent: (email: string) => `If an account exists for ${email}, a link to reset your password is on its way. It's valid for one hour.`,
    backToLogin: "Back to sign in",
  },
  fr: {
    title: "Mot de passe oublié ?",
    hint: "Indique l'email de ton compte : tu recevras un lien pour en choisir un nouveau.",
    email: "Email",
    emailPlaceholder: "prenom@exemple.com",
    sending: "Envoi…",
    send: "Envoyer le lien",
    tooMany: "Trop de demandes. Réessaie dans une minute.",
    sentTitle: "Consulte ta boîte mail",
    sent: (email: string) => `Si un compte existe pour ${email}, un lien pour réinitialiser ton mot de passe vient d'être envoyé. Il est valable une heure.`,
    backToLogin: "Retour à la connexion",
  },
});

/** Public: asks for a reset link. The answer is the same whether the address has an account or not. */
export function ForgotPassword() {
  const t = useT(messages);
  const c = useT(common);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (sentTo) {
    return (
      <Centered>
        <AgentAvatar agent={{ avatar: { shape: "bean", color: "#9a6a4b" } }} className="mx-auto size-14" />
        <h1 className="mt-6 text-center text-2xl font-semibold tracking-tight">{t.sentTitle}</h1>
        <p className="mt-1.5 text-center text-sm text-muted-foreground">{t.sent(sentTo)}</p>
        <Button variant="outline" size="lg" nativeButton={false} render={<Link to="/login" />} className="mt-6 w-full">
          {t.backToLogin}
        </Button>
      </Centered>
    );
  }

  return (
    <Centered>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const email = String(new FormData(e.currentTarget).get("email")).trim();
          setPending(true);
          setError(null);
          const { error } = await authClient.requestPasswordReset({ email }).finally(() => setPending(false));
          if (!error) setSentTo(email);
          else setError(error.status === 429 ? t.tooMany : c.unknownError);
        }}
      >
        <AgentAvatar agent={{ avatar: { shape: "bean", color: "#9a6a4b" } }} className="mx-auto size-14" />
        <h1 className="mt-6 text-center text-2xl font-semibold tracking-tight">{t.title}</h1>
        <p className="mt-1.5 text-center text-sm text-muted-foreground">{t.hint}</p>
        <Field className="mt-3 gap-1.5">
          <FormLabel htmlFor="forgot-email" required className="font-normal text-foreground/85">
            {t.email}
          </FormLabel>
          <Input
            id="forgot-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            autoFocus
            placeholder={t.emailPlaceholder}
            aria-invalid={!!error || undefined}
            className="h-11 rounded-xl px-3.5 text-[15px]"
          />
        </Field>
        {error && <FieldError className="mt-3">{error}</FieldError>}
        <Button type="submit" size="lg" disabled={pending} className="mt-6 w-full">
          {pending ? t.sending : t.send}
        </Button>
        <Button variant="link" nativeButton={false} render={<Link to="/login" />} className="mx-auto mt-3 flex text-muted-foreground">
          {t.backToLogin}
        </Button>
      </form>
    </Centered>
  );
}

export function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
