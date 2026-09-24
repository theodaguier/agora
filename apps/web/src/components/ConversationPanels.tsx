import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronsRightIcon, MoreIcon, FileTextIcon, PinIcon, SearchIcon } from "@/components/icons";
import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { ImageViewer } from "@/components/Attachments";
import { isImage } from "@/lib/files";
import { PersonAvatar } from "@/components/ConversationAvatar";
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
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";
import { attachmentUrl, setPinned, type Attachment, type Author, type Message, type Pin, type PinTarget } from "@/lib/api";
import { dividerLabel } from "@/lib/dates";
import { formatSize } from "@/lib/format";
import { firstUrl, linkLabel } from "@/lib/links";
import { messagesQuery, pinsQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";

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
    open: (url: string) => `Ouvrir ${url}`,
    seeAll: (n: number) => `Voir les ${n}`,
  },
});

/** Labels of the header buttons that open each panel. */
export function usePanelLabels() {
  const t = useT(messages);
  return { search: t.search, files: t.files, pins: t.pins } satisfies Record<PanelKind, string>;
}

const pinKey = (t: PinTarget) => `${t.messageId}:${t.attachmentId ?? ""}`;

/** The conversation's pins, shared by its members, and how to pin or unpin. */
export function usePins(conversationId: string) {
  const qc = useQueryClient();
  const { data: pins = noPins } = useQuery(pinsQuery(conversationId));
  const pinned = useMemo(() => new Set(pins.map((p) => pinKey({ messageId: p.message.id, attachmentId: p.attachment?.id }))), [pins]);
  const toggle = useMutation({
    mutationFn: ({ target, pin }: { target: PinTarget; pin: boolean }) => setPinned(conversationId, target, pin),
    onSettled: () => qc.invalidateQueries({ queryKey: pinsQuery(conversationId).queryKey }),
  });
  const isPinned = (target: PinTarget) => pinned.has(pinKey(target));
  return {
    pins,
    isPinned,
    toggle: (target: PinTarget) => toggle.mutate({ target, pin: !isPinned(target) }),
  };
}

/** Side panel of a conversation: search, files or pins. */
export function ConversationPanel({
  kind,
  conversationId,
  onJump,
  onClose,
}: {
  kind: PanelKind;
  conversationId: string;
  /** Brings a message into view in the thread. */
  onJump: (messageId: string) => void;
  onClose: () => void;
}) {
  const labels = usePanelLabels();
  const c = useT(common);
  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col bg-sidebar">
      <div className="flex h-12 shrink-0 items-center justify-between gap-1 px-3">
        <span className="text-[13px] font-medium text-muted-foreground">{labels[kind]}</span>
        <Button variant="ghost" size="icon" aria-label={c.close} onClick={onClose} className="rounded-lg">
          <ChevronsRightIcon />
        </Button>
      </div>
      {kind === "search" && <SearchPanel conversationId={conversationId} onJump={onJump} />}
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
    <nav aria-label={t.pinnedBar} className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-border/60 px-3">
      <PinIcon aria-hidden className="mr-0.5 size-3.5 shrink-0 text-muted-foreground" />
      {shown.map((p) => {
        const link = p.attachment ? undefined : firstUrl(p.message.text);
        const chip = "max-w-60 shrink-0 rounded-md font-normal text-muted-foreground hover:text-foreground";
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
                  className={cn(buttonVariants({ variant: "ghost", size: "xs" }), chip, "text-brand hover:text-brand")}
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
              {link && <ContextMenuItem onClick={() => navigator.clipboard.writeText(link.url)}>{t.copyLink}</ContextMenuItem>}
              <ContextMenuItem onClick={() => onJump(p.message.id)}>{t.show}</ContextMenuItem>
              <ContextMenuItem onClick={() => toggle({ messageId: p.message.id, attachmentId: p.attachment?.id })}>{t.unpin}</ContextMenuItem>
            </ContextMenuGroup>
          </ContextMenuContent>
        </ContextMenu>
        );
      })}
      {pins.length > BAR_MAX && (
        <Button variant="ghost" size="xs" onClick={onSeeAll} className="shrink-0 rounded-md font-normal text-muted-foreground hover:text-foreground">
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
      <mark className="bg-transparent font-medium text-foreground">{match}</mark>
      {after}
    </>
  );
}

function SearchPanel({ conversationId, onJump }: { conversationId: string; onJump: (id: string) => void }) {
  const t = useT(messages);
  const { data: list = noMessages } = useQuery(messagesQuery(conversationId));
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const hits = useMemo(() => search(list, deferred).slice(0, 100), [list, deferred]);
  return (
    <>
      <div className="shrink-0 px-3 pb-2">
        <InputGroup className="bg-background">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && hits[0] && onJump(hits[0].message.id)}
            placeholder={t.searchPlaceholder}
            aria-label={t.searchPlaceholder}
          />
        </InputGroup>
        {deferred.trim() && hits.length > 0 && <p className="mt-2 text-[13px] text-muted-foreground">{t.results(hits.length)}</p>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {!deferred.trim() ? (
          <p className="px-1 text-sm text-subtle">{t.searchHint}</p>
        ) : hits.length === 0 ? (
          <p className="px-1 text-sm text-subtle">{t.noMatch}</p>
        ) : (
          <div className="-mx-2 flex flex-col">
            {hits.map((h) => (
              <MessageItem key={h.message.id} message={h.message} onClick={() => onJump(h.message.id)}>
                <Excerpt hit={h} />
              </MessageItem>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/** A message in a panel list: its author, date and a line of text. */
function MessageItem({ message, onClick, actions, children }: { message: Message; onClick: () => void; actions?: ReactNode; children: ReactNode }) {
  return (
    <Item size="sm" className="items-start px-2 py-2 hover:bg-muted/50">
      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-start gap-2.5 text-left outline-none">
        <ItemMedia className="pt-0.5">
          <AuthorAvatar author={message.author} />
        </ItemMedia>
        <ItemContent className="min-w-0 gap-0.5">
          <ItemTitle className="w-full justify-between gap-2 font-normal">
            <span className="truncate">{message.author?.name ?? "?"}</span>
            <span className="shrink-0 text-[12px] text-subtle">{dividerLabel(new Date(message.createdAt))}</span>
          </ItemTitle>
          <ItemDescription className="line-clamp-3 text-[13px]">{children}</ItemDescription>
        </ItemContent>
      </button>
      {actions && <ItemActions>{actions}</ItemActions>}
    </Item>
  );
}

function AuthorAvatar({ author }: { author: Author }) {
  if (author?.kind === "agent") return <AgentAvatar agent={author} className="size-6" />;
  if (author?.kind === "user") return <PersonAvatar person={author} className="size-6" />;
  return <span className="size-6" />;
}

/* ---------- Files ---------- */

type FileEntry = { file: Attachment; message: Message };

function FilesPanel({ conversationId, onJump }: { conversationId: string; onJump: (id: string) => void }) {
  const t = useT(messages);
  const { data: list = noMessages } = useQuery(messagesQuery(conversationId));
  const { isPinned, toggle } = usePins(conversationId);
  const entries = useMemo(
    () => list.flatMap((m) => (m.data?.attachments ?? []).map((file) => ({ file, message: m }))).reverse(),
    [list],
  );
  const images = entries.filter((e) => isImage(e.file.mime));
  const documents = entries.filter((e) => !isImage(e.file.mime));
  const section = (title: string, items: FileEntry[]) =>
    items.length > 0 && (
      <section>
        <h2 className="mb-1 mt-4 px-1 text-[13px] font-medium text-muted-foreground first:mt-0">
          {title} · {t.files_(items.length)}
        </h2>
        <div className="-mx-2 flex flex-col">
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
        </div>
      </section>
    );
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
      {entries.length === 0 ? (
        <PanelEmpty>{t.noFiles}</PanelEmpty>
      ) : (
        <>
          {section(t.images, images)}
          {section(t.documents, documents)}
        </>
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
    <Item size="sm" className="px-2 py-1.5 hover:bg-muted/50">
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
        className="flex min-w-0 flex-1 items-center gap-2.5 outline-none"
      >
        {isImage(file.mime) ? (
          <ItemMedia variant="image" className="size-9 rounded-md">
            <img src={attachmentUrl(file.id)} alt="" loading="lazy" />
          </ItemMedia>
        ) : (
          <ItemMedia variant="icon" className="size-9 rounded-md">
            <FileTextIcon className="text-muted-foreground" />
          </ItemMedia>
        )}
        <ItemContent className="min-w-0 gap-0">
          <ItemTitle className="w-full truncate font-normal">{file.name}</ItemTitle>
          <ItemDescription className="truncate text-[12px]">
            {description ?? `${formatSize(file.size)} · ${message.author?.name ?? "?"} · ${dividerLabel(new Date(message.createdAt))}`}
          </ItemDescription>
        </ItemContent>
      </a>
      {isImage(file.mime) && <ImageViewer images={[file]} index={viewing} onIndexChange={setViewing} />}
      <ItemActions>
        <ActionsMenu>
          <DropdownMenuItem onClick={onJump}>{t.show}</DropdownMenuItem>
          <DropdownMenuItem onClick={onTogglePin}>{pinned ? t.unpin : t.pin}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<a href={attachmentUrl(file.id, true)} download={file.name} />}>{t.download}</DropdownMenuItem>
        </ActionsMenu>
      </ItemActions>
    </Item>
  );
}

function ActionsMenu({ children }: { children: ReactNode }) {
  const t = useT(messages);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t.actions} className="text-muted-foreground" />}>
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
  const { pins, toggle } = usePins(conversationId);
  const describe = (p: Pin) => {
    const text = plain(p.message.text);
    if (text) return text;
    const first = p.message.data?.attachments?.[0];
    return first ? (isImage(first.mime) ? t.photo : first.name) : "";
  };
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
      {pins.length === 0 ? (
        <PanelEmpty>{t.noPins}</PanelEmpty>
      ) : (
        <div className="-mx-2 flex flex-col">
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
                    <DropdownMenuItem onClick={() => onJump(p.message.id)}>{t.show}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toggle(target)}>{t.unpin}</DropdownMenuItem>
                  </ActionsMenu>
                }
              >
                {describe(p)}
              </MessageItem>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PanelEmpty({ children }: { children: ReactNode }) {
  return (
    <Empty className="mt-6 p-0">
      <EmptyHeader>
        <EmptyDescription className="text-[13px]">{children}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

const noMessages: Message[] = [];
const noPins: Pin[] = [];
