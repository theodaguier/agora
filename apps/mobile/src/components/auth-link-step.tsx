import { common } from "@agora/core/i18n";
import { router } from "expo-router";
import { Button } from "heroui-native";
import { useState } from "react";
import { AuthScreen } from "@/components/auth-screen";
import { GlobeIcon } from "@/components/icons";
import { LoginField } from "@/components/login-field";
import { parseAuthLink, type AuthLinkKind } from "@/lib/auth-links";
import { withTap } from "@/lib/haptics";
import { defineMessages, tr } from "@/lib/i18n";

const messages = defineMessages({
  en: {
    invite: { title: "Join with an invitation", hint: "Paste the invitation link received by email.", label: "Invitation link" },
    "reset-password": { title: "Choose a new password", hint: "Paste the link received by email.", label: "Reset link" },
    placeholder: "https://agora.example.com/…",
    invalid: "This isn't an Agora link. Copy the whole link from the email.",
  },
  fr: {
    invite: { title: "Rejoindre avec une invitation", hint: "Colle le lien d'invitation reçu par email.", label: "Lien d'invitation" },
    "reset-password": { title: "Choisis un nouveau mot de passe", hint: "Colle le lien reçu par email.", label: "Lien de réinitialisation" },
    placeholder: "https://agora.exemple.com/…",
    invalid: "Ce n'est pas un lien Agora. Copie le lien complet depuis l'email.",
  },
});

/**
 * /invite or /reset-password opened without a link: the one received by email is pasted here.
 * Either kind is accepted, and opens its own screen.
 */
export function AuthLinkStep({ kind }: { kind: AuthLinkKind }) {
  const t = messages;
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!value.trim()) return;
    const link = parseAuthLink(value);
    if (!link) return setError(t.invalid);
    const params = { server: link.server, token: link.token };
    if (link.kind === kind) router.setParams(params);
    else router.replace({ pathname: link.kind === "invite" ? "/invite" : "/reset-password", params });
  };

  return (
    <AuthScreen title={t[kind].title} hint={t[kind].hint}>
      <LoginField
        label={t[kind].label}
        icon={GlobeIcon}
        value={value}
        onChangeText={(text) => {
          setValue(text);
          setError(null);
        }}
        placeholder={t.placeholder}
        error={error}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        textContentType="URL"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button size="lg" isDisabled={!value.trim()} onPress={withTap(submit)} className="mt-6 w-full">
        {tr(common).continue}
      </Button>
    </AuthScreen>
  );
}
