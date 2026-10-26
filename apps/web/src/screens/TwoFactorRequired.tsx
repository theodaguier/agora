import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { OrgLogo } from "@/components/OrgLogo";
import { TwoFactorDialog, type TwoFactorStep } from "@/components/TwoFactor";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth";
import { useOrgTitle } from "@/lib/org";
import { defineMessages, useT } from "@/i18n";

const messages = defineMessages({
  en: {
    title: "Turn on two-step verification",
    text: (org: string) => `${org} requires it for every account. You'll need an authenticator app (1Password, Google Authenticator…).`,
    turnOn: "Turn on",
    signOut: "Sign out",
  },
  fr: {
    title: "Active la validation en deux étapes",
    text: (org: string) => `${org} l'exige pour tous les comptes. Il te faut une application d'authentification (1Password, Google Authenticator…).`,
    turnOn: "Activer",
    signOut: "Se déconnecter",
  },
});

/** Signed in without two-step verification while the organization requires it: nothing else is reachable. */
export function TwoFactorRequired() {
  const t = useT(messages);
  const navigate = useNavigate();
  const orgName = useOrgTitle();
  const [step, setStep] = useState<TwoFactorStep | null>(null);

  return (
    <div className="grid min-h-dvh place-items-center bg-sidebar px-4 py-10">
      <div className="w-full max-w-[400px] rounded-[18px] border border-border bg-background p-8">
        <OrgLogo className="size-9" />
        <h1 className="mt-5 text-[22px] leading-7 font-semibold">{t.title}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">{t.text(orgName)}</p>
        <Button size="lg" className="mt-6 w-full" onClick={() => setStep({ kind: "password", intent: "enable" })}>
          {t.turnOn}
        </Button>
        <Button
          variant="link"
          className="mx-auto mt-3 flex text-muted-foreground"
          onClick={async () => {
            await authClient.signOut();
            navigate({ to: "/login" });
          }}
        >
          {t.signOut}
        </Button>
      </div>
      <TwoFactorDialog
        step={step}
        onStep={setStep}
        onClose={async () => {
          setStep(null);
          const { data } = await authClient.getSession({ query: { disableCookieCache: true } });
          if (data?.user.twoFactorEnabled) navigate({ to: "/" });
        }}
      />
    </div>
  );
}
