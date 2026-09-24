import { common } from "@agora/core/i18n";
import { router } from "expo-router";
import { Button, Separator, Typography } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { AuthScreen } from "@/components/auth-screen";
import { LoginField } from "@/components/login-field";
import { GlobeIcon } from "@/components/icons";
import { findOrg } from "@/lib/api";
import { withTap } from "@/lib/haptics";
import { defineMessages, tr } from "@/lib/i18n";

const messages = defineMessages({
  en: {
    title: "Sign in to your organization",
    hint: "Enter the address of your Agora space.",
    address: "Server address",
    placeholder: "agora.example.com",
    checking: "Checking…",
    scan: "Scan a QR code",
    invitation: "I have an invitation",
    or: "or",
  },
  fr: {
    title: "Connexion à ton organisation",
    hint: "Saisis l'adresse de ton espace Agora.",
    address: "Adresse du serveur",
    placeholder: "agora.exemple.com",
    checking: "Vérification…",
    scan: "Scanner un QR code",
    invitation: "J'ai une invitation",
    or: "ou",
  },
});

/** First step without a QR code: which instance. Then the login screen, as on the web. */
export default function ServerStep() {
  const t = { ...messages, continue: tr(common).continue };
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (!address.trim()) return;
    setPending(true);
    setError(null);
    await findOrg(address)
      .then(
        (org) => router.push({ pathname: "/login", params: { url: org.url, name: org.name, image: org.image ?? "" } }),
        (err) => setError(err instanceof Error ? err.message : String(err)),
      )
      .finally(() => setPending(false));
  };

  return (
    <AuthScreen
      title={t.title}
      hint={t.hint}
      footer={
        <View className="gap-3">
          <View className="flex-row items-center gap-3">
            <Separator className="flex-1" />
            <Typography.Paragraph type="body-sm" color="muted">
              {t.or}
            </Typography.Paragraph>
            <Separator className="flex-1" />
          </View>
          <Button size="lg" variant="secondary" onPress={withTap(() => router.push("/scan"))} className="w-full">
            {t.scan}
          </Button>
          <Button size="lg" variant="ghost" onPress={withTap(() => router.push("/invite"))} className="w-full">
            {t.invitation}
          </Button>
        </View>
      }
    >
      <LoginField
        label={t.address}
        icon={GlobeIcon}
        value={address}
        onChangeText={setAddress}
        placeholder={t.placeholder}
        error={error}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        textContentType="URL"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button size="lg" isDisabled={pending || !address.trim()} onPress={withTap(submit)} className="mt-6 w-full">
        {pending ? t.checking : t.continue}
      </Button>
    </AuthScreen>
  );
}
