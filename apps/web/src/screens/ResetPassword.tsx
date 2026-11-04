import { Link, useParams } from "@tanstack/react-router";
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
import { AuthPage } from "./ForgotPassword";

const messages = defineMessages({
  en: {
    title: "Choose a new password",
    hint: "It replaces the old one and signs you out everywhere.",
    password: "New password",
    passwordPlaceholder: "10 characters min.",
    confirm: "Confirm password",
    mismatch: "The two passwords don't match.",
    tooShort: "The password must be at least 10 characters.",
    saving: "Saving…",
    save: "Change my password",
    invalidTitle: "Link no longer valid",
    invalid: "This link has expired or has already been used. Ask for a new one.",
    requestNew: "Get a new link",
    doneTitle: "Password changed",
    done: "Sign in with your new password.",
    goToLogin: "Sign in",
  },
  fr: {
    title: "Choisis un nouveau mot de passe",
    hint: "Il remplace l'ancien et te déconnecte de tous tes appareils.",
    password: "Nouveau mot de passe",
    passwordPlaceholder: "10 caractères min.",
    confirm: "Confirmation",
    mismatch: "Les deux mots de passe ne correspondent pas.",
    tooShort: "Le mot de passe doit faire au moins 10 caractères.",
    saving: "Enregistrement…",
    save: "Changer mon mot de passe",
    invalidTitle: "Lien plus valable",
    invalid: "Ce lien a expiré ou a déjà servi. Demandes-en un nouveau.",
    requestNew: "Recevoir un nouveau lien",
    doneTitle: "Mot de passe modifié",
    done: "Connecte-toi avec ton nouveau mot de passe.",
    goToLogin: "Se connecter",
  },
});

/** Page for the link received by email: the token is enough, no session needed. */
export function ResetPassword() {
  const { token } = useParams({ from: "/reset-password/$token" });
  const t = useT(messages);
  const c = useT(common);
  const [state, setState] = useState<"form" | "invalid" | "done">("form");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (state !== "form") {
    const done = state === "done";
    return (
      <AuthPage>
        <Card className="w-full max-w-sm">
          <CardHeader>
            <AgentAvatar agent={{ avatar: { shape: "bean", color: "#9a6a4b" } }} className="size-9" />
            <CardTitle>{done ? t.doneTitle : t.invalidTitle}</CardTitle>
            <CardDescription>{done ? t.done : t.invalid}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button nativeButton={false} render={<Link to={done ? "/login" : "/forgot-password"} />} className="w-full">
              {done ? t.goToLogin : t.requestNew}
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
              const form = new FormData(e.currentTarget);
              const newPassword = String(form.get("password"));
              if (newPassword !== String(form.get("confirm"))) return setError(t.mismatch);
              setPending(true);
              setError(null);
              const { error } = await authClient.resetPassword({ newPassword, token }).finally(() => setPending(false));
              if (!error) return setState("done");
              // better-auth errors come back in English: map them by code.
              if (error.code === "INVALID_TOKEN" || error.code === "USER_NOT_FOUND") setState("invalid");
              else setError(error.code === "PASSWORD_TOO_SHORT" ? t.tooShort : c.unknownError);
            }}
          >
            <FieldGroup>
              <Field>
                <FormLabel htmlFor="reset-password" required>
                  {t.password}
                </FormLabel>
                <Input
                  id="reset-password"
                  name="password"
                  type="password"
                  required
                  minLength={10}
                  autoComplete="new-password"
                  autoFocus
                  placeholder={t.passwordPlaceholder}
                />
              </Field>
              <Field>
                <FormLabel htmlFor="reset-confirm" required>
                  {t.confirm}
                </FormLabel>
                <Input id="reset-confirm" name="confirm" type="password" required minLength={10} autoComplete="new-password" />
              </Field>
              {error && <FieldError>{error}</FieldError>}
              <Field>
                <Button type="submit" disabled={pending} className="w-full">
                  {pending ? t.saving : t.save}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </AuthPage>
  );
}
