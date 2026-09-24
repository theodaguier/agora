import { common } from "@agora/core/i18n";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { Alert, Button } from "heroui-native";
import { useEffect, useRef, useState } from "react";
import { View, type TextInput } from "react-native";
import { AuthLinkStep } from "@/components/auth-link-step";
import { AuthScreen } from "@/components/auth-screen";
import { LockIcon } from "@/components/icons";
import { LoginField } from "@/components/login-field";
import { ApiError, findOrg, type Org } from "@/lib/api";
import { errorCode, publicRequest, readAuthParams } from "@/lib/auth-links";
import { withTap } from "@/lib/haptics";
import { defineMessages, tr } from "@/lib/i18n";

/* apps/web/src/screens/ResetPassword.tsx: the same Better Auth call (`reset-password`), on the instance named by the link. */

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

/**
 * The reset link received by email (`agora://reset-password?server=…&token=…`, or pasted):
 * the token is enough, no session needed.
 */
export default function ResetPassword() {
  const params = useLocalSearchParams<{ server?: string; token?: string }>();
  const link = readAuthParams(params);
  if (!link) return <AuthLinkStep kind="reset-password" />;
  return <NewPassword key={`${link.server}#${link.token}`} server={link.server} token={link.token} />;
}

function NewPassword({ server, token }: { server: string; token: string }) {
  const t = messages;
  // The organization's logo, and what its sign-in screen needs; the link alone is enough to reset.
  const [org, setOrg] = useState<Org | null>(null);
  const [state, setState] = useState<"form" | "invalid" | "done">("form");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  // Under the field it concerns; the server's other refusals above the button.
  const [error, setError] = useState<{ message: string; on: "password" | "confirm" | "form" } | null>(null);
  const [pending, setPending] = useState(false);
  const confirmRef = useRef<TextInput>(null);

  useEffect(() => {
    findOrg(server)
      .then(setOrg)
      .catch(() => {});
  }, [server]);

  const logo = { server, image: org?.image ?? null };

  const submit = async () => {
    if (!password || !confirm || pending) return;
    if (password !== confirm) return setError({ message: t.mismatch, on: "confirm" });
    setPending(true);
    setError(null);
    try {
      await publicRequest(server, "/auth/reset-password", { method: "POST", body: JSON.stringify({ newPassword: password, token }) });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setState("done");
    } catch (err) {
      // better-auth errors come back in English: map them by code.
      const code = errorCode(err);
      if (code === "INVALID_TOKEN" || code === "USER_NOT_FOUND") setState("invalid");
      else if (code === "PASSWORD_TOO_SHORT") setError({ message: t.tooShort, on: "password" });
      else setError({ message: err instanceof ApiError && err.status === 0 ? err.message : tr(common).unknownError, on: "form" });
    }
    setPending(false);
  };

  if (state !== "form") {
    const done = state === "done";
    const next = () => {
      const params = { url: server, name: org?.name ?? server.replace(/^https?:\/\//, ""), image: org?.image ?? "" };
      router.replace({ pathname: done ? "/login" : "/forgot-password", params });
    };
    return (
      <AuthScreen title={done ? t.doneTitle : t.invalidTitle} hint={done ? t.done : t.invalid} logo={logo}>
        <Button size="lg" onPress={withTap(next)} className="w-full">
          {done ? t.goToLogin : t.requestNew}
        </Button>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen title={t.title} hint={t.hint} logo={logo}>
      <View className="gap-4">
        <LoginField
          label={t.password}
          icon={LockIcon}
          description={t.passwordPlaceholder}
          value={password}
          onChangeText={setPassword}
          error={error?.on === "password" ? error.message : null}
          autoFocus
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => confirmRef.current?.focus()}
        />
        <LoginField
          ref={confirmRef}
          label={t.confirm}
          icon={LockIcon}
          value={confirm}
          onChangeText={setConfirm}
          error={error?.on === "confirm" ? error.message : null}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
      </View>
      {error?.on === "form" && (
        <Alert status="danger" className="mt-4">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{error.message}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      <Button size="lg" isDisabled={pending || !password || !confirm} onPress={submit} className="mt-6 w-full">
        {pending ? t.saving : t.save}
      </Button>
    </AuthScreen>
  );
}
