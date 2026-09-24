import { common } from "@agora/core/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SettingsScroll, useAdminToast } from "@/components/admin/ui";
import { headerIcon } from "@/components/header-button";
import { refreshTwoFactor, TwoFactorFlow, twoFactorMessages as t, type TwoFactorIntent } from "@/components/two-factor";
import { withTap } from "@/lib/haptics";
import { tr } from "@/lib/i18n";

/* The web's two-step verification dialog (TwoFactor.tsx), as a form sheet over Security. */

export default function TwoFactorScreen() {
  const c = tr(common);
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useAdminToast();
  const param = useLocalSearchParams<{ intent?: string }>().intent;
  const intent: TwoFactorIntent = param === "disable" || param === "codes" ? param : "enable";

  return (
    <>
      <Stack.Screen.Title>{intent === "disable" ? t.offTitle : intent === "codes" ? t.newCodes : t.title}</Stack.Screen.Title>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon={headerIcon.close} iconRenderingMode="template" accessibilityLabel={c.cancel} onPress={withTap(() => router.back())} />
      </Stack.Toolbar>
      <SettingsScroll>
        <TwoFactorFlow
          intent={intent}
          onDone={async () => {
            await refreshTwoFactor(qc);
            if (intent === "enable") toast.success(t.turnedOn);
            else if (intent === "disable") toast.success(t.turnedOff);
            router.back();
          }}
        />
      </SettingsScroll>
    </>
  );
}
