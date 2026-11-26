import { Drawer } from "expo-router/drawer";
import { useWindowDimensions } from "react-native";
import { useCSSVariable } from "uniwind";
import { Sidebar } from "@/components/drawer";

/*
 * Figma « Mobile — ChatGPT 1:1 (26 nov.) »: the app's sections without a tab bar. A drawer, as ChatGPT's,
 * slides in from the left and pushes the screen aside (components/drawer.tsx holds its content). Its
 * screens are the home (the open conversation), the inbox, the tasks, the code sessions and the
 * settings; each keeps its own stack, whose first screen carries the menu button (MenuButton).
 * The folder keeps its name, (tabs): route groups are not part of the URLs.
 */
export default function DrawerLayout() {
  const { width } = useWindowDimensions();
  const background = useCSSVariable("--color-background") as string;
  return (
    <Drawer
      drawerContent={(props) => <Sidebar {...props} />}
      screenOptions={{
        headerShown: false,
        drawerType: "slide",
        drawerStyle: { width: Math.min(330, Math.round(width * 0.84)), backgroundColor: background },
        overlayColor: "rgba(0, 0, 0, 0.08)",
        // From the left edge only: a swipe on a message (to reply) or back in a pushed screen stays theirs.
        swipeEdgeWidth: 28,
      }}
    >
      <Drawer.Screen name="(chats)" />
      <Drawer.Screen name="inbox" />
      <Drawer.Screen name="tasks" />
      <Drawer.Screen name="(sessions)" />
      <Drawer.Screen name="profile" />
    </Drawer>
  );
}
