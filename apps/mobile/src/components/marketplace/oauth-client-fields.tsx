import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Alert, Button, ControlField, Description, Input, InputGroup, Label, TextField, useToast } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { defineMessages } from "@/lib/i18n";
import { OAuthClientValue } from "@/components/marketplace/oauth-client";

/* apps/web/src/components/marketplace/OAuthClientFields.tsx */

const t = defineMessages({
  en: {
    toggle: "Use my own OAuth client",
    intro: "For services that don't let apps register themselves (GitHub, Google, Slack…): create an OAuth app in the service, declare this redirect address in it, then paste its identifiers.",
    redirect: "Redirect address",
    copy: "Copy",
    copied: "Copied",
    clientId: "Client ID",
    clientSecret: "Client secret",
    secretHelp: "Stored only in Hermes's .env.",
    scope: "Scopes",
    scopeHelp: "Separated by spaces. Leave empty to use the service's defaults.",
    needsClient: "This service doesn't accept automatic registration: fill in your own OAuth client below.",
  },
  fr: {
    toggle: "Utiliser mon propre client OAuth",
    intro: "Pour les services qui n'acceptent pas l'enregistrement automatique (GitHub, Google, Slack…) : crée une application OAuth dans le service, déclares-y cette adresse de redirection, puis colle ses identifiants.",
    redirect: "Adresse de redirection",
    copy: "Copier",
    copied: "Copiée",
    clientId: "Client ID",
    clientSecret: "Client secret",
    secretHelp: "Stocké uniquement dans le .env de Hermes.",
    scope: "Scopes",
    scopeHelp: "Séparés par des espaces. Laisse vide pour ceux du service.",
    needsClient: "Ce service n'accepte pas l'enregistrement automatique : renseigne ton propre client OAuth ci-dessous.",
  },
});

const mono = { autoCapitalize: "none", autoCorrect: false, autoComplete: "off", spellCheck: false } as const;

/**
 * Pre-registered OAuth client, off by default: most MCP servers register Hermes on their own;
 * the others need an app created by hand in the service.
 */
export function OAuthClientFields(props: {
  redirectUri: string;
  value: OAuthClientValue;
  onChange: (value: OAuthClientValue) => void;
  /** Shown, with an explanation, after the service refused automatic registration. */
  required?: boolean;
  disabled?: boolean;
}) {
  const [on, setOn] = useState(false);
  const { toast } = useToast();
  const shown = on || !!props.required;
  const set = (patch: Partial<OAuthClientValue>) => props.onChange({ ...props.value, ...patch });
  const toggle = (next: boolean) => {
    Haptics.selectionAsync();
    setOn(next);
  };

  const copy = () =>
    Clipboard.setStringAsync(props.redirectUri).then(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show({ variant: "success", label: t.copied, description: t.redirect });
    });

  return (
    <View className="gap-4">
      {!props.required && (
        <ControlField
          isSelected={on}
          isDisabled={props.disabled}
          onSelectedChange={toggle}
          accessibilityRole="switch"
          accessibilityState={{ checked: on, disabled: props.disabled }}
        >
          <View className="flex-1">
            <Label>{t.toggle}</Label>
          </View>
          <ControlField.Indicator />
        </ControlField>
      )}
      {shown && (
        <>
          {props.required ? (
            <Alert status="warning">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>{t.needsClient}</Alert.Description>
              </Alert.Content>
            </Alert>
          ) : (
            <Description>{t.intro}</Description>
          )}
          <TextField>
            <Label>{t.redirect}</Label>
            <InputGroup>
              <InputGroup.Input value={props.redirectUri} editable={false} selectTextOnFocus {...mono} />
              <InputGroup.Suffix>
                <Button variant="ghost" size="sm" onPress={copy}>
                  {t.copy}
                </Button>
              </InputGroup.Suffix>
            </InputGroup>
          </TextField>
          <TextField isRequired={props.required} isDisabled={props.disabled}>
            <Label>{t.clientId}</Label>
            <Input value={props.value.client_id} onChangeText={(v) => set({ client_id: v })} {...mono} />
          </TextField>
          <TextField isDisabled={props.disabled}>
            <Label>{t.clientSecret}</Label>
            <Input value={props.value.client_secret} onChangeText={(v) => set({ client_secret: v })} secureTextEntry {...mono} />
            <Description>{t.secretHelp}</Description>
          </TextField>
          <TextField isDisabled={props.disabled}>
            <Label>{t.scope}</Label>
            <Input value={props.value.scope} onChangeText={(v) => set({ scope: v })} {...mono} />
            <Description>{t.scopeHelp}</Description>
          </TextField>
        </>
      )}
    </View>
  );
}
