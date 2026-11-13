import { Stack } from "expo-router";
import { tabStackOptions } from "@/lib/navigation";

/** The inbox tab: the list, and the item it opens pushed over it (its place is the link above its title, the bar stays bare). */
export default function Layout() {
  return (
    <Stack screenOptions={tabStackOptions}>
      <Stack.Screen name="[itemId]" options={{ title: "" }} />
    </Stack>
  );
}
