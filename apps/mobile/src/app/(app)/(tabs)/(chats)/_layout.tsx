import { Stack } from "expo-router";
import { tabStackOptions } from "@/lib/navigation";

export default function Layout() {
  return (
    // Without an explicit initial route the stack would open its first declared screen.
    <Stack screenOptions={tabStackOptions} initialRouteName="index">
      <Stack.Screen name="index" />
      {/* The simple interface's history (components/simple): slides in from the left, like ChatGPT's menu. */}
      <Stack.Screen name="history" options={{ animation: "slide_from_left" }} />
    </Stack>
  );
}
