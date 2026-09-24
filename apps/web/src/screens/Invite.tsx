import { useOrgTitle } from "@/lib/org";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { OrgLogo } from "@/components/OrgLogo";
import { AvatarField, ProfileFields, type AvatarChange } from "@/components/ProfileFields";
import { readProfile } from "@/lib/profile";
import { Button } from "@/components/ui/button";
import { FormLabel } from "@/components/FormLabel";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api, ApiError, uploadAvatar } from "@/lib/api";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";

const messages = defineMessages({
  en: {
    unreachable: "Server unreachable",
    unreachableHint: "Your invitation isn't the problem. Try again in a moment.",
    retrying: "Retrying…",
    unavailable: "Invitation unavailable",
    goToLogin: "Go to sign in",
    mismatch: "The two passwords don't match.",
    createFailed: "Couldn't create the account.",
    welcome: (org: string) => `Welcome to ${org}`,
    hint: "Create your profile and choose your password.",
    email: "Email",
    password: "Password",
    passwordPlaceholder: "10 characters min.",
    confirm: "Confirm password",
    creating: "Creating account…",
    create: "Create my account",
  },
  fr: {
    unreachable: "Serveur injoignable",
    unreachableHint: "Ton invitation n'est pas en cause. Réessaie dans un instant.",
    retrying: "Nouvel essai…",
    unavailable: "Invitation indisponible",
    goToLogin: "Aller à la connexion",
    mismatch: "Les deux mots de passe ne correspondent pas.",
    createFailed: "Création du compte impossible.",
    welcome: (org: string) => `Bienvenue sur ${org}`,
    hint: "Crée ton profil et choisis ton mot de passe.",
    email: "Email",
    password: "Mot de passe",
    passwordPlaceholder: "10 caractères min.",
    confirm: "Confirmation",
    creating: "Création du compte…",
    create: "Créer mon compte",
  },
});

type OpenInvitation = { email: string };

/** Page for the link received by email: the invitee completes their profile and picks a password. */
export function Invite() {
  const { token } = useParams({ from: "/invite/$token" });
  const navigate = useNavigate();
  const orgName = useOrgTitle();
  const t = useT(messages);
  const c = useT(common);
  const invitation = useQuery({
    queryKey: ["invitation", token],
    queryFn: () => api<OpenInvitation>(`/invitations/${encodeURIComponent(token)}`),
    // An invalid or expired link (4xx) is final; an unreachable server deserves a few retries.
    retry: (count, err) => !isDefinitive(err) && count < 2,
    staleTime: Infinity,
  });
  const [photo, setPhoto] = useState<AvatarChange>(undefined);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (invitation.isPending) {
    return (
      <Centered>
        <Spinner />
      </Centered>
    );
  }
  if (invitation.isError && !isDefinitive(invitation.error)) {
    return (
      <Centered>
        <OrgLogo className="mx-auto size-14" />
        <h1 className="mt-6 text-center text-2xl font-semibold tracking-tight">{t.unreachable}</h1>
        <p className="mt-1.5 text-center text-sm text-muted-foreground">{t.unreachableHint}</p>
        <Button variant="outline" className="mx-auto mt-6 flex" disabled={invitation.isFetching} onClick={() => invitation.refetch()}>
          {invitation.isFetching ? t.retrying : c.retry}
        </Button>
      </Centered>
    );
  }
  if (invitation.isError) {
    return (
      <Centered>
        <OrgLogo className="mx-auto size-14" />
        <h1 className="mt-6 text-center text-2xl font-semibold tracking-tight">{t.unavailable}</h1>
        <p className="mt-1.5 text-center text-sm text-muted-foreground">{invitation.error.message}</p>
        <Button variant="outline" className="mx-auto mt-6 flex" onClick={() => navigate({ to: "/login" })}>
          {t.goToLogin}
        </Button>
      </Centered>
    );
  }

  const data = invitation.data;
  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <form
        className="w-full max-w-lg"
        onInput={(e) => {
          const form = new FormData(e.currentTarget);
          setName(`${form.get("firstName") ?? ""} ${form.get("lastName") ?? ""}`.trim());
        }}
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const password = String(form.get("password"));
          if (password !== String(form.get("confirm"))) return setError(t.mismatch);
          setPending(true);
          setError(null);
          try {
            await api(`/invitations/${encodeURIComponent(token)}/accept`, {
              method: "POST",
              body: JSON.stringify({ ...readProfile(form), password }),
            });
          } catch (err) {
            setPending(false);
            return setError(err instanceof Error ? err.message : t.createFailed);
          }
          // The account exists and the session is open: a rejected photo must not block onboarding.
          if (photo) await uploadAvatar(photo).catch(() => {});
          navigate({ to: "/" });
        }}
      >
        <OrgLogo className="mx-auto size-14" />
        <h1 className="mt-6 text-center text-2xl font-semibold tracking-tight">{t.welcome(orgName)}</h1>
        <p className="mt-1.5 text-center text-sm text-muted-foreground">{t.hint}</p>

        <div className="mt-4 flex flex-col gap-6">
          <AvatarField id={data.email} name={name} current={null} value={photo} onChange={setPhoto} />
          <Field>
            <FieldLabel htmlFor="invite-email">{t.email}</FieldLabel>
            <Input id="invite-email" type="email" value={data.email} readOnly disabled autoComplete="email" />
          </Field>
          <ProfileFields idPrefix="invite" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FormLabel htmlFor="invite-password" required>
                {t.password}
              </FormLabel>
              <Input id="invite-password" name="password" type="password" required minLength={10} autoComplete="new-password" placeholder={t.passwordPlaceholder} />
            </Field>
            <Field>
              <FormLabel htmlFor="invite-confirm" required>
                {t.confirm}
              </FormLabel>
              <Input id="invite-confirm" name="confirm" type="password" required minLength={10} autoComplete="new-password" />
            </Field>
          </div>
        </div>

        {error && <FieldError className="mt-4">{error}</FieldError>}
        <Button type="submit" size="lg" disabled={pending} className="mt-6 w-full">
          {pending ? t.creating : t.create}
        </Button>
      </form>
    </div>
  );
}

/** 4xx: invalid, expired or already used link. Everything else (network, 5xx, proxy) is transient. */
function isDefinitive(err: unknown) {
  return err instanceof ApiError && err.status >= 400 && err.status < 500;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
