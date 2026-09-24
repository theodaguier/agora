import { common } from "@agora/core/i18n";
import { router, Stack } from "expo-router";
import { WhatsNew } from "@/components/profile/whats-new";
import { tr } from "@/lib/i18n";
import { CloseIcon } from "@/components/icons";
import { headerIcon } from "@/components/header-button";
import { withTap } from "@/lib/haptics";

/** "What's new", as a sheet: presented once per release (components/announcements.tsx), or from Profile. */
export default function WhatsNewSheet() {
  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon={headerIcon.close} iconRenderingMode="template" accessibilityLabel={tr(common).close} onPress={withTap(() => router.back())} />
      </Stack.Toolbar>
      <WhatsNew />
    </>
  );
}
