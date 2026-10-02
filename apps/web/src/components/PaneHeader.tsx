import type { ReactNode } from "react";
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
    <Item render={<header />} className="shrink-0 flex-nowrap items-start rounded-none px-4 pb-2 pt-3.5">
      {media && <ItemMedia className="mt-0.5">{media}</ItemMedia>}
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full truncate text-[15px]">{title}</ItemTitle>
        {description && <ItemDescription className="line-clamp-1 text-[13px]">{description}</ItemDescription>}
        {children}
      </ItemContent>
      {actions && <ItemActions className="-mr-1.5 -mt-1 gap-1">{actions}</ItemActions>}
    </Item>
  );
}
