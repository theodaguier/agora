import { common } from "@agora/core/i18n";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Alert, BottomSheet, Button, Description, FieldError, Input, Label, Radio, RadioGroup, TextField, useBottomSheetAwareHandlers } from "heroui-native";
import { useState } from "react";
import { Share, View } from "react-native";
import { useAdminToast } from "@/components/admin/ui";
import { tr } from "@/lib/i18n";
import type { InvitationSent } from "@/lib/admin";
import { withTap } from "@/lib/haptics";
import { usersMessages } from "@/components/admin/users-messages";

/* apps/web/src/components/admin/Users.tsx: shared parts of the users screens. */

export type Access = "user" | "admin";

/** App access (admin/member), each with its help; not to be confused with the profile's free-text role. */
export function AccessChoice({ value, onChange, disabled }: { value: Access; onChange: (v: Access) => void; disabled?: boolean }) {
  const t = usersMessages;
  const access = [
    { value: "user" as const, label: t.member, help: t.memberHelp },
    { value: "admin" as const, label: t.admin, help: t.adminHelp },
  ];
  return (
    <RadioGroup value={value} onValueChange={(v) => onChange(v === "admin" ? "admin" : "user")} isDisabled={disabled} className="gap-4">
      {access.map((a) => (
        <RadioGroup.Item key={a.value} value={a.value} className="items-start">
          <View className="flex-1 gap-0.5">
            <Label>{a.label}</Label>
            <Description>{a.help}</Description>
          </View>
          <Radio />
        </RadioGroup.Item>
      ))}
    </RadioGroup>
  );
}

/** Invitation form in a sheet: address and access; the invitee fills in the rest of the profile. */
export function InviteSheet(props: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onInvite: (body: { email: string; role: Access }) => Promise<unknown>;
  pending: boolean;
  error: unknown;
}) {
  return (
    <BottomSheet isOpen={props.isOpen} onOpenChange={props.onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content keyboardBehavior="extend">
          {/* Mounted with the sheet: a fresh form on each opening. */}
          {props.isOpen && <InviteForm {...props} />}
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

function InviteForm(props: { onInvite: (body: { email: string; role: Access }) => Promise<unknown>; pending: boolean; error: unknown }) {
  const t = usersMessages;
  const { onFocus, onBlur } = useBottomSheetAwareHandlers();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Access>("user");
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const submit = () => valid && !props.pending && props.onInvite({ email: email.trim(), role }).catch(() => {});
  return (
    <View className="gap-5 pb-4">
      <BottomSheet.Title>{t.inviteLegend}</BottomSheet.Title>
      <TextField isRequired isInvalid={!!props.error}>
        <Label>{t.email}</Label>
        <Input
          value={email}
          onChangeText={setEmail}
          placeholder={t.emailPlaceholder}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          autoFocus
          returnKeyType="send"
          onSubmitEditing={submit}
          onFocus={onFocus}
          onBlur={onBlur} />
        <FieldError>{props.error instanceof Error ? props.error.message : tr(common).unknownError}</FieldError>
      </TextField>
      <View className="gap-2">
        <Label isRequired>{t.access}</Label>
        <AccessChoice value={role} onChange={setRole} />
      </View>
      <Button isDisabled={!valid || props.pending} onPress={withTap(submit)}>
        {props.pending ? t.sending : t.invite}
      </Button>
    </View>
  );
}

/** An invitation the server couldn't email (no email set up, or a failure): the link to pass on yourself. */
export function SentNotice({ result, email }: { result: InvitationSent; email: string }) {
  const t = usersMessages;
  const toast = useAdminToast();
  const link = result.link ?? "";
  return (
    <Alert status="warning">
      <Alert.Indicator />
      <Alert.Content className="gap-2">
        <Alert.Title>{result.error ?? t.mailOff}</Alert.Title>
        <Alert.Description>{t.passLink(email)}</Alert.Description>
        <Alert.Description selectable>{link}</Alert.Description>
        <View className="flex-row gap-2 pt-1">
          <Button
            size="sm"
            variant="secondary"
            onPress={async () => {
              await Clipboard.setStringAsync(link);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              toast.success(t.copied);
            }}
          >
            {t.copy}
          </Button>
          <Button size="sm" variant="secondary" onPress={withTap(() => Share.share({ url: link, message: link }))}>
            {t.share}
          </Button>
        </View>
      </Alert.Content>
    </Alert>
  );
}
