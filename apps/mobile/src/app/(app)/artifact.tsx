import { router, Stack, useLocalSearchParams } from "expo-router";
import { Spinner } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import { useUniwind } from "uniwind";
import { artifactMessages, pageSource, useShareArtifact } from "@/components/artifact-card";
import { headerIcon } from "@/components/header-button";
import { withTap } from "@/lib/haptics";
import { tr } from "@/lib/i18n";
import { common } from "@agora/core/i18n";

/*
 * Figma « Blocs de réponse », mobile (« Artefact · Rédaction »): a page a bot wrote, full screen, opened
 * from its card in the thread (components/artifact-card.tsx). The page itself, as the web's artifact tab;
 * close on the left, share its link on the right (its card's « … » downloads it).
 */
export default function ArtifactScreen() {
  const { id, title, artifactId, version } = useLocalSearchParams<{ id: string; title?: string; artifactId?: string; version?: string }>();
  const t = artifactMessages;
  const theme = useUniwind().theme === "dark" ? "dark" : "light";
  const share = useShareArtifact(artifactId);
  const [loading, setLoading] = useState(true);
  return (
    <>
      <Stack.Screen options={{ title: title ?? t.untitled }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon={headerIcon.close} iconRenderingMode="template" accessibilityLabel={tr(common).close} onPress={withTap(() => router.back())} />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        {!!share && <Stack.Toolbar.Button icon="square.and.arrow.up" accessibilityLabel={t.share} onPress={withTap(share.share)} />}
      </Stack.Toolbar>
      <View className="flex-1 bg-background">
        <WebView source={pageSource({ id, artifactId, version: version ? Number(version) : undefined }, theme)} originWhitelist={["*"]} contentInsetAdjustmentBehavior="automatic" onLoadEnd={() => setLoading(false)} style={{ backgroundColor: "transparent" }} />
        {loading && (
          <View className="absolute inset-0 items-center justify-center">
            <Spinner />
          </View>
        )}
      </View>
    </>
  );
}
