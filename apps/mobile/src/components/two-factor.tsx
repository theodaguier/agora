import { auth, common } from "@agora/core/i18n";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { Button, Description, FieldError, Input, InputOTP, Label, LinkButton, Surface, TextField, Typography } from "heroui-native";
import { useState } from "react";
import { Linking, Share, View } from "react-native";
import { SecretInput, useAdminToast } from "@/components/admin/ui";
import { AuthScreen } from "@/components/auth-screen";
import { useSignOut } from "@/components/profile/organizations";
import { useServer } from "@/components/server-scope";
import { ApiError, api } from "@/lib/api";
import { orgQuery } from "@/lib/agents-admin";
import { haptic, withTap } from "@/lib/haptics";
import { defineMessages, tr } from "@/lib/i18n";
import { sessionQuery } from "@/lib/queries";

/* apps/web/src/components/TwoFactor.tsx and apps/web/src/screens/TwoFactorRequired.tsx. */

export const twoFactorMessages = defineMessages({
  en: {
    title: "Two-step verification",
    offHelp: "Ask for a code from an authenticator app (1Password, Google Authenticator…) after your password.",
    onHelp: "On: a code from your authenticator app is asked after your password.",
    requiredHelp: "On, and required by your organization: a code from your authenticator app is asked after your password.",
    on: "On",
    off: "Off",
    turnOn: "Turn on",
    turnOff: "Turn off",
    newCodes: "New backup codes",
    password: "Password",
    passwordHelp: "Confirm it's you.",
    wrongPassword: "Incorrect password.",
    continue: "Continue",
    scanHelp: "Add the account to your authenticator app, then enter the 6-digit code it shows.",
    openApp: "Open in the authenticator app",
    noApp: "No authenticator app found on this phone.",
    setupKey: "Setup key",
    setupKeyHelp: "To enter in the app by hand if it didn't open.",
    code: "Verification code",
    invalidCode: "Incorrect code. Check your phone's time and try again.",
    activate: "Turn on",
    codesTitle: "Save your backup codes",
    codesHelp: "Each one lets you sign in once without your phone. They won't be shown again: keep them somewhere safe.",
    copy: "Copy",
    copied: "Copied",
    share: "Share",
    done: "Done",
    offTitle: "Turn off two-step verification?",
    offDescription: "Your password alone will be enough to sign in again, and your backup codes will stop working.",
    newCodesTitle: "Create new backup codes?",
    newCodesDescription: "Your current backup codes will stop working.",
    create: "Create",
    turnedOn: "Two-step verification on",
    turnedOff: "Two-step verification off",
    requiredTitle: "Turn on two-step verification",
    requiredText: (org: string) => `${org} requires it for every account. You'll need an authenticator app (1Password, Google Authenticator…).`,
  },
  fr: {
    title: "Validation en deux étapes",
    offHelp: "Demande un code d'une application d'authentification (1Password, Google Authenticator…) après ton mot de passe.",
    onHelp: "Activée : un code de ton application d'authentification est demandé après ton mot de passe.",
    requiredHelp: "Activée et exigée par ton organisation : un code de ton application d'authentification est demandé après ton mot de passe.",
    on: "Activée",
    off: "Désactivée",
    turnOn: "Activer",
    turnOff: "Désactiver",
    newCodes: "Nouveaux codes de secours",
    password: "Mot de passe",
    passwordHelp: "Confirme que c'est bien toi.",
    wrongPassword: "Mot de passe incorrect.",
    continue: "Continuer",
    scanHelp: "Ajoute le compte dans ton application d'authentification, puis saisis le code à 6 chiffres qu'elle affiche.",
    openApp: "Ouvrir dans l'app d'authentification",
    noApp: "Aucune application d'authentification trouvée sur ce téléphone.",
    setupKey: "Clé de configuration",
    setupKeyHelp: "À saisir à la main dans l'application si elle ne s'est pas ouverte.",
    code: "Code de vérification",
    invalidCode: "Code incorrect. Vérifie l'heure de ton téléphone et réessaie.",
    activate: "Activer",
    codesTitle: "Enregistre tes codes de secours",
    codesHelp: "Chacun permet de te connecter une fois sans ton téléphone. Ils ne seront plus affichés : garde-les en lieu sûr.",
    copy: "Copier",
    copied: "Copié",
    share: "Partager",
    done: "Terminé",
    offTitle: "Désactiver la validation en deux étapes ?",
    offDescription: "Ton mot de passe suffira de nouveau pour te connecter, et tes codes de secours ne fonctionneront plus.",
    newCodesTitle: "Créer de nouveaux codes de secours ?",
    newCodesDescription: "Tes codes de secours actuels ne fonctionneront plus.",
    create: "Créer",
    turnedOn: "Validation en deux étapes activée",
    turnedOff: "Validation en deux étapes désactivée",
    requiredTitle: "Active la validation en deux étapes",
    requiredText: (org: string) => `${org} l'exige pour tous les comptes. Il te faut une application d'authentification (1Password, Google Authenticator…).`,
  },
});

const t = twoFactorMessages;

/** What the password step is for. */
export type TwoFactorIntent = "enable" | "disable" | "codes";

type Step = { kind: "password" } | { kind: "scan"; totpURI: string; backupCodes: string[] } | { kind: "codes"; backupCodes: string[] };

/** Better Auth's answers: a wrong password is a 400/401, anything else is unexpected. */
const passwordError = (err: unknown) => (err instanceof ApiError && (err.status === 400 || err.status === 401) ? t.wrongPassword : tr(common).unknownError);

/** The session (twoFactorEnabled) after a change, before leaving the flow. */
export const refreshTwoFactor = (qc: ReturnType<typeof useQueryClient>) => qc.refetchQueries({ queryKey: sessionQuery.queryKey });

/**
 * Password, then the account added to the authenticator app and its first code, then the backup
 * codes (turning on); the password alone to turn off or to get new backup codes. `onDone` when finished.
 */
export function TwoFactorFlow({ intent, onDone }: { intent: TwoFactorIntent; onDone: () => void }) {
  const [step, setStep] = useState<Step>({ kind: "password" });
  if (step.kind === "scan") return <ScanStep totpURI={step.totpURI} onVerified={() => setStep({ kind: "codes", backupCodes: step.backupCodes })} />;
  if (step.kind === "codes") return <CodesStep codes={step.backupCodes} onDone={onDone} />;
  return <PasswordStep intent={intent} onNext={setStep} onDone={onDone} />;
}

function PasswordStep({ intent, onNext, onDone }: { intent: TwoFactorIntent; onNext: (step: Step) => void; onDone: () => void }) {
  const c = tr(common);
  const org = useQuery(orgQuery).data;
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (!password || pending) return;
    setPending(true);
    setError(null);
    try {
      if (intent === "enable") {
        const res = await api<{ totpURI: string; backupCodes: string[] }>("/auth/two-factor/enable", {
          method: "POST",
          body: JSON.stringify({ password, issuer: org?.name ?? "Agora" }),
        });
        onNext({ kind: "scan", totpURI: res.totpURI, backupCodes: res.backupCodes ?? [] });
      } else if (intent === "codes") {
        const res = await api<{ backupCodes: string[] }>("/auth/two-factor/generate-backup-codes", { method: "POST", body: JSON.stringify({ password }) });
        onNext({ kind: "codes", backupCodes: res.backupCodes ?? [] });
      } else {
        await api("/auth/two-factor/disable", { method: "POST", body: JSON.stringify({ password }) });
        haptic.success();
        onDone();
      }
    } catch (err) {
      haptic.error();
      setError(passwordError(err));
      setPending(false);
    }
  };

  return (
    <View className="gap-6">
      <TextField isRequired isInvalid={!!error} isDisabled={pending}>
        <Label>{t.password}</Label>
        <SecretInput value={password} onChangeText={setPassword} autoFocus autoComplete="current-password" textContentType="password" returnKeyType="go" onSubmitEditing={submit} />
        {error ? <FieldError>{error}</FieldError> : <Description>{t.passwordHelp}</Description>}
      </TextField>
      <Button variant={intent === "disable" ? "danger" : "primary"} isDisabled={!password || pending} onPress={withTap(submit)}>
        {pending ? c.inProgress : intent === "disable" ? t.turnOff : t.continue}
      </Button>
    </View>
  );
}

/** The secret of an otpauth:// address (RN's URL only parses http(s)). */
const secretOf = (totpURI: string) => decodeURIComponent(/[?&]secret=([^&]+)/.exec(totpURI)?.[1] ?? "");

function ScanStep({ totpURI, onVerified }: { totpURI: string; onVerified: () => void }) {
  const c = tr(common);
  const toast = useAdminToast();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const secret = secretOf(totpURI);

  const verify = async (value = code) => {
    if (value.length !== 6 || pending) return;
    setPending(true);
    setError(null);
    try {
      // With a session, the first valid code is what turns two-step verification on.
      await api("/auth/two-factor/verify-totp", { method: "POST", body: JSON.stringify({ code: value }) });
      haptic.success();
      onVerified();
    } catch (err) {
      haptic.error();
      setError(err instanceof ApiError && err.status >= 500 ? c.unknownError : t.invalidCode);
      setCode("");
      setPending(false);
    }
  };

  return (
    <View className="gap-6">
      <Typography.Paragraph color="muted">{t.scanHelp}</Typography.Paragraph>
      <Button variant="secondary" onPress={withTap(() => Linking.openURL(totpURI).catch(() => toast.info(t.noApp)))}>
        {t.openApp}
      </Button>
      <TextField>
        <Label>{t.setupKey}</Label>
        <Input value={secret.replace(/(.{4})(?=.)/g, "$1 ")} editable={false} selectTextOnFocus />
        <Description>{t.setupKeyHelp}</Description>
      </TextField>
      <Button
        size="sm"
        variant="tertiary"
        className="self-start"
        onPress={async () => {
          await Clipboard.setStringAsync(secret);
          toast.success(t.copied);
        }}
      >
        {t.copy}
      </Button>
      <View className="gap-2">
        <Label isRequired isInvalid={!!error}>
          {t.code}
        </Label>
        <InputOTP value={code} onChange={setCode} maxLength={6} isInvalid={!!error} isDisabled={pending} onComplete={verify} textInputProps={{ textContentType: "oneTimeCode" }}>
          <InputOTP.Group>
            <InputOTP.Slot index={0} />
            <InputOTP.Slot index={1} />
            <InputOTP.Slot index={2} />
          </InputOTP.Group>
          <InputOTP.Separator />
          <InputOTP.Group>
            <InputOTP.Slot index={3} />
            <InputOTP.Slot index={4} />
            <InputOTP.Slot index={5} />
          </InputOTP.Group>
        </InputOTP>
        <FieldError isInvalid={!!error}>{error}</FieldError>
      </View>
      <Button isDisabled={code.length !== 6 || pending} onPress={withTap(() => verify())}>
        {pending ? c.inProgress : t.activate}
      </Button>
    </View>
  );
}

function CodesStep({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const toast = useAdminToast();
  const text = codes.join("\n");
  return (
    <View className="gap-6">
      <View className="gap-1.5">
        <Typography.Heading type="h4">{t.codesTitle}</Typography.Heading>
        <Typography.Paragraph color="muted">{t.codesHelp}</Typography.Paragraph>
      </View>
      <Surface variant="secondary" className="flex-row flex-wrap gap-y-2">
        {codes.map((code) => (
          <View key={code} className="w-1/2">
            <Typography.Code selectable>{code}</Typography.Code>
          </View>
        ))}
      </Surface>
      <View className="flex-row gap-3">
        <Button
          variant="secondary"
          className="flex-1"
          onPress={async () => {
            await Clipboard.setStringAsync(text);
            toast.success(t.copied);
          }}
        >
          {t.copy}
        </Button>
        <Button variant="secondary" className="flex-1" onPress={withTap(() => Share.share({ message: text }))}>
          {t.share}
        </Button>
      </View>
      <Button onPress={withTap(onDone)}>{t.done}</Button>
    </View>
  );
}

/** The organization requires two-step verification and this account doesn't have it yet. */
export function useTwoFactorRequired() {
  const session = useQuery(sessionQuery).data;
  const org = useQuery(orgQuery).data;
  return !!org?.requireTwoFactor && !!session && !session.twoFactorEnabled;
}

/** Instead of the app while two-step verification is required and off (the web's /two-factor screen). */
export function TwoFactorRequired() {
  const server = useServer();
  const qc = useQueryClient();
  const org = useQuery(orgQuery).data;
  const signOut = useSignOut();
  const [started, setStarted] = useState(false);

  return (
    <AuthScreen
      title={t.requiredTitle}
      hint={started ? null : t.requiredText(org?.name ?? server.orgName)}
      logo={{ server: server.url, image: org?.image ?? null }}
    >
      {started ? (
        <TwoFactorFlow intent="enable" onDone={() => void refreshTwoFactor(qc)} />
      ) : (
        <>
          <Button size="lg" className="w-full" onPress={withTap(() => setStarted(true))}>
            {t.turnOn}
          </Button>
          <View className="mt-4 items-center">
            <LinkButton onPress={withTap(() => signOut(server))}>{tr(auth).signOut}</LinkButton>
          </View>
        </>
      )}
    </AuthScreen>
  );
}
