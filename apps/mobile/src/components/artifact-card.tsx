import type { ArtifactDto, PreviewRef } from "@agora/core";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Card, PressableFeedback, Typography } from "heroui-native";
import { useState } from "react";
import { Share, View } from "react-native";
import { WebView } from "react-native-webview";
import { BuildingIcon, GlobeIcon, LockIcon, MoreIcon } from "@/components/icons";
import { TapMenu } from "@/components/menus";
import { saveAttachment, type Shown } from "@/components/attachment-files";
import { useServer } from "@/components/server-scope";
import { api, apiUrl, attachmentUrl, authHeaders } from "@/lib/api";
import { withTap } from "@/lib/haptics";
import { defineMessages } from "@/lib/i18n";
import { useUniwind } from "uniwind";

/*
 * apps/web/src/components/Preview.tsx (ArtifactTile, PreviewCard); Figma « Blocs de réponse », mobile.
 * A page a bot wrote, in the thread: the page itself, live, laid out 720 pt wide and shrunk into the
 * card (as the web's thumbnail), then its title, « Artefact, version N », share and « … ». A tap opens it
 * full screen (app/(app)/artifact.tsx).
 */

export const artifactMessages = defineMessages({
  en: {
    mockup: "HTML mockup",
    artifact: "Artifact",
    versioned: (n: number) => `Artifact, version ${n}`,
    share: "Share",
    more: "More actions",
    untitled: "Mockup",
    open: "Open",
    download: "Download",
    deleted: (title: string) => `“${title}” was deleted.`,
  },
  fr: {
    mockup: "Maquette HTML",
    artifact: "Artefact",
    versioned: (n: number) => `Artefact, version ${n}`,
    share: "Partager",
    more: "Plus d'actions",
    untitled: "Maquette",
    open: "Ouvrir",
    download: "Télécharger",
    deleted: (title: string) => `« ${title} » a été supprimé.`,
  },
});

export const artifactQuery = (id: string) => queryOptions({ queryKey: ["artifact", id], queryFn: () => api<ArtifactDto>(`/artifacts/${encodeURIComponent(id)}`) });

/** Where a page is read from: its artifact's version (in the app's theme), else the conversation file holding it. */
export function pageSource(p: { artifactId?: string; version?: number; id: string }, theme: "light" | "dark") {
  if (p.artifactId) {
    const q = new URLSearchParams({ ...(p.version && { v: String(p.version) }), theme }).toString();
    return { uri: apiUrl(`/artifacts/${encodeURIComponent(p.artifactId)}/content?${q}`), headers: authHeaders() };
  }
  return { uri: attachmentUrl(p.id), headers: authHeaders() };
}

/** The share sheet with the artifact's link (absolute, on the instance). */
export function useShareArtifact(artifactId?: string) {
  const server = useServer();
  const { data } = useQuery({ ...artifactQuery(artifactId ?? ""), enabled: !!artifactId });
  if (!data) return null;
  return { mode: data.shareMode, share: () => void Share.share({ url: new URL(data.sharePath, server.url).toString(), message: data.title }) };
}

/** How open its link is, as the web's SHARE_MODE_ICON: the conversation, the organization, anyone with it. */
export const SHARE_MODE_ICON = { private: LockIcon, org: BuildingIcon, link: GlobeIcon };

/** The width a page is laid out at before being shrunk into its card (the web's THUMB_WIDTH). */
const THUMB_WIDTH = 720;

export function ArtifactCard({ preview, file }: { preview: PreviewRef; file?: Shown }) {
  const t = artifactMessages;
  const theme = useUniwind().theme === "dark" ? "dark" : "light";
  const [width, setWidth] = useState(0);
  const gone = useQuery({ ...artifactQuery(preview.artifactId ?? ""), enabled: !!preview.artifactId, retry: false }).isError;
  const share = useShareArtifact(preview.artifactId);
  const title = preview.title || t.untitled;
  const open = () => router.push({ pathname: "/artifact", params: { id: preview.id, title, ...(preview.artifactId && { artifactId: preview.artifactId }), ...(preview.version && { version: String(preview.version) }) } });
  if (gone)
    return (
      <Typography type="body-xs" className="text-subtle">
        {t.deleted(title)}
      </Typography>
    );
  const scale = width / THUMB_WIDTH;
  return (
    <Card className="w-full gap-0 overflow-hidden rounded-[18px] border border-border bg-background p-0">
      <PressableFeedback onPress={withTap(open)} accessibilityRole="button" accessibilityLabel={`${t.open} ${title}`} className="h-48 overflow-hidden border-b border-border" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {scale > 0 && (
          <View pointerEvents="none" style={{ width: THUMB_WIDTH, height: 192 / scale, transform: [{ scale }], transformOrigin: "top left" }}>
            <WebView source={pageSource(preview, theme)} scrollEnabled={false} originWhitelist={["*"]} style={{ backgroundColor: "transparent" }} />
          </View>
        )}
      </PressableFeedback>
      <View className="flex-row items-center gap-1 py-2.5 pe-2 ps-3.5">
        <PressableFeedback onPress={withTap(open)} accessibilityRole="button" className="min-w-0 flex-1">
          <Typography weight="medium" numberOfLines={1} className="text-subheadline">
            {title}
          </Typography>
          <Typography type="body-xs" color="muted" className="text-footnote">
            {preview.version ? t.versioned(preview.version) : preview.artifactId ? t.artifact : t.mockup}
          </Typography>
        </PressableFeedback>
        {!!share && (
          <PressableFeedback onPress={withTap(share.share)} accessibilityRole="button" accessibilityLabel={t.share} className="size-9 items-center justify-center rounded-full">
            {(() => {
              const Mode = SHARE_MODE_ICON[share.mode];
              return <Mode size={18} className="text-muted" />;
            })()}
          </PressableFeedback>
        )}
        <TapMenu
          accessibilityLabel={t.more}
          actions={[
            { label: t.open, icon: "arrow.up.left.and.arrow.down.right", onPress: open },
            !!file && { label: t.download, icon: "square.and.arrow.down", onPress: () => void saveAttachment(file) },
          ]}
        >
          <View accessibilityLabel={t.more} className="size-9 items-center justify-center">
            <MoreIcon size={18} className="text-muted" />
          </View>
        </TapMenu>
      </View>
    </Card>
  );
}
