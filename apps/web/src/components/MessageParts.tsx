import { PackageIcon, ClockIcon, CopyIcon, DownloadIcon, MoreIcon, ForwardIcon, PinIcon, PinOffIcon, PlugIcon, ReplyIcon } from "@/components/icons";
import type { ComponentType, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { defineMessages, useT } from "@/i18n";
import { attachmentUrl, invocationKey, type Attachment, type Invocation, type ReplyTo } from "@/lib/api";
import type { Mentionable } from "@/lib/mentions";
import { cn } from "@/lib/utils";
import { BubbleAttachments, SentAttachments } from "./Attachments";
import { isImage } from "../lib/files";
import { copyText } from "@/lib/feedback";
import { PeerBubble, UserBubble } from "./Bubbles";
import { MessageText } from "./MessageText";

const messages = defineMessages({
  en: {
    actions: "Message actions",
    reply: "Reply",
    forward: "Forward",
    pin: "Pin",
    unpin: "Unpin",
    copy: "Copy text",
    download: (n: number) => (n > 1 ? `Download ${n} files` : "Download"),
    forwardedFrom: (name: string) => `Forwarded from ${name}`,
    photo: "Photo",
  },
  fr: {
    actions: "Actions du message",
    reply: "Répondre",
    forward: "Transférer",
    pin: "Épingler",
    unpin: "Désépingler",
    copy: "Copier le texte",
    download: (n: number) => (n > 1 ? `Télécharger les ${n} fichiers` : "Télécharger"),
    forwardedFrom: (name: string) => `Transféré de ${name}`,
    photo: "Photo",
  },
});

/** The message being answered: in the bubble that answers it, and above the composer. */
export function QuoteBlock({
  quote,
  onClick,
  actions,
  className,
}: {
  quote: ReplyTo;
  onClick?: () => void;
  actions?: ReactNode;
  className?: string;
}) {
  const t = useT(messages);
  const image = quote.attachment && isImage(quote.attachment.mime) ? quote.attachment : null;
  const label = quote.text || (image ? t.photo : (quote.attachment?.name ?? ""));
  return (
    <Item
      variant="muted"
      size="xs"
      render={onClick ? <button type="button" onClick={onClick} /> : undefined}
      className={cn("w-full rounded-xl text-left", onClick && "hover:bg-muted", className)}
    >
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full truncate text-[13px]">{quote.authorName}</ItemTitle>
        <ItemDescription className="line-clamp-1 text-[13px]">{label}</ItemDescription>
      </ItemContent>
      {image && (
        <ItemMedia variant="image" className="size-8 rounded-md">
          <img src={attachmentUrl(image.id)} alt="" />
        </ItemMedia>
      )}
      {actions}
    </Item>
  );
}

/**
 * An employee's message: text, files, reply and forward context in one bubble.
 * Files sent without text stay bare.
 */
export function ChatMessage(props: {
  mine: boolean;
  text: string;
  attachments?: (Attachment & { previewUrl?: string })[];
  invocations?: Invocation[];
  replyTo?: ReplyTo;
  forwarded?: { authorName: string };
  mentionables: Mentionable[];
  onQuote?: (id: string) => void;
}) {
  const { mine, text, attachments = [], invocations = [], replyTo, forwarded, mentionables, onQuote } = props;
  const t = useT(messages);
  const framed = !!(text || replyTo || forwarded);
  const rich = !!(attachments.length || replyTo || forwarded);
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", mine ? "items-end" : "items-start", attachments.length > 0 && "mt-1")}>
      {invocations.length > 0 && (
        <div className="flex flex-wrap justify-end gap-1.5">
          {invocations.map((v) => (
            <Badge key={invocationKey(v)} variant="outline" size="lg" className="text-foreground/85">
              {v.kind === "skill" ? <PackageIcon /> : v.kind === "routine" ? <ClockIcon /> : <PlugIcon />}
              {v.name}
            </Badge>
          ))}
        </div>
      )}
      {!framed && attachments.length > 0 && <SentAttachments items={attachments} align={mine ? "end" : "start"} />}
      {framed && !rich && (mine ? <UserBubble text={text} mentionables={mentionables} className="max-w-full" /> : <PeerBubble text={text} mentionables={mentionables} className="max-w-full" />)}
      {framed && rich && (
        <div
          className={cn(
            "flex w-fit min-w-0 max-w-full flex-col gap-1 overflow-hidden rounded-2xl p-1",
            mine ? "bg-accent" : "bg-secondary",
            attachments.some((a) => isImage(a.mime)) ? "w-80" : "max-w-[min(100%,24rem)]",
            replyTo && "min-w-56",
          )}
        >
          {forwarded && <p className="px-2.5 pt-1 text-[13px] text-muted-foreground">{t.forwardedFrom(forwarded.authorName)}</p>}
          {replyTo && <QuoteBlock quote={replyTo} onClick={onQuote && (() => onQuote(replyTo.id))} className="bg-background/40 hover:bg-background/60" />}
          {attachments.length > 0 && <BubbleAttachments items={attachments} />}
          {text && (
            <MessageText plain text={text} mentionables={mentionables} className="min-w-0 break-words px-2.5 pb-1 pt-0.5 text-[15px] leading-[1.45]" />
          )}
        </div>
      )}
    </div>
  );
}

/** Downloads each file, as a click on its link would. */
function downloadAll(files: Attachment[]) {
  for (const f of files) {
    const a = document.createElement("a");
    a.href = attachmentUrl(f.id, true);
    a.download = f.name;
    a.click();
  }
}

type MenuParts = {
  Group: ComponentType<{ children: ReactNode }>;
  Item: ComponentType<{ onClick?: () => void; children: ReactNode }>;
  Separator: ComponentType;
};

const dropdownParts: MenuParts = { Group: DropdownMenuGroup, Item: DropdownMenuItem, Separator: DropdownMenuSeparator };
const contextParts: MenuParts = { Group: ContextMenuGroup, Item: ContextMenuItem, Separator: ContextMenuSeparator };

/** Our message while it is being sent: laid out exactly like its MessageRow, so the swap doesn't move it. */
export function PendingRow({ failed, children }: { failed?: boolean; children: ReactNode }) {
  return (
    <div className="-mx-2 flex justify-end px-2">
      <div className="flex min-w-0 max-w-[min(560px,80%)] flex-row-reverse items-center gap-1">
        <div className={cn("min-w-0", !failed && "chat-pending")}>{children}</div>
        {/* The place of the "…" button. */}
        <span aria-hidden className="size-7 shrink-0" />
      </div>
    </div>
  );
}

/**
 * A message line: its bubble, and its actions (reply, forward, pin, copy, download),
 * from the "…" button shown on hover or from a right click.
 */
export function MessageRow(props: {
  id: string;
  mine?: boolean;
  wide?: boolean;
  highlighted?: boolean;
  text?: string;
  attachments?: Attachment[];
  onReply: () => void;
  onForward: () => void;
  /** The message itself is pinned (the menu then offers to unpin it). */
  pinned?: boolean;
  onTogglePin?: () => void;
  /** Came in while the conversation was open: rises into place. */
  arriving?: boolean;
  children: ReactNode;
}) {
  const t = useT(messages);
  const files = props.attachments ?? [];
  const items = ({ Group, Item, Separator }: MenuParts) => (
    <>
      <Group>
        <Item onClick={props.onReply}>
          <ReplyIcon /> {t.reply}
        </Item>
        <Item onClick={props.onForward}>
          <ForwardIcon /> {t.forward}
        </Item>
        {props.onTogglePin && (
          <Item onClick={props.onTogglePin}>
            {props.pinned ? <PinOffIcon /> : <PinIcon />} {props.pinned ? t.unpin : t.pin}
          </Item>
        )}
      </Group>
      {(props.text || files.length > 0) && <Separator />}
      <Group>
        {props.text && (
          <Item onClick={() => copyText(props.text!)}>
            <CopyIcon /> {t.copy}
          </Item>
        )}
        {files.length > 0 && (
          <Item onClick={() => downloadAll(files)}>
            <DownloadIcon /> {t.download(files.length)}
          </Item>
        )}
      </Group>
    </>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger
        id={`msg-${props.id}`}
        className={cn(
          "group/msg -mx-2 flex scroll-my-24 select-text rounded-2xl px-2 transition-colors duration-700",
          props.mine ? "justify-end" : "justify-start",
          props.highlighted && "bg-muted duration-150",
        )}
      >
        <div
          className={cn(
            "flex min-w-0 items-center gap-1",
            props.arriving && "chat-arrive",
            props.mine && "flex-row-reverse",
            props.wide ? "max-w-[min(680px,88%)]" : "max-w-[min(560px,80%)]",
          )}
        >
          <div className="min-w-0">{props.children}</div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t.actions}
                  className="shrink-0 text-muted-foreground opacity-0 group-hover/msg:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100 pointer-coarse:opacity-100"
                />
              }
            >
              <MoreIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align={props.mine ? "end" : "start"} className="w-48">
              {items(dropdownParts)}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">{items(contextParts)}</ContextMenuContent>
    </ContextMenu>
  );
}
