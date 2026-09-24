import { useRouteContext, useRouter } from "@tanstack/react-router";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { confirmAction } from "@/lib/confirm";
import { FormLabel } from "@/components/FormLabel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { TotpInput } from "@/components/TotpInput";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { authClient } from "@/lib/auth";
import { orgQuery, useOrgName } from "@/lib/org";
import { useQuery } from "@tanstack/react-query";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";

const messages = defineMessages({
  en: {
    title: "Two-step verification",
    offHelp: "Ask for a code from an authenticator app (1Password, Google Authenticator…) after your password.",
    onHelp: "On: a code from your authenticator app is asked after your password.",
    requiredHelp: "On, and required by your organization: a code from your authenticator app is asked after your password.",
    turnOn: "Turn on",
    turnOff: "Turn off",
    newCodes: "New backup codes",
    password: "Password",
    passwordHelp: "Confirm it's you.",
    wrongPassword: "Incorrect password.",
    continue: "Continue",
    scanHelp: "Scan this QR code with your authenticator app, then enter the 6-digit code it shows.",
    setupKey: "Setup key",
    setupKeyHelp: "To enter in the app if you can't scan the QR code.",
    code: "Verification code",
    invalidCode: "Incorrect code. Check your phone's time and try again.",
    activate: "Turn on",
    codesTitle: "Save your backup codes",
    codesHelp: "Each one lets you sign in once without your phone. They won't be shown again: keep them somewhere safe.",
    copy: "Copy",
    copied: "Copied",
    done: "Done",
    offTitle: "Turn off two-step verification?",
    offDescription: "Your password alone will be enough to sign in again, and your backup codes will stop working.",
    newCodesTitle: "Create new backup codes?",
    newCodesDescription: "Your current backup codes will stop working.",
    create: "Create",
  },
  fr: {
    title: "Validation en deux étapes",
    offHelp: "Demande un code d'une application d'authentification (1Password, Google Authenticator…) après ton mot de passe.",
    onHelp: "Activée : un code de ton application d'authentification est demandé après ton mot de passe.",
    requiredHelp: "Activée et exigée par ton organisation : un code de ton application d'authentification est demandé après ton mot de passe.",
    turnOn: "Activer",
    turnOff: "Désactiver",
    newCodes: "Nouveaux codes de secours",
    password: "Mot de passe",
    passwordHelp: "Confirme que c'est bien toi.",
    wrongPassword: "Mot de passe incorrect.",
    continue: "Continuer",
    scanHelp: "Scanne ce QR code avec ton application d'authentification, puis saisis le code à 6 chiffres qu'elle affiche.",
    setupKey: "Clé de configuration",
    setupKeyHelp: "À saisir dans l'application si tu ne peux pas scanner le QR code.",
    code: "Code de vérification",
    invalidCode: "Code incorrect. Vérifie l'heure de ton téléphone et réessaie.",
    activate: "Activer",
    codesTitle: "Enregistre tes codes de secours",
    codesHelp: "Chacun permet de te connecter une fois sans ton téléphone. Ils ne seront plus affichés : garde-les en lieu sûr.",
    copy: "Copier",
    copied: "Copié",
    done: "Terminé",
    offTitle: "Désactiver la validation en deux étapes ?",
    offDescription: "Ton mot de passe suffira de nouveau pour te connecter, et tes codes de secours ne fonctionneront plus.",
    newCodesTitle: "Créer de nouveaux codes de secours ?",
    newCodesDescription: "Tes codes de secours actuels ne fonctionneront plus.",
    create: "Créer",
  },
});

/** What the password dialog is for. */
type Intent = "enable" | "disable" | "codes";

export type TwoFactorStep =
  | { kind: "password"; intent: Intent }
  | { kind: "scan"; totpURI: string; backupCodes: string[] }
  | { kind: "codes"; backupCodes: string[] };

/** Settings › Security: TOTP two-step sign-in for one's own account (Better Auth twoFactor plugin). */
export function TwoFactor() {
  const { user } = useRouteContext({ from: "/app" });
  const router = useRouter();
  const t = useT(messages);
  const [step, setStep] = useState<TwoFactorStep | null>(null);
  const enabled = !!(user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled;
  // Required by the organization: it can't be turned off.
  const required = !!useQuery(orgQuery).data?.requireTwoFactor;

  const close = () => {
    setStep(null);
    // The session's user carries twoFactorEnabled: reload it.
    void router.invalidate();
  };

  return (
    <>
      <Item variant="outline">
        <ItemContent>
          <ItemTitle>{t.title}</ItemTitle>
          <ItemDescription>{enabled ? (required ? t.requiredHelp : t.onHelp) : t.offHelp}</ItemDescription>
        </ItemContent>
        <ItemActions>
          {enabled ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (await confirmAction({ title: t.newCodesTitle, description: t.newCodesDescription, action: t.create }))
                    setStep({ kind: "password", intent: "codes" });
                }}
              >
                {t.newCodes}
              </Button>
              {!required && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (await confirmAction({ title: t.offTitle, description: t.offDescription, action: t.turnOff }))
                      setStep({ kind: "password", intent: "disable" });
                  }}
                >
                  {t.turnOff}
                </Button>
              )}
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setStep({ kind: "password", intent: "enable" })}>
              {t.turnOn}
            </Button>
          )}
        </ItemActions>
      </Item>
      <TwoFactorDialog step={step} onStep={setStep} onClose={close} />
    </>
  );
}

/** Password, then QR code and first code, then backup codes (turning on); password only (off, new codes). */
export function TwoFactorDialog({ step, onStep, onClose }: { step: TwoFactorStep | null; onStep: (s: TwoFactorStep) => void; onClose: () => void }) {
  return (
    <Dialog open={!!step} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {step?.kind === "password" && <PasswordStep intent={step.intent} onNext={onStep} onDone={onClose} />}
        {step?.kind === "scan" && <ScanStep totpURI={step.totpURI} onVerified={() => onStep({ kind: "codes", backupCodes: step.backupCodes })} />}
        {step?.kind === "codes" && <CodesStep codes={step.backupCodes} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function PasswordStep({ intent, onNext, onDone }: { intent: Intent; onNext: (s: TwoFactorStep) => void; onDone: () => void }) {
  const t = useT(messages);
  const c = useT(common);
  // Inside the settings dialog: the tab keeps the title of the page underneath.
  const orgName = useOrgName();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const password = String(new FormData(e.currentTarget).get("password"));
        setPending(true);
        setError(null);
        const res = await (
          intent === "enable"
            ? authClient.twoFactor.enable({ password, issuer: orgName })
            : intent === "codes"
              ? authClient.twoFactor.generateBackupCodes({ password })
              : authClient.twoFactor.disable({ password })
        ).finally(() => setPending(false));
        if (res.error) return setError(res.error.status === 400 || res.error.status === 401 ? t.wrongPassword : c.unknownError);
        const data = res.data as { totpURI?: string; backupCodes?: string[] } | null;
        if (intent === "enable" && data?.totpURI) onNext({ kind: "scan", totpURI: data.totpURI, backupCodes: data.backupCodes ?? [] });
        else if (intent === "codes") onNext({ kind: "codes", backupCodes: data?.backupCodes ?? [] });
        else onDone();
      }}
    >
      <DialogHeader>
        <DialogTitle className="pr-6">{intent === "disable" ? t.offTitle : intent === "codes" ? t.newCodes : t.title}</DialogTitle>
        <DialogDescription>{t.passwordHelp}</DialogDescription>
      </DialogHeader>
      <FieldGroup className="my-5">
        <Field>
          <FormLabel htmlFor="tf-password" required>
            {t.password}
          </FormLabel>
          <Input id="tf-password" name="password" type="password" autoComplete="current-password" required autoFocus aria-invalid={!!error || undefined} />
          {error && <FieldError>{error}</FieldError>}
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="submit" variant={intent === "disable" ? "destructive" : "default"} disabled={pending}>
          {pending ? c.inProgress : intent === "disable" ? t.turnOff : t.continue}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ScanStep({ totpURI, onVerified }: { totpURI: string; onVerified: () => void }) {
  const t = useT(messages);
  const c = useT(common);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const secret = new URL(totpURI).searchParams.get("secret") ?? "";

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const code = String(new FormData(e.currentTarget).get("code")).replace(/\s/g, "");
        setPending(true);
        setError(null);
        // With a session, the first valid code is what turns two-step verification on.
        const { error } = await authClient.twoFactor.verifyTotp({ code }).finally(() => setPending(false));
        if (error) setError(error.status && error.status >= 500 ? c.unknownError : t.invalidCode);
        else onVerified();
      }}
    >
      <DialogHeader>
        <DialogTitle className="pr-6">{t.title}</DialogTitle>
        <DialogDescription>{t.scanHelp}</DialogDescription>
      </DialogHeader>
      <FieldGroup className="my-5">
        {/* Dark on white in both themes: scanners read that best. */}
        <div className="w-fit rounded-lg bg-white p-3">
          <QRCodeSVG value={totpURI} size={144} level="M" marginSize={0} />
        </div>
        <Field>
          <FieldLabel htmlFor="tf-secret">{t.setupKey}</FieldLabel>
          <InputGroup>
            <InputGroupInput id="tf-secret" readOnly value={secret.replace(/(.{4})(?=.)/g, "$1 ")} className="font-mono" />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                onClick={async () => {
                  await navigator.clipboard.writeText(secret);
                  setCopied(true);
                }}
              >
                {copied ? t.copied : t.copy}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          <FieldDescription>{t.setupKeyHelp}</FieldDescription>
        </Field>
        <Field>
          <FormLabel htmlFor="tf-code" required>
            {t.code}
          </FormLabel>
          <TotpInput id="tf-code" invalid={!!error} />
          {error && <FieldError>{error}</FieldError>}
        </Field>
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>{c.cancel}</DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? c.inProgress : t.activate}
        </Button>
      </DialogFooter>
    </form>
  );
}

function CodesStep({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const t = useT(messages);
  const [copied, setCopied] = useState(false);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="pr-6">{t.codesTitle}</DialogTitle>
        <DialogDescription>{t.codesHelp}</DialogDescription>
      </DialogHeader>
      <ul className="my-5 grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-xl bg-muted/60 px-5 py-4 font-mono text-sm select-all">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <DialogFooter>
        <Button
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(codes.join("\n"));
            setCopied(true);
          }}
        >
          {copied ? t.copied : t.copy}
        </Button>
        <Button onClick={onDone}>{t.done}</Button>
      </DialogFooter>
    </>
  );
}
