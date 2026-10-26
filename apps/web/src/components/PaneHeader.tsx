import type { ReactNode } from "react";
import { CloseIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";

/**
 * Header of a pane beside the conversation, or of a tab of its own (a Claude Code session, a mockup):
 * its state, its title and what it is at, then its buttons. `children` go under the description.
 */
export function PaneHeader({
  media,
  title,
  description,
  actions,
  children,
}: {
  media?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Item render={<header />} className="shrink-0 flex-nowrap items-start rounded-none pt-3 pr-3 pb-2 pl-5">
      {media && <ItemMedia className="mt-0.5">{media}</ItemMedia>}
      <ItemContent className="min-w-0">
        {/* The title is a flex box, whose text gets no ellipsis: the span truncates. */}
        <ItemTitle className="w-full min-w-0 text-[15px] leading-5 font-medium">
          <span className="truncate">{title}</span>
        </ItemTitle>
        {description && <ItemDescription className="line-clamp-1 text-[13px]">{description}</ItemDescription>}
        {children}
      </ItemContent>
      {actions && <ItemActions className="-mt-1 gap-1">{actions}</ItemActions>}
    </Item>
  );
}

/**
 * Figma « Barre » of a side panel: its name (Titre/Section) on the left, its buttons, then close.
 * The same in every panel beside a conversation (bot, colleague, group, screen, search, files, pins).
 */
export function PanelBar({ title, actions, closeLabel, onClose }: { title?: ReactNode; actions?: ReactNode; closeLabel: string; onClose: () => void }) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-1 pr-3 pl-5">
      <span className="min-w-0 flex-1 truncate text-[15px] leading-5 font-medium">{title}</span>
      {actions}
      <Button variant="ghost" size="icon-sm" aria-label={closeLabel} onClick={onClose}>
        <CloseIcon />
      </Button>
    </div>
  );
}
