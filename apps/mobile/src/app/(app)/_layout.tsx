import { Redirect, Stack } from "expo-router";
import { Announcements } from "@/components/announcements";
import { ConfirmHost } from "@/components/confirm-dialog";
import { useMe } from "@/components/server-scope";
import { usePushNotifications } from "@/lib/notifications";
import { useEvents } from "@/lib/realtime";
import { sheetOptions } from "@/lib/navigation";
import { useServers } from "@/lib/servers";

/**
 * The signed-in screens of the current organization (its ServerScope is in the root layout):
 * the tabs, and above them the screens that take the whole screen (a conversation) or come up as sheets.
 */
export default function AppLayout() {
  const { current } = useServers();
  if (!current) return <Redirect href="/server" />;
  return (
    <>
      <Realtime />
      <Announcements />
      <Stack screenOptions={{ headerBackButtonDisplayMode: "minimal" }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {/* Reached from anywhere: pushed over the tabs, "back" returns where you were. */}
        <Stack.Screen name="c/[conversationId]" />
        <Stack.Screen name="agents/[agentId]" />
        <Stack.Screen name="people/[userId]" />
        <Stack.Screen name="info/[conversationId]" />
        {/* One short job each: a sheet over the current screen, closed before going anywhere else. */}
        <Stack.Screen name="new" options={sheetOptions()} />
        <Stack.Screen name="task/[taskId]" options={sheetOptions([0.75, 1])} />
        <Stack.Screen name="task/new" options={sheetOptions([0.6, 1])} />
        <Stack.Screen name="agents/[agentId]/routines/[routineId]" options={sheetOptions([0.75, 1])} />
        <Stack.Screen name="info/[conversationId]/add" options={sheetOptions([0.6, 1])} />
        <Stack.Screen name="whats-new" options={sheetOptions()} />
        <Stack.Screen name="digest" options={sheetOptions()} />
      </Stack>
      <ConfirmHost />
    </>
  );
}

/** One SSE stream for the instance while the app is open (AppShell's useEvents on the web). */
function Realtime() {
  useEvents(useMe().id);
  usePushNotifications();
  return null;
}
