import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { Alert, Button, LinkButton, Spinner } from "heroui-native";
import { View } from "react-native";
import { AuthScreen } from "@/components/auth-screen";
import { ApiError, notAgoraQr, pair, readPairing, type Pairing } from "@/lib/api";
import { withTap } from "@/lib/haptics";
import { defineMessages } from "@/lib/i18n";
import { useServers } from "@/lib/servers";

const t = defineMessages({
  en: {
    title: "Connecting",
    connecting: (server: string) => `Connecting to ${server}…`,
    failed: "Couldn't connect",
    retry: "Scan again",
    manual: "Enter the address instead",
  },
  fr: {
    title: "Connexion",
    connecting: (server: string) => `Connexion à ${server}…`,
    failed: "Connexion impossible",
    retry: "Scanner à nouveau",
    manual: "Saisir l'adresse à la place",
  },
});

const LAST_PAIRING_KEY = "agora.lastPairing";
/** Enough of the (already spent) code to recognize the same link. */
const linkId = (p: Pairing) => `${p.server}#${p.code.slice(0, 12)}`;

/**
 * Reached from the in-app scanner, or straight from the system camera
 * (deep link `agora://connect?server=…&code=…`).
 */
export default function Connect() {
  const params = useLocalSearchParams<{ server?: string; code?: string }>();
  const { save, servers } = useServers();
  const pairing = readPairing(params);
  const [error, setError] = useState<string | null>(pairing ? null : notAgoraQr);
  // The code is single-use: never post it twice.
  const started = useRef(false);
  // The pairing outlives the effect's re-runs (`pairing` is rebuilt each render): only unmounting drops its result.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!pairing || started.current) return;
    started.current = true;
    const home = () => {
      if (router.canDismiss()) router.dismissAll();
      router.replace("/");
    };
    (async () => {
      // The same link can come back: iOS or Expo Go reopen the app on the URL that launched it.
      // A code this phone already used is not a new scan: back home, without posting it again.
      if ((await SecureStore.getItemAsync(LAST_PAIRING_KEY)) === linkId(pairing)) return home();
      try {
        const { server, token } = await pair(pairing);
        await save(server, token);
        await SecureStore.setItemAsync(LAST_PAIRING_KEY, linkId(pairing));
        home();
      } catch (err) {
        // Code used or expired while this phone is already connected to that server: nothing to fix.
        if (err instanceof ApiError && err.status === 410 && servers.some((s) => s.url === pairing.server)) return home();
        if (mounted.current) setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [pairing, save, servers]);

  const host = pairing?.server.replace(/^https?:\/\//, "") ?? "";
  return (
    <AuthScreen title={t.title} hint={error ? null : t.connecting(host)}>
      {error ? (
        <>
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>{t.failed}</Alert.Title>
              <Alert.Description>{error}</Alert.Description>
            </Alert.Content>
          </Alert>
          <Button size="lg" onPress={withTap(() => router.replace("/scan"))} className="mt-6 w-full">
            {t.retry}
          </Button>
          <View className="mt-4 items-center">
            <LinkButton onPress={withTap(() => router.replace("/server"))}>{t.manual}</LinkButton>
          </View>
        </>
      ) : (
        <Spinner size="lg" className="self-center" />
      )}
    </AuthScreen>
  );
}
