import { Description, FieldError, InputGroup, Label, TextField, type InputProps } from "heroui-native";
import { useState, type Ref } from "react";
import { Pressable, type TextInput } from "react-native";
import { Circle, Path } from "react-native-svg";
import { createIcon, EyeIcon, type IconComponent } from "@/components/icons";
import { withTap } from "@/lib/haptics";
import { defineMessages } from "@/lib/i18n";

const t = defineMessages({
  en: { show: "Show password", hide: "Hide password" },
  fr: { show: "Afficher le mot de passe", hide: "Masquer le mot de passe" },
});

/** The house eye, struck through: the password is shown, a tap hides it. */
const EyeOffIcon = createIcon("eye-off", {
  fill: <Path d="M2 12c1.9-4.6 5.6-7.5 10-7.5s8.1 2.9 10 7.5c-1.9 4.6-5.6 7.5-10 7.5S3.9 16.6 2 12z" />,
  cut: (
    <>
      <Circle cx="12" cy="12" r="3.25" strokeWidth={1.5} />
      <Path d="M3.5 3.5l17 17" strokeWidth={4.5} />
    </>
  ),
  line: <Path d="M3.5 3.5l17 17" />,
});

/**
 * A required field of the sign-in screens (apps/web/src/screens/Login.tsx's LoginField), in HeroUI parts:
 * TextField (its `isRequired` puts the asterisk on the Label), Label, an InputGroup (the field's icon as
 * its prefix; for a password, the show/hide button as its suffix, as in HeroUI's input-group example),
 * the Description when given, and the FieldError when given.
 */
export function LoginField({
  label,
  icon: Icon,
  description,
  invalid,
  error,
  ref,
  secureTextEntry,
  ...input
}: InputProps & {
  label: string;
  /** The house icon shown before the value (MailIcon, LockIcon, GlobeIcon…). */
  icon?: IconComponent;
  description?: string;
  invalid?: boolean;
  error?: string | null;
  ref?: Ref<TextInput>;
}) {
  const [visible, setVisible] = useState(false);
  const Toggle = visible ? EyeOffIcon : EyeIcon;
  return (
    <TextField isRequired isInvalid={invalid ?? !!error}>
      <Label>{label}</Label>
      <InputGroup>
        {!!Icon && (
          <InputGroup.Prefix isDecorative>
            <Icon size={16} className="text-field-placeholder" />
          </InputGroup.Prefix>
        )}
        <InputGroup.Input ref={ref as never} secureTextEntry={secureTextEntry && !visible} {...input} />
        {secureTextEntry && (
          <InputGroup.Suffix>
            <Pressable
              onPress={withTap(() => setVisible((v) => !v))}
              hitSlop={20}
              accessibilityRole="button"
              accessibilityLabel={visible ? t.hide : t.show}
            >
              <Toggle size={16} className="text-field-placeholder" />
            </Pressable>
          </InputGroup.Suffix>
        )}
      </InputGroup>
      {!!description && <Description hideOnInvalid>{description}</Description>}
      {error !== undefined && <FieldError>{error}</FieldError>}
    </TextField>
  );
}
