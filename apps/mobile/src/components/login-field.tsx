import { type InputProps } from "heroui-native";
import { type Ref } from "react";
import { type TextInput } from "react-native";
import { FormField, FormInput, SecretInput } from "@/components/admin/ui";
import { defineMessages } from "@/lib/i18n";

const t = defineMessages({
  en: { show: "Show password", hide: "Hide password" },
  fr: { show: "Afficher le mot de passe", hide: "Masquer le mot de passe" },
});

/**
 * A required field of the sign-in screens (apps/web/src/screens/Login.tsx's LoginField), as an iOS
 * form group: its name (with the asterisk) above the white card that holds the bare field, then its
 * error in red or its description in grey. A password gets the show/hide button of SecretInput.
 */
export function LoginField({
  label,
  description,
  invalid,
  error,
  ref,
  secureTextEntry,
  ...input
}: InputProps & {
  label: string;
  description?: string;
  invalid?: boolean;
  error?: string | null;
  ref?: Ref<TextInput>;
}) {
  return (
    <FormField label={label} required invalid={invalid ?? !!error} error={error} help={description}>
      {secureTextEntry ? (
        <SecretInput ref={ref as never} showLabel={t.show} hideLabel={t.hide} {...input} />
      ) : (
        <FormInput ref={ref as never} {...input} />
      )}
    </FormField>
  );
}
