import { common } from "@agora/core/i18n";
import * as Haptics from "expo-haptics";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Alert, Button, LinkButton } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { AuthScreen } from "@/components/auth-screen";
import { MailIcon } from "@/components/icons";
import { LoginField } from "@/components/login-field";
import { withTap } from "@/lib/haptics";
import { defineMessages, locale, tr } from "@/lib/i18n";

/* apps/web/src/screens/ForgotPassword.tsx: same request, sent to the organization's instance. */

const messages = defineMessages({
  en: {
    title: "Forgot your password?",
    hint: "Enter your account's email: we'll send you a link to choose a new one.",
    email: "Email",
    emailPlaceholder: "name@example.com",
    sending: "Sending…",
    send: "Send the link",
    tooMany: "Too many requests. Try again in a minute.",
    unreachable: "Couldn't reach the server. Check your connection.",
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
    unreachable: "Impossible de joindre le serveur. Vérifie ta connexion.",
    sentTitle: "Consulte ta boîte mail",
    sent: (email: string) => `Si un compte existe pour ${email}, un lien pour réinitialiser ton mot de passe vient d'être envoyé. Il est valable une heure.`,
    backToLogin: "Retour à la connexion",
  },
});

/**
 * Asks the instance for a reset link (Better Auth's `request-password-reset`, what the web's
 * authClient calls). The answer is the same whether the address has an account or not; the
 * link in the email opens the web app, where the new password is chosen.
 */
/** Asks the instance for a reset link: what came of it, as the key of the message to show. */
async function requestReset(server: string, email: string): Promise<"sent" | "tooMany" | "unknownError" | "unreachable"> {
  try {
    const res = await fetch(`${server}/api/auth/request-password-reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Agora-Locale": locale },
      body: JSON.stringify({ email }),
    });
    if (res.ok) return "sent";
    return res.status === 429 ? "tooMany" : "unknownError";
  } catch {
    return "unreachable";
  }
}

export default function ForgotPassword() {
  const t = { ...messages, unknownError: tr(common).unknownError };
  const params = useLocalSearchParams<{ url: string; name?: string; image?: string; email?: string }>();
  const [email, setEmail] = useState(params.email ?? "");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const logo = { server: params.url, image: params.image || null };

  const submit = async () => {
    const address = email.trim();
    if (!address) return;
    setPending(true);
    setError(null);
    const outcome = await requestReset(params.url, address);
    setPending(false);
    if (outcome !== "sent") return setError(t[outcome]);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSentTo(address);
  };

  const header = <Stack.Screen options={{ headerShown: true, headerTransparent: true, title: "", headerBackButtonDisplayMode: "minimal" }} />;

  if (sentTo)
    return (
      <>
        {header}
        <AuthScreen title={t.sentTitle} hint={t.sent(sentTo)} logo={logo}>
          <Button size="lg" variant="secondary" onPress={withTap(() => router.back())} className="w-full">
            {t.backToLogin}
          </Button>
        </AuthScreen>
      </>
    );

  return (
    <>
      {header}
      <AuthScreen title={t.title} hint={t.hint} logo={logo}>
        <LoginField
          label={t.email}
          icon={MailIcon}
          value={email}
          onChangeText={setEmail}
          placeholder={t.emailPlaceholder}
          autoFocus={!email}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
          returnKeyType="send"
          onSubmitEditing={submit}
        />
        {/* Not the address's fault: the server refused or couldn't be reached. */}
        {!!error && (
          <Alert status="danger" className="mt-4">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{error}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}
        <Button size="lg" isDisabled={pending || !email.trim()} onPress={submit} className="mt-6 w-full">
          {pending ? t.sending : t.send}
        </Button>
        <View className="mt-4 items-center">
          <LinkButton onPress={withTap(() => router.back())}>{t.backToLogin}</LinkButton>
        </View>
      </AuthScreen>
    </>
  );
}
