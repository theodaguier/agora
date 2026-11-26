import { Stack } from "expo-router";
import { tabStackOptions } from "@/lib/navigation";

export default function Layout() {
  // Without an explicit initial route the stack would open its first declared screen.
  return <Stack screenOptions={tabStackOptions} initialRouteName="index" />;
}
