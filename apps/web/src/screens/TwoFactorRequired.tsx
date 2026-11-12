import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { OrgLogo } from "@/components/OrgLogo";
import { TwoFactorDialog, type TwoFactorStep } from "@/components/TwoFactor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
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
    <div className="flex min-h-svh w-full items-start justify-center p-6 md:p-10 md:pt-28">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <OrgLogo className="size-9" />
          <CardTitle>{t.title}</CardTitle>
          <CardDescription>{t.text(orgName)}</CardDescription>
        </CardHeader>
        <CardContent>
          <Field>
            <Button className="w-full" onClick={() => setStep({ kind: "password", intent: "enable" })}>
              {t.turnOn}
            </Button>
            <Button
              variant="link"
              onClick={async () => {
                await authClient.signOut();
                navigate({ to: "/login" });
              }}
            >
              {t.signOut}
            </Button>
          </Field>
        </CardContent>
      </Card>
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
