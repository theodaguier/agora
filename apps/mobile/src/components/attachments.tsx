import * as Haptics from "expo-haptics";
import { type ImageLoadEventData } from "expo-image";
import { Card, CloseButton, LinkButton, PressableFeedback, Surface, Typography } from "heroui-native";
import { useState } from "react";
import { Modal, View } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  FileArchiveIcon,
  FileAudioIcon,
  FileCodeIcon,
  FileIcon,
  FileImageIcon,
  FileSlidesIcon,
  FileTableIcon,
  FileTextIcon,
  FileVideoIcon,
  type IconComponent,
} from "@/components/icons";
import { fileKind, type FileKind } from "@/lib/files";
import { formatSize } from "@/lib/format";
import { withTap } from "@/lib/haptics";
import { defineMessages } from "@/lib/i18n";
import type { Attachment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { isImage, Shown, Image, attachmentSource, saveAttachment } from "@/components/attachment-files";

/*
 * apps/web/src/components/Attachments.tsx. A tap on an image opens the full-screen viewer (swipe
 * down to close); a tap on a file downloads it and opens the share sheet: Save to Files, AirDrop,
 * another app.
 */

const shownMessages = defineMessages({
  en: { download: (name: string) => `Download ${name}`, downloadShort: "Download", failed: "Failed", remove: (name: string) => `Remove ${name}`, close: "Close" },
  fr: { download: (name: string) => `Télécharger ${name}`, downloadShort: "Télécharger", failed: "Échec", remove: (name: string) => `Retirer ${name}`, close: "Fermer" },
});

/** Icon of a file, from its extension. */
const FILE_ICONS: Record<FileKind, IconComponent> = {
  image: FileImageIcon,
  video: FileVideoIcon,
  audio: FileAudioIcon,
  pdf: FileTextIcon,
  document: FileTextIcon,
  spreadsheet: FileTableIcon,
  presentation: FileSlidesIcon,
  archive: FileArchiveIcon,
  code: FileCodeIcon,
  design: FileImageIcon,
  file: FileIcon,
};

/** The icon of a file, from its name. */
export function FileKindIcon({ name, className }: { name: string; className?: string }) {
  const Icon = FILE_ICONS[fileKind(name)];
  return <Icon className={className} />;
}

/** Pixel size of a loaded image. */
type Natural = { width: number; height: number };

const naturalOf = (e: ImageLoadEventData): Natural => ({ width: e.source.width, height: e.source.height });

/** How far down a swipe has to go to close the viewer. */
const DISMISS_AT = 120;

/**
 * Full-screen viewer for one or several images, like Photos: on the screen's surface, the image fitted to it;
 * a tap shows the next one, a swipe down closes it. `index` null means closed.
 */
export function ImageViewer({
  images,
  index,
  onIndexChange,
}: {
  images: Shown[];
  index: number | null;
  onIndexChange: (index: number | null) => void;
}) {
  const a = index === null ? null : images[index];
  return (
    <Modal visible={!!a} transparent animationType="fade" statusBarTranslucent onRequestClose={() => onIndexChange(null)}>
      {/* The modal is a window of its own: gestures need their root in it. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        {a && <Viewer a={a} index={index!} count={images.length} onIndexChange={onIndexChange} />}
      </GestureHandlerRootView>
    </Modal>
  );
}

function Viewer({ a, index, count, onIndexChange }: { a: Shown; index: number; count: number; onIndexChange: (index: number | null) => void }) {
  const t = shownMessages;
  const insets = useSafeAreaInsets();
  const [box, setBox] = useState<Natural | null>(null);
  const y = useSharedValue(0);
  const close = () => onIndexChange(null);
  const pan = Gesture.Pan()
    .activeOffsetY([-12, 12])
    .onUpdate((e) => {
      y.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_AT || e.velocityY > 900) {
        y.value = withTiming(800, { duration: 180 });
        scheduleOnRN(close);
      } else y.value = withSpring(0);
    });
  const backdrop = useAnimatedStyle(() => ({ opacity: interpolate(y.value, [0, 400], [1, 0.2], "clamp") }));
  const moving = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }, { scale: interpolate(y.value, [0, 400], [1, 0.85], "clamp") }] }));
  const next = () => count > 1 && onIndexChange((index + 1) % count);
  return (
    <View className="flex-1">
      <Animated.View pointerEvents="none" style={backdrop} className="absolute inset-0">
        <Surface className="flex-1 p-0" />
      </Animated.View>
      <View className="flex-row items-center gap-3 px-4 pb-2" style={{ paddingTop: insets.top + 8 }}>
        <CloseButton accessibilityLabel={t.close} onPress={withTap(close)} />
        <View className="min-w-0 flex-1 items-center">
          <Typography weight="semibold" numberOfLines={1}>
            {a.name}
          </Typography>
          {count > 1 && (
            <Typography type="body-sm" color="muted" className="tabular-nums">
              {index + 1} / {count}
            </Typography>
          )}
        </View>
        <LinkButton onPress={withTap(() => saveAttachment(a))}>{t.downloadShort}</LinkButton>
      </View>
      <GestureDetector gesture={pan}>
        <Animated.View
          style={moving}
          onLayout={(e) => setBox({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
          className="min-h-0 flex-1 items-center justify-center"
 >
          {box && <ViewerImage key={a.id} a={a} box={box} onPress={next} />}
        </Animated.View>
      </GestureDetector>
      <View style={{ height: insets.bottom + 16 }} />
    </View>
  );
}

/** The whole image, as large as the screen allows, never enlarged. */
function ViewerImage({ a, box, onPress }: { a: Shown; box: Natural; onPress: () => void }) {
  const [natural, setNatural] = useState<Natural | null>(null);
  const scale = natural ? Math.min(1, box.width / natural.width, box.height / natural.height) : 0;
  return (
    <PressableFeedback onPress={onPress} accessibilityLabel={a.name}>
      <Image
        source={attachmentSource(a)}
        cachePolicy="disk"
        contentFit="contain"
        onLoad={(e) => setNatural(naturalOf(e))}
        style={natural ? { width: natural.width * scale, height: natural.height * scale } : { width: box.width, height: box.height }}
 />
    </PressableFeedback>
  );
}

/**
 * How an image tile is sized:
 * - `natural`: its own proportions, within 240 × 240, at least 80 (cropped);
 * - `width`: the full width, its height following the image between 96 and 320;
 * - `square`: a square filling its column.
 */
type Fit = "natural" | "width" | "square";

/** Image opening the viewer on tap, in a Surface. */
function ImageTile({ a, fit, onOpen }: { a: Shown; fit: Fit; onOpen: () => void }) {
  const [natural, setNatural] = useState<Natural | null>(null);
  const [width, setWidth] = useState(0);
  let size: { width?: number; height?: number } | undefined;
  if (fit === "natural") {
    const n = natural ?? { width: 240, height: 240 };
    const scale = Math.min(1, 240 / n.width, 240 / n.height);
    size = { width: Math.max(80, n.width * scale), height: Math.max(80, n.height * scale) };
  } else if (fit === "width") {
    size = { height: natural && width ? Math.min(320, Math.max(96, (width * natural.height) / natural.width)) : 160 };
  }
  return (
    <PressableFeedback onPress={withTap(onOpen)} accessibilityRole="imagebutton" accessibilityLabel={a.name} className={cn(fit !== "natural" && "w-full")}>
      <Surface variant="secondary" className={cn("p-0", fit !== "natural" && "w-full")}>
        <Image
          source={attachmentSource(a)}
          cachePolicy="disk"
          contentFit="cover"
          transition={150}
          onLoad={(e) => setNatural(naturalOf(e))}
          onLayout={fit === "width" ? (e) => setWidth(e.nativeEvent.layout.width) : undefined}
          className={cn(fit === "square" && "aspect-square w-full", fit === "width" && "w-full")}
          style={size}
        />
        <PressableFeedback.Highlight />
      </Surface>
    </PressableFeedback>
  );
}

/** File row: its icon, name and size; a tap downloads it. */
export function FileCard({ a, className }: { a: Shown; className?: string }) {
  const t = shownMessages;
  return (
    <PressableFeedback
      onPress={() => {
        Haptics.selectionAsync();
        saveAttachment(a);
      }}
      accessibilityRole="button"
      accessibilityLabel={t.download(a.name)}
      className={cn("w-64 max-w-full", className)}
    >
      <Card variant="default" className="p-2.5">
        <PressableFeedback.Highlight />
        <Card.Body className="flex-row items-center gap-3">
          <Surface variant="secondary" className="size-10 items-center justify-center p-0">
            <FileKindIcon name={a.name} className="size-5 text-accent" />
          </Surface>
          <View className="min-w-0 flex-1">
            <Card.Title numberOfLines={1}>{a.name}</Card.Title>
            <Card.Description>{formatSize(a.size)}</Card.Description>
          </View>
        </Card.Body>
      </Card>
    </PressableFeedback>
  );
}

/** Attachments sent alone, without text: shown bare, like photos in iOS Messages. */
export function SentAttachments({
  items,
  className,
  align = "end",
}: {
  items: Shown[];
  className?: string;
  /** "start" for files sent by a colleague. */
  align?: "start" | "end";
}) {
  const images = items.filter((a) => isImage(a.mime));
  const files = items.filter((a) => !isImage(a.mime));
  const [viewing, setViewing] = useState<number | null>(null);
  return (
    <View className={cn("flex-col gap-1.5", align === "end" ? "items-end" : "items-start", className)}>
      {images.length > 0 && (
        <View className={cn("flex-row flex-wrap gap-1.5", align === "end" ? "justify-end" : "justify-start")}>
          {images.map((a, i) => (
            <ImageTile key={a.id} a={a} fit="natural" onOpen={() => setViewing(i)} />
          ))}
        </View>
      )}
      <ImageViewer images={images} index={viewing} onIndexChange={setViewing} />
      {files.map((a) => (
        <FileCard key={a.id} a={a} />
      ))}
    </View>
  );
}

/** Attachments inside a bubble, above its text. */
export function BubbleAttachments({ items }: { items: Shown[] }) {
  const images = items.filter((a) => isImage(a.mime));
  const files = items.filter((a) => !isImage(a.mime));
  const [viewing, setViewing] = useState<number | null>(null);
  // Rows of two, the last one left half empty when the count is odd.
  const rows = images.length > 1 ? images.flatMap((a, i) => (i % 2 ? [] : [images.slice(i, i + 2)])) : [];
  return (
    <View className="flex-col gap-1">
      {images.length === 1 && <ImageTile a={images[0]!} fit="width" onOpen={() => setViewing(0)} />}
      {rows.length > 0 && (
        <View className="gap-1">
          {rows.map((row, r) => (
            <View key={row[0]!.id} className="flex-row gap-1">
              {row.map((a, i) => (
                <View key={a.id} className="flex-1">
                  <ImageTile a={a} fit="square" onOpen={() => setViewing(r * 2 + i)} />
                </View>
              ))}
              {row.length === 1 && <View className="flex-1" />}
            </View>
          ))}
        </View>
      )}
      <ImageViewer images={images} index={viewing} onIndexChange={setViewing} />
      {files.map((a) => (
        <FileCard key={a.id} a={a} className="w-full" />
      ))}
    </View>
  );
}

/** A file being uploaded or ready to send (the composer's tray). */
export type PendingFile = { key: string; name: string; mime: string; size: number; uri: string; status: "uploading" | "ready" | "error"; attachment?: Attachment; error?: string };

