import { Stack } from "expo-router";
import { sheetOptions, tabStackOptions } from "@/lib/navigation";

/** The profile tab: settings, administration and marketplace pushed; their short forms as sheets. */
export default function Layout() {
  return (
    // Without an explicit initial route the stack opens its first declared screen (a sheet), not the profile.
    <Stack screenOptions={tabStackOptions} initialRouteName="index">
      <Stack.Screen name="index" />
      <Stack.Screen name="usage-price" options={sheetOptions([0.75, 1])} />
      <Stack.Screen name="two-factor" options={sheetOptions()} />
      <Stack.Screen name="marketplace/add" options={sheetOptions([0.75, 1])} />
      <Stack.Screen name="marketplace/custom" options={sheetOptions()} />
      <Stack.Screen name="admin/agents/new" options={sheetOptions()} />
      <Stack.Screen name="admin/integrations/[integrationId]" options={sheetOptions()} />
      <Stack.Screen name="admin/memory/vault/secret" options={sheetOptions()} />
      <Stack.Screen name="admin/models/provider" options={sheetOptions()} />
      <Stack.Screen name="admin/models/claude-account" options={sheetOptions()} />
      <Stack.Screen name="admin/models/codex-account" options={sheetOptions()} />
    </Stack>
  );
}
