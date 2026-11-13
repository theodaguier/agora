import { PanelBar } from "@/components/PaneHeader";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CopyIcon, DownloadIcon, EyeIcon, MoreIcon, FileTextIcon, PinIcon, PinOffIcon, SearchIcon, WarningIcon } from "@/components/icons";
import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { AgentScreen } from "@/components/AgentScreen";
import { BesideButton } from "@/components/BesideButton";
import { ImageViewer } from "@/components/Attachments";
import { isImage } from "@/lib/files";
import { PersonAvatar } from "@/components/ConversationAvatar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";
import { attachmentUrl, setPinned, type Attachment, type Author, type Message, type Pin, type PinTarget } from "@/lib/api";
import { dividerLabel } from "@/lib/dates";
import { formatSize } from "@/lib/format";
import { firstUrl, linkLabel } from "@/lib/links";
import { messagesQuery, pinsQuery } from "@/lib/queries";
import { copyText } from "@/lib/feedback";
import { cn } from "@/lib/utils";

export type PanelKind = "screen" | "search" | "files" | "pins";

const messages = defineMessages({
  en: {
    screen: "Screen",
    search: "Search",
    files: "Files",
    pins: "Pinned",
    searchPlaceholder: "Search the conversation",
    searchHint: "Messages and file names of this conversation.",
    noMatchTitle: "No results",
    noMatch: "Try another word, or look in the files.",
    results: (n: number) => (n === 1 ? "1 result" : `${n} results`),
    noFilesTitle: "No files yet",
    noFiles: "Images, PDFs and documents shared in the conversation land here.",
    images: "Images",
    documents: "Documents",
    noPinsTitle: "Nothing pinned",
    noPins: "Pin a message or a file from its menu so everyone finds it here.",
    pin: "Pin",
    unpin: "Unpin",
    pinned: "Pinned.",
    unpinned: "Unpinned.",
    show: "Show in conversation",
    download: "Download",
    actions: "Actions",
    pinnedBy: (name: string) => `Pinned by ${name}`,
    photo: "Photo",
    files_: (n: number) => (n === 1 ? "1 file" : `${n} files`),
    pinnedBar: "Pinned in this conversation",
    copyLink: "Copy link",
    open: (url: string) => `Open ${url}`,
    seeAll: (n: number) => `See all ${n}`,
    errorTitle: "Unavailable for now",
    error: "This conversation couldn't be loaded. Try again in a moment.",
  },
  fr: {
    screen: "Écran",
    search: "Rechercher",
    files: "Fichiers",
    pins: "Épinglés",
    searchPlaceholder: "Rechercher dans la conversation",
    searchHint: "Messages et noms de fichiers de cette conversation.",
    noMatchTitle: "Aucun résultat",
    noMatch: "Essaie un autre mot, ou cherche dans les fichiers.",
    results: (n: number) => (n <= 1 ? `${n} résultat` : `${n} résultats`),
    noFilesTitle: "Aucun fichier",
    noFiles: "Les images, PDF et documents partagés dans la conversation arrivent ici.",
    images: "Images",
    documents: "Documents",
    noPinsTitle: "Rien d’épinglé",
    noPins: "Épingle un message ou un fichier depuis son menu pour que tout le monde le retrouve ici.",
    pin: "Épingler",
    unpin: "Désépingler",
    pinned: "Épinglé.",
    unpinned: "Désépinglé.",
    show: "Voir dans la conversation",
    download: "Télécharger",
    actions: "Actions",
    pinnedBy: (name: string) => `Épinglé par ${name}`,
    photo: "Photo",
    files_: (n: number) => (n <= 1 ? `${n} fichier` : `${n} fichiers`),
    pinnedBar: "Épinglés dans cette conversation",
    copyLink: "Copier le lien",
    open: (url: string) => `Ouvrir ${url}`,
    seeAll: (n: number) => `Voir les ${n}`,
    errorTitle: "Indisponible pour le moment",
    error: "Cette conversation n’a pas pu être chargée. Réessaie dans un instant.",
  },
});

/** Labels of the header buttons that open each panel. */
export function usePanelLabels() {
  const t = useT(messages);
  return { screen: t.screen, search: t.search, files: t.files, pins: t.pins } satisfies Record<PanelKind, string>;
}

const pinKey = (t: PinTarget) => `${t.messageId}:${t.attachmentId ?? ""}`;

/** The conversation's pins, shared by its members, and how to pin or unpin. */
export function usePins(conversationId: string) {
  const t = useT(messages);
  const qc = useQueryClient();
  const query = useQuery(pinsQuery(conversationId));
  const pins = query.data ?? noPins;
  const pinned = useMemo(() => new Set(pins.map((p) => pinKey({ messageId: p.message.id, attachmentId: p.attachment?.id }))), [pins]);
  const toggle = useMutation({
    mutationFn: ({ target, pin }: { target: PinTarget; pin: boolean }) => setPinned(conversationId, target, pin),
    onSettled: () => qc.invalidateQueries({ queryKey: pinsQuery(conversationId).queryKey }),
    meta: { success: (_: unknown, { pin }: { pin: boolean }) => (pin ? t.pinned : t.unpinned) },
  });
  const isPinned = (target: PinTarget) => pinned.has(pinKey(target));
  return {
    pins,
    query,
    isPinned,
    toggle: (target: PinTarget) => toggle.mutate({ target, pin: !isPinned(target) }),
  };
}

/** Side panel of a conversation: the screen (the browser its bots and Claude Code sessions drive), search, files or pins. */
export function ConversationPanel({
  kind,
  conversationId,
  onJump,
  onClose,
  onDetach,
}: {
  kind: PanelKind;
  conversationId: string;
  /** Brings a message into view in the thread. */
  onJump: (messageId: string) => void;
  onClose: () => void;
  /** The screen only: moves it into a pane of its own, beside the conversation. */
  onDetach?: () => void;
}) {
  const labels = usePanelLabels();
  const c = useT(common);
  return (
    <aside className="flex h-full w-full flex-col bg-background">
      {kind !== "search" && <PanelBar title={labels[kind]} actions={onDetach && <BesideButton onClick={onDetach} />} closeLabel={c.close} onClose={onClose} />}
      {kind === "screen" && (
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          <AgentScreen conversationId={conversationId} />
        </div>
      )}
      {kind === "search" && <SearchPanel conversationId={conversationId} onJump={onJump} closeLabel={c.close} onClose={onClose} />}
      {kind === "files" && <FilesPanel conversationId={conversationId} onJump={onJump} />}
      {kind === "pins" && <PinsPanel conversationId={conversationId} onJump={onJump} />}
    </aside>
  );
}

/** Most chips shown in the bar before "See all". */
const BAR_MAX = 4;

/**
 * Pins under the conversation header, as in Slack: one chip per pinned message
 * or file, newest first. A click brings it into view, or opens the link when the
 * message holds one; right click to unpin.
 */
export function PinnedBar({ conversationId, onJump, onSeeAll }: { conversationId: string; onJump: (messageId: string) => void; onSeeAll: () => void }) {
  const t = useT(messages);
  const { pins, toggle } = usePins(conversationId);
  if (!pins.length) return null;
  const shown = [...pins].reverse().slice(0, BAR_MAX);
  const label = (p: Pin) => {
    if (p.attachment) return p.attachment.name;
    const text = plain(p.message.text) || (p.message.data?.attachments?.[0] ? (isImage(p.message.data.attachments[0].mime) ? t.photo : p.message.data.attachments[0].name) : "");
    return p.message.author ? `${p.message.author.name} : ${text}` : text;
  };
  return (
    <nav aria-label={t.pinnedBar} className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b px-3">
      <PinIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      {shown.map((p) => {
        const link = p.attachment ? undefined : firstUrl(p.message.text);
        const chip = "max-w-60 shrink-0";
        return (
        <ContextMenu key={p.id}>
          <ContextMenuTrigger
            render={
              link ? (
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={t.open(link.url)}
                  title={link.url}
                  className={cn(buttonVariants({ variant: "link", size: "xs" }), chip)}
                />
              ) : (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => onJump(p.message.id)}
                  title={p.pinnedBy ? t.pinnedBy(p.pinnedBy) : undefined}
                  className={chip}
                />
              )
            }
          >
            <span className="truncate">{link ? linkLabel(link.url) : label(p)}</span>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-56">
            <ContextMenuGroup>
              {link && (
                <ContextMenuItem onClick={() => copyText(link.url)}>
                  <CopyIcon />
                  {t.copyLink}
                </ContextMenuItem>
              )}
              <ContextMenuItem onClick={() => onJump(p.message.id)}>
                <EyeIcon />
                {t.show}
              </ContextMenuItem>
              <ContextMenuItem onClick={() => toggle({ messageId: p.message.id, attachmentId: p.attachment?.id })}>
                <PinOffIcon />
                {t.unpin}
              </ContextMenuItem>
            </ContextMenuGroup>
          </ContextMenuContent>
        </ContextMenu>
        );
      })}
      {pins.length > BAR_MAX && (
        <Button variant="ghost" size="xs" onClick={onSeeAll} className="shrink-0">
          {t.seeAll(pins.length)}
        </Button>
      )}
    </nav>
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
    const files = (m.data?.attachments ?? []).map((a) => a.name).join(", ");
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
      <mark className="bg-transparent font-medium text-foreground">{match}</mark>
      {after}
    </>
  );
}

function SearchPanel({ conversationId, onJump, closeLabel, onClose }: { conversationId: string; onJump: (id: string) => void; closeLabel: string; onClose: () => void }) {
  const t = useT(messages);
  const thread = useQuery(messagesQuery(conversationId));
  const list = thread.data ?? noMessages;
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const hits = useMemo(() => search(list, deferred).slice(0, 100), [list, deferred]);
  return (
    <>
      {/* The search is the panel's bar: a row over a hairline, not a boxed field under a « Rechercher » title. */}
      <PanelBar
        title={
          <span className="flex items-center gap-2 font-normal">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && hits[0] && onJump(hits[0].message.id)}
              placeholder={t.searchPlaceholder}
              aria-label={t.searchPlaceholder}
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
            />
          </span>
        }
        closeLabel={closeLabel}
        onClose={onClose}
      />
      <div className="shrink-0 border-b" />
      {deferred.trim() && hits.length > 0 && <p className="shrink-0 px-5 pt-3 pb-1 text-sm text-muted-foreground">{t.results(hits.length)}</p>}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-2 pb-4">
        {!deferred.trim() ? null : thread.isPending ? (
          <PanelLoading />
        ) : thread.isError ? (
          <PanelError error={thread.error} onRetry={() => void thread.refetch()} />
        ) : hits.length === 0 ? (
          <PanelEmpty icon={<SearchIcon />} title={t.noMatchTitle}>
            {t.noMatch}
          </PanelEmpty>
        ) : (
          <ItemGroup>
            {hits.map((h) => (
              <MessageItem key={h.message.id} message={h.message} onClick={() => onJump(h.message.id)}>
                <Excerpt hit={h} />
              </MessageItem>
            ))}
          </ItemGroup>
        )}
      </div>
    </>
  );
}

/** A message in a panel list: its author, date and a line of text. */
function MessageItem({ message, onClick, actions, children }: { message: Message; onClick: () => void; actions?: ReactNode; children: ReactNode }) {
  return (
    <Item size="sm" role="listitem" className="flex-nowrap items-start hover:bg-muted">
      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-start gap-2.5 text-left">
        <ItemMedia>
          <AuthorAvatar author={message.author} />
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle className="w-full justify-between">
            <span className="truncate">{message.author?.name ?? "?"}</span>
            <span className="shrink-0 text-xs font-normal text-muted-foreground">{dividerLabel(new Date(message.createdAt))}</span>
          </ItemTitle>
          <ItemDescription className="line-clamp-3">{children}</ItemDescription>
        </ItemContent>
      </button>
      {actions && <ItemActions>{actions}</ItemActions>}
    </Item>
  );
}

function AuthorAvatar({ author }: { author: Author }) {
  if (author?.kind === "agent") return <AgentAvatar agent={author} className="size-6" />;
  if (author?.kind === "user") return <PersonAvatar person={author} className="size-6" />;
  return (
    <Avatar size="sm">
      <AvatarFallback />
    </Avatar>
  );
}

/* ---------- Files ---------- */

type FileEntry = { file: Attachment; message: Message };

export function FilesPanel({ conversationId, onJump }: { conversationId: string; onJump: (id: string) => void }) {
  const t = useT(messages);
  const thread = useQuery(messagesQuery(conversationId));
  const list = thread.data ?? noMessages;
  const { isPinned, toggle } = usePins(conversationId);
  const entries = useMemo(
    () => list.flatMap((m) => (m.data?.attachments ?? []).map((file) => ({ file, message: m }))).reverse(),
    [list],
  );
  const images = entries.filter((e) => isImage(e.file.mime));
  const documents = entries.filter((e) => !isImage(e.file.mime));
  const section = (title: string, items: FileEntry[]) =>
    items.length > 0 && (
      <section className="flex flex-col gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          {title}
          <Badge variant="secondary">{t.files_(items.length)}</Badge>
        </h2>
        <ItemGroup>
          {items.map((e) => {
            const target = { messageId: e.message.id, attachmentId: e.file.id };
            return (
              <FileItem
                key={e.file.id}
                entry={e}
                pinned={isPinned(target)}
                onTogglePin={() => toggle(target)}
                onJump={() => onJump(e.message.id)}
              />
            );
          })}
        </ItemGroup>
      </section>
    );
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
      {thread.isPending ? (
        <PanelLoading />
      ) : thread.isError ? (
        <PanelError error={thread.error} onRetry={() => void thread.refetch()} />
      ) : entries.length === 0 ? (
        <PanelEmpty icon={<FileTextIcon />} title={t.noFilesTitle}>
          {t.noFiles}
        </PanelEmpty>
      ) : (
        <div className="flex flex-col gap-4">
          {section(t.images, images)}
          {section(t.documents, documents)}
        </div>
      )}
    </div>
  );
}

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
  const t = useT(messages);
  const [viewing, setViewing] = useState<number | null>(null);
  return (
    <Item size="sm" role="listitem" className="flex-nowrap hover:bg-muted">
      <a
        href={attachmentUrl(file.id, !isImage(file.mime))}
        target={isImage(file.mime) ? "_blank" : undefined}
        rel="noreferrer"
        download={isImage(file.mime) ? undefined : file.name}
        onClick={(e) => {
          if (!isImage(file.mime) || e.metaKey || e.ctrlKey || e.shiftKey) return;
          e.preventDefault();
          setViewing(0);
        }}
        className="flex min-w-0 flex-1 items-center gap-2.5"
      >
        {isImage(file.mime) ? (
          <ItemMedia variant="image">
            <img src={attachmentUrl(file.id)} alt="" loading="lazy" />
          </ItemMedia>
        ) : (
          <ItemMedia variant="icon">
            <FileTextIcon />
          </ItemMedia>
        )}
        <ItemContent className="min-w-0">
          <ItemTitle className="w-full">{file.name}</ItemTitle>
          <ItemDescription className="line-clamp-1">
            {description ?? `${formatSize(file.size)}, ${message.author?.name ?? "?"}, ${dividerLabel(new Date(message.createdAt))}`}
          </ItemDescription>
        </ItemContent>
      </a>
      {isImage(file.mime) && <ImageViewer images={[file]} index={viewing} onIndexChange={setViewing} />}
      <ItemActions>
        <ActionsMenu>
          <DropdownMenuItem onClick={onJump}>
            <EyeIcon />
            {t.show}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onTogglePin}>
            {pinned ? <PinOffIcon /> : <PinIcon />}
            {pinned ? t.unpin : t.pin}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<a href={attachmentUrl(file.id, true)} download={file.name} />}>
            <DownloadIcon />
            {t.download}
          </DropdownMenuItem>
        </ActionsMenu>
      </ItemActions>
    </Item>
  );
}

function ActionsMenu({ children }: { children: ReactNode }) {
  const t = useT(messages);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t.actions} />}>
        <MoreIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>{children}</DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ---------- Pins ---------- */

function PinsPanel({ conversationId, onJump }: { conversationId: string; onJump: (id: string) => void }) {
  const t = useT(messages);
  const { pins, query, toggle } = usePins(conversationId);
  const describe = (p: Pin) => {
    const text = plain(p.message.text);
    if (text) return text;
    const first = p.message.data?.attachments?.[0];
    return first ? (isImage(first.mime) ? t.photo : first.name) : "";
  };
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
      {query.isPending ? (
        <PanelLoading />
      ) : query.isError ? (
        <PanelError error={query.error} onRetry={() => void query.refetch()} />
      ) : pins.length === 0 ? (
        <PanelEmpty icon={<PinIcon />} title={t.noPinsTitle}>
          {t.noPins}
        </PanelEmpty>
      ) : (
        <ItemGroup>
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
                onClick={() => onJump(p.message.id)}
                actions={
                  <ActionsMenu>
                    <DropdownMenuItem onClick={() => onJump(p.message.id)}>
                      <EyeIcon />
                      {t.show}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toggle(target)}>
                      <PinOffIcon />
                      {t.unpin}
                    </DropdownMenuItem>
                  </ActionsMenu>
                }
              >
                {describe(p)}
              </MessageItem>
            );
          })}
        </ItemGroup>
      )}
    </div>
  );
}

/** Empty state of a panel: its icon, a title, one sentence. */
function PanelEmpty({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Empty className="mt-10">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

/** A panel still loading: rows shaped like its items. */
function PanelLoading() {
  return (
    <div className="flex flex-col gap-3 px-1 pt-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-start gap-2.5">
          <Skeleton className="size-6 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A panel whose data couldn't load: said plainly, with a way to try again. */
function PanelError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const t = useT(messages);
  const c = useT(common);
  return (
    <Empty className="mt-10">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <WarningIcon />
        </EmptyMedia>
        <EmptyTitle>{t.errorTitle}</EmptyTitle>
        <EmptyDescription title={error.message}>{t.error}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="secondary" onClick={onRetry}>
          {c.retry}
        </Button>
      </EmptyContent>
    </Empty>
  );
}

const noMessages: Message[] = [];
const noPins: Pin[] = [];
