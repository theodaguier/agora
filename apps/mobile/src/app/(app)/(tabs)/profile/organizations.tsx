import { router, Stack } from "expo-router";
import { Intro, SettingsScroll } from "@/components/admin/ui";
import { headerIcon } from "@/components/header-button";
import { Organizations } from "@/components/profile/organizations";
import { organizationsMessages as t } from "@/components/profile/organizations-messages";
import { withTap } from "@/lib/haptics";

/** The organizations this phone is signed in to (was the `servers` sheet); "+" adds one. */
export default function OrganizationsScreen() {
  return (
    <>
      <Stack.Screen.Title>{t.organizations}</Stack.Screen.Title>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon={headerIcon.plus} iconRenderingMode="template" accessibilityLabel={t.add} onPress={withTap(() => router.push("/server"))} />
      </Stack.Toolbar>
      <SettingsScroll>
        <Intro>{t.help}</Intro>
        <Organizations />
      </SettingsScroll>
    </>
  );
}
