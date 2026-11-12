import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { FormLabel } from "@/components/FormLabel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup } from "@/components/ui/field";
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
      <AuthPage>
        <Card className="w-full max-w-sm">
          <CardHeader>
            <AgentAvatar agent={{ avatar: { shape: "bean", color: "#9a6a4b" } }} className="size-9" />
            <CardTitle>{t.sentTitle}</CardTitle>
            <CardDescription>{t.sent(sentTo)}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" nativeButton={false} render={<Link to="/login" />} className="w-full">
              {t.backToLogin}
            </Button>
          </CardContent>
        </Card>
      </AuthPage>
    );
  }

  return (
    <AuthPage>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <AgentAvatar agent={{ avatar: { shape: "bean", color: "#9a6a4b" } }} className="size-9" />
          <CardTitle>{t.title}</CardTitle>
          <CardDescription>{t.hint}</CardDescription>
        </CardHeader>
        <CardContent>
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
            <FieldGroup>
              <Field>
                <FormLabel htmlFor="forgot-email" required>
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
                />
              </Field>
              {error && <FieldError>{error}</FieldError>}
              <Field>
                <Button type="submit" disabled={pending} className="w-full">
                  {pending ? t.sending : t.send}
                </Button>
                <Button variant="link" nativeButton={false} render={<Link to="/login" />}>
                  {t.backToLogin}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </AuthPage>
  );
}

/** Centers an auth card on the page (sign-in block layout). */
export function AuthPage({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-svh w-full items-start justify-center p-6 md:p-10 md:pt-28">{children}</div>;
}
