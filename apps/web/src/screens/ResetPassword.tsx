import { Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { FormLabel } from "@/components/FormLabel";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";
import { authClient } from "@/lib/auth";
import { Centered } from "./ForgotPassword";

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
      <Centered>
        <AgentAvatar agent={{ avatar: { shape: "bean", color: "#9a6a4b" } }} className="mx-auto size-14" />
        <h1 className="mt-6 text-center text-2xl font-semibold tracking-tight">{done ? t.doneTitle : t.invalidTitle}</h1>
        <p className="mt-1.5 text-center text-sm text-muted-foreground">{done ? t.done : t.invalid}</p>
        <Button size="lg" nativeButton={false} render={<Link to={done ? "/login" : "/forgot-password"} />} className="mt-6 w-full">
          {done ? t.goToLogin : t.requestNew}
        </Button>
      </Centered>
    );
  }

  return (
    <Centered>
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
        <AgentAvatar agent={{ avatar: { shape: "bean", color: "#9a6a4b" } }} className="mx-auto size-14" />
        <h1 className="mt-6 text-center text-2xl font-semibold tracking-tight">{t.title}</h1>
        <p className="mt-1.5 text-center text-sm text-muted-foreground">{t.hint}</p>
        <FieldGroup className="mt-3 gap-3">
          <Field className="gap-1.5">
            <FormLabel htmlFor="reset-password" required className="font-normal text-foreground/85">
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
              className="h-11 rounded-xl px-3.5 text-[15px]"
            />
          </Field>
          <Field className="gap-1.5">
            <FormLabel htmlFor="reset-confirm" required className="font-normal text-foreground/85">
              {t.confirm}
            </FormLabel>
            <Input id="reset-confirm" name="confirm" type="password" required minLength={10} autoComplete="new-password" className="h-11 rounded-xl px-3.5 text-[15px]" />
          </Field>
        </FieldGroup>
        {error && <FieldError className="mt-3">{error}</FieldError>}
        <Button type="submit" size="lg" disabled={pending} className="mt-6 w-full">
          {pending ? t.saving : t.save}
        </Button>
      </form>
    </Centered>
  );
}
