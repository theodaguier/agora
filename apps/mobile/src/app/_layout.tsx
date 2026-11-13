import "@/global.css";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
// One face per path: the packages' index requires all of their 18 TTFs, which would all ship in the bundle.
import { Geist_400Regular } from "@expo-google-fonts/geist/400Regular";
import { Geist_500Medium } from "@expo-google-fonts/geist/500Medium";
import { Geist_600SemiBold } from "@expo-google-fonts/geist/600SemiBold";
import { Geist_700Bold } from "@expo-google-fonts/geist/700Bold";
import { GeistMono_400Regular } from "@expo-google-fonts/geist-mono/400Regular";
import { HeroUINativeProvider } from "heroui-native";
import { useEffect, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { useCSSVariable } from "uniwind";
import { defineMessages } from "@/lib/i18n";
import { ServerScope } from "@/components/server-scope";
import { ServersProvider, useServers } from "@/lib/servers";
import { restoreTheme } from "@/components/profile/theme";

SplashScreen.preventAutoHideAsync();

const t = defineMessages({
  en: { scan: "Scan QR code" },
  fr: { scan: "Scanner le QR code" },
});

/** Navigation colors from the theme (global.css), so native headers match the screens. */
function useNavigationTheme() {
  const dark = useColorScheme() === "dark";
  const background = useCSSVariable("--color-background") as string;
  const foreground = useCSSVariable("--color-foreground") as string;
  const border = useCSSVariable("--color-border") as string;
  const accent = useCSSVariable("--color-accent") as string;
  const base = dark ? DarkTheme : DefaultTheme;
  return { ...base, colors: { ...base.colors, background, card: background, text: foreground, border, primary: accent } };
}

export default function RootLayout() {
  // The light/dark choice made in Profile › Appearance, saved on the phone.
  useEffect(() => {
    restoreTheme();
  }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Keyboard frames for the whole app: forms scroll to the focused field, the composer rides on the keyboard. */}
      <KeyboardProvider>
      <ServersProvider>
        <Organization>
          <HeroUINativeProvider>
            <Navigation />
          </HeroUINativeProvider>
        </Organization>
      </ServersProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

/**
 * The current organization's data (its server, its React Query cache) sits ABOVE HeroUI's
 * provider: sheets, menus and dialogs render in HeroUI's portal host, which must see it.
 * Switching organization remounts everything below.
 */
function Organization({ children }: { children: ReactNode }) {
  const { ready: serversReady, current } = useServers();
  // Geist, as on the web: the names are the ones global.css gives HeroUI's font variables.
  const [fontsReady, fontError] = useFonts({ Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold, GeistMono_400Regular });
  const ready = serversReady && (fontsReady || !!fontError);
  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);
  // Keeps the splash screen until the servers are read from the keychain and the fonts are loaded.
  if (!ready) return null;
  if (!current) return children;
  return (
    <ServerScope key={current.url} server={current}>
      {children}
    </ServerScope>
  );
}

function Navigation() {
  return (
    <ThemeProvider value={useNavigationTheme()}>
      <Screens />
    </ThemeProvider>
  );
}

function Screens() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(app)" />
      <Stack.Screen name="server" />
      <Stack.Screen name="login" options={{ headerShown: true, headerTransparent: true, title: "", headerBackButtonDisplayMode: "minimal" }} />
      <Stack.Screen name="scan" options={{ presentation: "modal", headerShown: true, title: t.scan }} />
      <Stack.Screen name="connect" options={{ gestureEnabled: false }} />
      <Stack.Screen name="forgot-password" options={{ headerShown: true, headerTransparent: true, title: "", headerBackButtonDisplayMode: "minimal" }} />
      <Stack.Screen name="invite" options={{ headerShown: true, headerTransparent: true, title: "", headerBackButtonDisplayMode: "minimal" }} />
      <Stack.Screen name="reset-password" options={{ headerShown: true, headerTransparent: true, title: "", headerBackButtonDisplayMode: "minimal" }} />
    </Stack>
  );
}
