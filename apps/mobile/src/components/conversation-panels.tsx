import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import * as Linking from "expo-linking";
import { BottomSheet, Chip, ListGroup, ScrollShadow, Separator, Surface, Typography, useThemeColor, useToast } from "heroui-native";
import { Fragment, useDeferredValue, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AgentAvatar } from "@/components/agent-avatar";
import { FileKindIcon, ImageViewer } from "@/components/attachments";
import { attachmentSource, Image, isImage, saveAttachment } from "@/components/attachment-files";
import { SheetSearch } from "@/components/conversation/sheet-search";
import { PersonAvatar } from "@/components/conversation-avatar";
import { PinIcon } from "@/components/icons";
import { setPinned } from "@/lib/api";
import { dividerLabel } from "@/lib/dates";
import { formatSize } from "@/lib/format";
import { withTap } from "@/lib/haptics";
import { defineMessages } from "@/lib/i18n";
import { firstUrl, linkLabel } from "@/lib/links";
import { messagesQuery, pinsQuery } from "@/lib/queries";
import type { Attachment, Author, Message, Pin, PinTarget } from "@/lib/types";
import { LongPressMenu, type MenuEntry } from "@/components/menus";
import { rowKey } from "@/lib/utils";

/*
 * apps/web/src/components/ConversationPanels.tsx. The side panels (search, files, pins) open as a
 * bottom sheet over the conversation; jumping to a message closes it. Rows and pinned chips: a tap
 * jumps (or opens the file, or the link), a long press shows the other actions in a menu.
 */

export type PanelKind = "search" | "files" | "pins";

const messages = defineMessages({
  en: {
    search: "Search",
    files: "Files",
    pins: "Pinned",
    searchPlaceholder: "Search the conversation",
    searchHint: "Messages and file names of this conversation.",
    noMatch: "No messages match.",
    results: (n: number) => (n === 1 ? "1 result" : `${n} results`),
    noFiles: "No files in this conversation yet.",
    images: "Images",
    documents: "Documents",
    noPins: "Nothing pinned yet. Pin a message or a file from its menu so everyone finds it here.",
    pin: "Pin",
    unpin: "Unpin",
    show: "Show in conversation",
    download: "Download",
    actions: "Actions",
    pinnedBy: (name: string) => `Pinned by ${name}`,
    photo: "Photo",
    files_: (n: number) => (n === 1 ? "1 file" : `${n} files`),
    pinnedBar: "Pinned in this conversation",
    copyLink: "Copy link",
    linkCopied: "Link copied",
    pinFailed: "Couldn't pin it.",
    unpinFailed: "Couldn't unpin it.",
    open: (url: string) => `Open ${url}`,
    seeAll: (n: number) => `See all ${n}`,
  },
  fr: {
    search: "Rechercher",
    files: "Fichiers",
    pins: "Épinglés",
    searchPlaceholder: "Rechercher dans la conversation",
    searchHint: "Messages et noms de fichiers de cette conversation.",
    noMatch: "Aucun message ne correspond.",
    results: (n: number) => (n <= 1 ? `${n} résultat` : `${n} résultats`),
    noFiles: "Aucun fichier dans cette conversation pour l'instant.",
    images: "Images",
    documents: "Documents",
    noPins: "Rien d'épinglé pour l'instant. Épingle un message ou un fichier depuis son menu pour que tout le monde le retrouve ici.",
    pin: "Épingler",
    unpin: "Désépingler",
    show: "Voir dans la conversation",
    download: "Télécharger",
    actions: "Actions",
    pinnedBy: (name: string) => `Épinglé par ${name}`,
    photo: "Photo",
    files_: (n: number) => (n <= 1 ? `${n} fichier` : `${n} fichiers`),
    pinnedBar: "Épinglés dans cette conversation",
    copyLink: "Copier le lien",
    linkCopied: "Lien copié",
    pinFailed: "Épinglage impossible.",
    unpinFailed: "Désépinglage impossible.",
    open: (url: string) => `Ouvrir ${url}`,
    seeAll: (n: number) => `Voir les ${n}`,
  },
});

/** Labels of the menu entries that open each panel. */
export function usePanelLabels() {
  const t = messages;
  return { search: t.search, files: t.files, pins: t.pins } satisfies Record<PanelKind, string>;
}

const pinKey = (t: PinTarget) => `${t.messageId}:${t.attachmentId ?? ""}`;

/** The conversation's pins, shared by its members, and how to pin or unpin. */
export function usePins(conversationId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: pins = noPins } = useQuery(pinsQuery(conversationId));
  const pinned = useMemo(() => new Set(pins.map((p) => pinKey({ messageId: p.message.id, attachmentId: p.attachment?.id }))), [pins]);
  const toggle = useMutation({
    mutationFn: ({ target, pin }: { target: PinTarget; pin: boolean }) => setPinned(conversationId, target, pin),
    onError: (_, { pin }) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      toast.show({ variant: "danger", label: pin ? messages.pinFailed : messages.unpinFailed });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: pinsQuery(conversationId).queryKey }),
  });
  const isPinned = (target: PinTarget) => pinned.has(pinKey(target));
  return {
    pins,
    isPinned,
    toggle: (target: PinTarget) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      toggle.mutate({ target, pin: !isPinned(target) });
    },
  };
}

/**
 * The actions of a row or chip, opened by a long press: a HeroUI Menu. `children` renders the
 * element (the long-press handler it receives is no longer needed: the menu takes the long press).
 */
function ActionMenu({ actions, children }: { actions: MenuEntry[]; children: (onLongPress: () => void) => ReactElement }) {
  return <LongPressMenu actions={actions}>{children(() => {})}</LongPressMenu>;
}

/** Bottom sheet of a conversation: search, files or pins. `kind` null means closed. */
export function ConversationPanel({
  kind,
  conversationId,
  onJump,
  onClose,
}: {
  kind: PanelKind | null;
  conversationId: string;
  /** Brings a message into view in the thread. */
  onJump: (messageId: string) => void;
  onClose: () => void;
}) {
  const labels = usePanelLabels();
  const insets = useSafeAreaInsets();
  // Keeps the panel while the sheet slides out.
  const [last, setLast] = useState<PanelKind>(kind ?? "search");
  if (kind && kind !== last) setLast(kind);
  const shown = kind ?? last;
  const jump = (messageId: string) => {
    onClose();
    onJump(messageId);
  };
  return (
    <BottomSheet isOpen={!!kind} onOpenChange={(open) => !open && onClose()}>
      {/* Not in a window of its own: the share sheet, the image viewer and the menus open above it. */}
      <BottomSheet.Portal disableFullWindowOverlay>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          snapPoints={["60%", "92%"]}
          index={shown === "search" ? 1 : 0}
          enableDynamicSizing={false}
          enableOverDrag={false}
          keyboardBehavior="extend"
          contentContainerClassName="h-full"
        >
          <View className="flex-row items-center justify-between pb-3">
            <BottomSheet.Title>{labels[shown]}</BottomSheet.Title>
            <BottomSheet.Close />
          </View>
          <View className="min-h-0 flex-1" style={{ paddingBottom: insets.bottom }}>
            {shown === "search" && <SearchPanel conversationId={conversationId} onJump={jump} />}
            {shown === "files" && <FilesPanel conversationId={conversationId} onJump={jump} />}
            {shown === "pins" && <PinsPanel conversationId={conversationId} onJump={jump} />}
          </View>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

/** Most chips shown in the bar before "See all". */
const BAR_MAX = 4;

/**
 * Pins under the conversation header, as in Slack: one chip per pinned message or file, newest
 * first. A tap brings it into view, or opens the link when the message holds one; long press for
 * the other actions.
 */
export function PinnedBar({ conversationId, onJump, onSeeAll }: { conversationId: string; onJump: (messageId: string) => void; onSeeAll: () => void }) {
  const t = messages;
  const { toast } = useToast();
  // The bar is a surface: the chips fade into it at the edges.
  const surface = useThemeColor("surface");
  const { pins, toggle } = usePins(conversationId);
  if (!pins.length) return null;
  const shown = [...pins].reverse().slice(0, BAR_MAX);
  const label = (p: Pin) => {
    if (p.attachment) return p.attachment.name;
    const first = p.message.data?.attachments?.[0];
    const text = plain(p.message.text) || (first ? (isImage(first.mime) ? t.photo : first.name) : "");
    return p.message.author ? `${p.message.author.name} : ${text}` : text;
  };
  return (
    <Surface role="navigation" accessibilityLabel={t.pinnedBar} className="p-0">
      <ScrollShadow LinearGradientComponent={LinearGradient} color={surface}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="items-center gap-2 px-4 py-1.5">
        <PinIcon className="size-4 shrink-0 text-muted" />
        {shown.map((p) => {
          const link = p.attachment ? undefined : firstUrl(p.message.text);
          return (
            <ActionMenu
              key={p.id}
              actions={[
                link && {
                  label: t.copyLink,
                  icon: "link",
                  onPress: () =>
                    Clipboard.setStringAsync(link.url).then(() => {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                      toast.show({ variant: "success", label: t.linkCopied });
                    }),
                },
                { label: t.show, icon: "text.bubble", onPress: () => onJump(p.message.id) },
                { label: t.unpin, icon: "pin.slash", onPress: () => toggle({ messageId: p.message.id, attachmentId: p.attachment?.id }) },
              ]}
 >
              {(onLongPress) => (
                <Chip
                  size="md"
                  variant="secondary"
                  color={link ? "accent" : "default"}
                  onPress={withTap(() => (link ? Linking.openURL(link.url) : onJump(p.message.id)))}
                  onLongPress={onLongPress}
                  accessibilityLabel={link ? t.open(link.url) : undefined}
                  accessibilityHint={!link && p.pinnedBy ? t.pinnedBy(p.pinnedBy) : undefined}
                  className="max-w-60"
                >
                  <Chip.Label numberOfLines={1}>{link ? linkLabel(link.url) : label(p)}</Chip.Label>
                </Chip>
              )}
            </ActionMenu>
          );
        })}
        {pins.length > BAR_MAX && (
          <Chip size="md" variant="tertiary" color="default" onPress={withTap(onSeeAll)}>
            <Chip.Label>{t.seeAll(pins.length)}</Chip.Label>
          </Chip>
        )}
      </ScrollView>
      </ScrollShadow>
    </Surface>
  );
}

/* ---------- Search ---------- */

/** Lowercase, without accents: "Été" matches "ete". */
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Readable text of a message: bot markdown and structured blocks stripped. */
const plain = (text: string) =>
  text
    .replace(/```[\w-]*[ \t]*\n[\s\S]*?```/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>|~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

type Hit = { message: Message; text: string; at: number; length: number };

function search(list: Message[], query: string): Hit[] {
  const q = fold(query.trim());
  if (!q) return [];
  const hits: Hit[] = [];
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i]!;
    if (m.kind === "event") continue;
    const text = plain(m.text);
    const files = (m.data?.attachments ?? []).map((a) => a.name).join(" · ");
    // Folding keeps one character per character for Latin text, so offsets still line up.
    let at = fold(text).indexOf(q);
    let shown = text;
    if (at < 0 && files) {
      at = fold(files).indexOf(q);
      shown = files;
    }
    if (at >= 0) hits.push({ message: m, text: shown, at, length: q.length });
  }
  return hits;
}

function Excerpt({ hit }: { hit: Hit }) {
  const start = Math.max(0, hit.at - 40);
  const before = (start > 0 ? "…" : "") + hit.text.slice(start, hit.at);
  const match = hit.text.slice(hit.at, hit.at + hit.length);
  const after = hit.text.slice(hit.at + hit.length, hit.at + hit.length + 120);
  return (
    <>
      {before}
      <Typography type="body-sm" weight="semibold">
        {match}
      </Typography>
      {after}
    </>
  );
}

function SearchPanel({ conversationId, onJump }: { conversationId: string; onJump: (id: string) => void }) {
  const t = messages;
  const { data: list = noMessages } = useQuery(messagesQuery(conversationId));
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const hits = useMemo(() => search(list, deferred).slice(0, 100), [list, deferred]);
  return (
    <>
      <SheetSearch value={query} onChange={setQuery} placeholder={t.searchPlaceholder} autoFocus onSubmit={() => hits[0] && onJump(hits[0].message.id)} />
      <Scroll>
        {!deferred.trim() ? (
          <PanelNote>{t.searchHint}</PanelNote>
        ) : hits.length === 0 ? (
          <PanelNote>{t.noMatch}</PanelNote>
        ) : (
          <>
            <SectionTitle>{t.results(hits.length)}</SectionTitle>
            <Rows>
              {hits.map((h) => (
                <MessageItem key={h.message.id} message={h.message} onPress={() => onJump(h.message.id)}>
                  <Excerpt hit={h} />
                </MessageItem>
              ))}
            </Rows>
          </>
        )}
      </Scroll>
    </>
  );
}

/* ---------- Shared parts ---------- */

/** Scrollable body of the sheet (the sheet's own scroll view, so the drag goes to the list). */
function Scroll({ children }: { children: ReactNode }) {
  return (
    <View className="min-h-0 flex-1">
      <BottomSheetScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerClassName="pt-3 pb-6">
        {children}
      </BottomSheetScrollView>
    </View>
  );
}

/** Rows of a list, as an inset grouped list with separators. */
function Rows({ children }: { children: ReactNode[] }) {
  return (
    <ListGroup>
      {children.map((row, i) => (
        <Fragment key={rowKey(row, i)}>
          {i > 0 && <Separator className="ml-16" />}
          {row}
        </Fragment>
      ))}
    </ListGroup>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Typography role="heading" type="body-sm" color="muted" className="mt-2 mb-2 ms-2">
      {children}
    </Typography>
  );
}

function PanelNote({ children }: { children: ReactNode }) {
  return (
    <Typography type="body-sm" color="muted" align="center" className="px-6 py-10">
      {children}
    </Typography>
  );
}

/** A message in a panel list: its author, date and a few lines of text; long press for the actions. */
function MessageItem({ message, onPress, actions = [], children }: { message: Message; onPress: () => void; actions?: MenuEntry[]; children: ReactNode }) {
  const row = (onLongPress?: () => void) => (
    <ListGroup.Item onPress={onPress} onLongPress={onLongPress} className="items-start">
      <ListGroup.ItemPrefix className="pt-0.5">
        <AuthorAvatar author={message.author} />
      </ListGroup.ItemPrefix>
      <ListGroup.ItemContent className="gap-0.5">
        <View className="flex-row items-baseline justify-between gap-2">
          <ListGroup.ItemTitle numberOfLines={1} className="shrink">
            {message.author?.name ?? "?"}
          </ListGroup.ItemTitle>
          <Typography type="body-xs" color="muted" className="shrink-0">
            {dividerLabel(new Date(message.createdAt))}
          </Typography>
        </View>
        <ListGroup.ItemDescription numberOfLines={3}>
          {children}
        </ListGroup.ItemDescription>
      </ListGroup.ItemContent>
    </ListGroup.Item>
  );
  return actions.length ? <ActionMenu actions={actions}>{row}</ActionMenu> : row();
}

function AuthorAvatar({ author }: { author: Author }) {
  if (author?.kind === "agent") return <AgentAvatar agent={author} className="size-9" />;
  if (author?.kind === "user") return <PersonAvatar person={author} className="size-9" />;
  return <View className="size-9" />;
}

/* ---------- Files ---------- */

type FileEntry = { file: Attachment; message: Message };

function FilesPanel({ conversationId, onJump }: { conversationId: string; onJump: (id: string) => void }) {
  const t = messages;
  const { data: list = noMessages } = useQuery(messagesQuery(conversationId));
  const { isPinned, toggle } = usePins(conversationId);
  const entries = useMemo(() => list.flatMap((m) => (m.data?.attachments ?? []).map((file) => ({ file, message: m }))).reverse(), [list]);
  const images = entries.filter((e) => isImage(e.file.mime));
  const documents = entries.filter((e) => !isImage(e.file.mime));
  const section = (title: string, items: FileEntry[]) =>
    items.length > 0 && (
      <View className="mb-4">
        <SectionTitle>
          {title} · {t.files_(items.length)}
        </SectionTitle>
        <Rows>
          {items.map((e) => {
            const target = { messageId: e.message.id, attachmentId: e.file.id };
            return <FileItem key={e.file.id} entry={e} pinned={isPinned(target)} onTogglePin={() => toggle(target)} onJump={() => onJump(e.message.id)} />;
          })}
        </Rows>
      </View>
    );
  return (
    <Scroll>
      {entries.length === 0 ? (
        <PanelNote>{t.noFiles}</PanelNote>
      ) : (
        <>
          {section(t.images, images)}
          {section(t.documents, documents)}
        </>
      )}
    </Scroll>
  );
}

/** A file: a tap opens the image or downloads the file; long press to show it, pin it, download it. */
function FileItem({
  entry: { file, message },
  pinned,
  onTogglePin,
  onJump,
  description,
}: {
  entry: FileEntry;
  pinned: boolean;
  onTogglePin: () => void;
  onJump: () => void;
  description?: string;
}) {
  const t = messages;
  const [viewing, setViewing] = useState<number | null>(null);
  const image = isImage(file.mime);
  return (
    <>
      <ActionMenu
        actions={[
          { label: t.show, icon: "text.bubble", onPress: onJump },
          { label: pinned ? t.unpin : t.pin, icon: pinned ? "pin.slash" : "pin", onPress: onTogglePin },
          "divider",
          { label: t.download, icon: "square.and.arrow.down", onPress: () => saveAttachment(file) },
        ]}
 >
        {(onLongPress) => (
          <ListGroup.Item onPress={withTap(() => (image ? setViewing(0) : saveAttachment(file)))} onLongPress={onLongPress}>
            <ListGroup.ItemPrefix>
              <Surface variant="secondary" className="size-10 items-center justify-center p-0">
                {image ? (
                  <Image source={attachmentSource(file)} cachePolicy="disk" contentFit="cover" className="size-full" />
                ) : (
                  <FileKindIcon name={file.name} className="size-5 text-accent" />
                )}
              </Surface>
            </ListGroup.ItemPrefix>
            <ListGroup.ItemContent>
              <ListGroup.ItemTitle numberOfLines={1}>{file.name}</ListGroup.ItemTitle>
              <ListGroup.ItemDescription numberOfLines={1}>
                {description ?? `${formatSize(file.size)} · ${message.author?.name ?? "?"} · ${dividerLabel(new Date(message.createdAt))}`}
              </ListGroup.ItemDescription>
            </ListGroup.ItemContent>
          </ListGroup.Item>
        )}
      </ActionMenu>
      {image && <ImageViewer images={[file]} index={viewing} onIndexChange={setViewing} />}
    </>
  );
}

/* ---------- Pins ---------- */

function PinsPanel({ conversationId, onJump }: { conversationId: string; onJump: (id: string) => void }) {
  const t = messages;
  const { pins, toggle } = usePins(conversationId);
  const describe = (p: Pin) => {
    const text = plain(p.message.text);
    if (text) return text;
    const first = p.message.data?.attachments?.[0];
    return first ? (isImage(first.mime) ? t.photo : first.name) : "";
  };
  return (
    <Scroll>
      {pins.length === 0 ? (
        <PanelNote>{t.noPins}</PanelNote>
      ) : (
        <Rows>
          {[...pins].reverse().map((p) => {
            const target = { messageId: p.message.id, attachmentId: p.attachment?.id };
            return p.attachment ? (
              <FileItem
                key={p.id}
                entry={{ file: p.attachment, message: p.message }}
                pinned
                onTogglePin={() => toggle(target)}
                onJump={() => onJump(p.message.id)}
                description={p.pinnedBy ? t.pinnedBy(p.pinnedBy) : formatSize(p.attachment.size)}
 />
            ) : (
              <MessageItem
                key={p.id}
                message={p.message}
                onPress={() => onJump(p.message.id)}
                actions={[
                  { label: t.show, icon: "text.bubble", onPress: () => onJump(p.message.id) },
                  { label: t.unpin, icon: "pin.slash", onPress: () => toggle(target) },
                ]}
 >
                {describe(p)}
              </MessageItem>
            );
          })}
        </Rows>
      )}
    </Scroll>
  );
}

const noMessages: Message[] = [];
const noPins: Pin[] = [];
