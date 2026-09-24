import { LinearGradient } from "expo-linear-gradient";
import { Chip, CloseButton, ScrollShadow, Spinner, Surface, Typography, useThemeColor } from "heroui-native";
import { ScrollView, View } from "react-native";
import { FileTextIcon, WarningIcon } from "@/components/icons";
import { formatSize } from "@/lib/format";
import { withTap } from "@/lib/haptics";
import { defineMessages } from "@/lib/i18n";
import type { Attachment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Image, isImage } from "@/components/attachment-files";

/* The web's PendingFiles (apps/web/src/components/Attachments.tsx): files being added, above the text. */

const messages = defineMessages({
  en: { failed: "Failed", remove: (name: string) => `Remove ${name}` },
  fr: { failed: "Échec", remove: (name: string) => `Retirer ${name}` },
});

export type PendingFile = {
  key: string;
  name: string;
  mime: string;
  size: number;
  /** The file on the phone: the thumbnail, then the preview of the sent message. */
  uri: string;
  status: "uploading" | "ready" | "error";
  attachment?: Attachment;
  error?: string;
};

/** Images as thumbnails, other files as chips; a spinner while uploading, the reason when it failed. */
export function PendingFiles({ items, onRemove }: { items: PendingFile[]; onRemove: (key: string) => void }) {
  const t = messages;
  // The composer's bar is a surface: the edges fade into it.
  const surface = useThemeColor("surface");
  if (!items.length) return null;
  return (
    <ScrollShadow LinearGradientComponent={LinearGradient} color={surface}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerClassName="items-center gap-2 px-1 pt-1">
      {items.map((p) =>
        isImage(p.mime) ? (
          <View key={p.key} accessible accessibilityLabel={p.error ?? p.name} className="p-1">
            <Surface variant="tertiary" className="size-16 p-0">
              <Image source={{ uri: p.uri }} contentFit="cover" className={cn("size-full", p.status !== "ready" && "opacity-40")} />
              {p.status !== "ready" && (
                <View className="absolute inset-0 items-center justify-center">
                  {p.status === "uploading" ? <Spinner size="sm" /> : <WarningIcon className="size-5 text-danger" />}
                </View>
              )}
            </Surface>
            <CloseButton size="sm" accessibilityLabel={t.remove(p.name)} onPress={withTap(() => onRemove(p.key))} iconProps={{ size: 12 }} className="absolute top-0 right-0" />
          </View>
        ) : (
          <Chip
            key={p.key}
            size="lg"
            variant={p.status === "error" ? "soft" : "secondary"}
            color={p.status === "error" ? "danger" : "default"}
            accessibilityLabel={p.error ?? p.name}
            className="max-w-[240px] gap-2"
          >
            {p.status === "uploading" ? <Spinner size="sm" /> : <FileTextIcon className={cn("size-5", p.status === "error" ? "text-danger" : "text-muted")} />}
            <View className="min-w-0 shrink">
              <Chip.Label numberOfLines={1}>{p.name}</Chip.Label>
              {p.status === "error" ? (
                <Chip.Label numberOfLines={1}>{p.error ?? t.failed}</Chip.Label>
              ) : (
                <Typography type="body-xs" color="muted" numberOfLines={1}>
                  {formatSize(p.size)}
                </Typography>
              )}
            </View>
            <CloseButton size="sm" accessibilityLabel={t.remove(p.name)} onPress={withTap(() => onRemove(p.key))} iconProps={{ size: 12 }} />
          </Chip>
        ),
      )}
      </ScrollView>
    </ScrollShadow>
  );
}
