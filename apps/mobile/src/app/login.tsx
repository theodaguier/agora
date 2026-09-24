import { auth, common } from "@agora/core/i18n";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { Alert, Button, LinkButton } from "heroui-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { View, type TextInput } from "react-native";
import { AuthScreen } from "@/components/auth-screen";
import { KeyIcon, LockIcon, MailIcon } from "@/components/icons";
import { LoginField } from "@/components/login-field";
import { ApiError, signIn, verifyTwoFactor, type Org } from "@/lib/api";
import { publicRequest } from "@/lib/auth-links";
import { withTap } from "@/lib/haptics";
import { defineMessages, tr } from "@/lib/i18n";
import { useServers } from "@/lib/servers";

/* apps/web/src/screens/Login.tsx: same fields, same catalog. */

const setupMessages = defineMessages({
  en: {
    title: "Setup not finished",
    text: "This Agora space hasn't been set up yet. Finish the setup from a web browser, then sign in here.",
    check: "Check again",
  },
  fr: {
    title: "Configuration inachevée",
    text: "Cet espace Agora n'est pas encore configuré. Termine la configuration depuis un navigateur web, puis connecte-toi ici.",
    check: "Vérifier à nouveau",
  },
});

export default function Login() {
  const t = tr(auth);
  const params = useLocalSearchParams<{ url: string; name: string; image?: string }>();
  const org: Org = { url: params.url, name: params.name, image: params.image || null };
  const { save } = useServers();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  // Two-step verification: the challenge of the password step, then the code.
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [backup, setBackup] = useState(false);
  // A fresh instance (no account yet, `/setup` of the web): nobody can sign in before the wizard is done on the web.
  const [needsSetup, setNeedsSetup] = useState(false);
  const checkSetup = useCallback(
    () =>
      publicRequest<{ needed?: boolean }>(org.url, "/setup")
        .then((status) => setNeedsSetup(!!status?.needed))
        .catch(() => {}),
    [org.url],
  );
  useEffect(() => {
    checkSetup();
  }, [checkSetup]);

  const finish = async ({ server, token }: { server: Parameters<typeof save>[0]; token: string }) => {
    await save(server, token);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (router.canDismiss()) router.dismissAll();
    router.replace("/");
  };

  const fail = (err: unknown) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    setError(err instanceof ApiError ? err.message : tr(common).unknownError);
    setPending(false);
  };

  const submit = async () => {
    // Both fields are required, as on the web (where the browser stops the form).
    if (!email.trim() || !password) return;
    setPending(true);
    setError(null);
    try {
      const res = await signIn(org, email, password);
      if ("twoFactor" in res) {
        setChallenge(res.challenge);
        setCode("");
        setPending(false);
      } else await finish(res);
    } catch (err) {
      fail(err);
    }
  };

  const submitCode = async () => {
    const value = code.replace(/\s/g, "");
    if (!challenge || !value) return;
    setPending(true);
    setError(null);
    try {
      await finish(await verifyTwoFactor(org, challenge, value, backup));
    } catch (err) {
      // An expired challenge sends back to the password step.
      if (err instanceof ApiError && err.message === t.expiredChallenge) setChallenge(null);
      fail(err);
    }
  };

  if (challenge)
    return (
      <AuthScreen title={t.twoFactorTitle} hint={backup ? t.backupHint : t.twoFactorHint} logo={{ server: org.url, image: org.image }}>
        <LoginField
          key={backup ? "backup" : "totp"}
          label={backup ? t.backupCode : t.code}
          icon={KeyIcon}
          value={code}
          onChangeText={setCode}
          placeholder={backup ? "xxxxx-xxxxx" : "123456"}
          error={error}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          keyboardType={backup ? "default" : "number-pad"}
          maxLength={backup ? 32 : 6}
          returnKeyType="go"
          onSubmitEditing={submitCode}
        />
        <Button size="lg" isDisabled={pending} onPress={withTap(submitCode)} className="mt-6 w-full">
          {pending ? t.verifying : t.verify}
        </Button>
        <View className="mt-4 items-center gap-3">
          <LinkButton
            onPress={withTap(() => {
              setBackup(!backup);
              setCode("");
              setError(null);
            })}
          >
            {backup ? t.useApp : t.useBackup}
          </LinkButton>
          <LinkButton
            onPress={withTap(() => {
              setChallenge(null);
              setError(null);
            })}
          >
            {t.back}
          </LinkButton>
        </View>
      </AuthScreen>
    );

  if (needsSetup)
    return (
      <AuthScreen title={t.title(org.name)} logo={{ server: org.url, image: org.image }}>
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{setupMessages.title}</Alert.Title>
            <Alert.Description>{setupMessages.text}</Alert.Description>
          </Alert.Content>
        </Alert>
        <Button size="lg" variant="secondary" onPress={checkSetup} className="mt-6 w-full">
          {setupMessages.check}
        </Button>
      </AuthScreen>
    );

  return (
    <AuthScreen title={t.title(org.name)} hint={t.hint} logo={{ server: org.url, image: org.image }}>
      <View className="gap-4">
        <LoginField
          label={t.email}
          icon={MailIcon}
          value={email}
          onChangeText={setEmail}
          placeholder={t.emailPlaceholder}
          invalid={!!error}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <LoginField
          ref={passwordRef}
          label={t.password}
          icon={LockIcon}
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          error={error}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
      </View>
      <Button size="lg" isDisabled={pending} onPress={withTap(submit)} className="mt-6 w-full">
        {pending ? t.signingIn : t.signIn}
      </Button>
      <View className="mt-4 items-center">
        <LinkButton onPress={withTap(() => router.push({ pathname: "/forgot-password", params: { url: org.url, name: org.name, image: org.image ?? "", email } }))}>
          {t.forgot}
        </LinkButton>
      </View>
    </AuthScreen>
  );
}
