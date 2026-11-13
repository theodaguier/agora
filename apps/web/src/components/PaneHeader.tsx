import type { ReactNode } from "react";
import { ChevronLeftIcon, CloseIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Header of a pane beside the conversation, or of a tab of its own (a Claude Code session, a mockup):
 * one line as tall as the conversation's header (46 px), so their hairlines meet. Its tile, its title,
 * what it is at in grey after it, then its buttons. `children` go on the same line, after the description.
 * `onBack` puts a back button first, for a page opened from another (a code session from Sessions).
 */
export function PaneHeader({
  media,
  title,
  description,
  actions,
  children,
  onBack,
  backLabel,
}: {
  media?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <header className={cn("@container flex h-11.5 shrink-0 items-center gap-2.5 border-b pr-3", onBack ? "pl-2" : "pl-4")}>
      {onBack && (
        <Button variant="ghost" size="icon-sm" aria-label={backLabel} title={backLabel} onClick={onBack} className="-mr-1">
          <ChevronLeftIcon />
        </Button>
      )}
      {media && <span className="flex shrink-0">{media}</span>}
      <h2 className="min-w-0 shrink truncate text-ui font-medium">{title}</h2>
      {/* Narrow (a pane beside a conversation): the title first, what it is at only when there's room. */}
      {description && <div className="hidden min-w-0 shrink items-center truncate text-xs text-muted-foreground @xl:flex">{description}</div>}
      {children}
      <span className="flex-1" />
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </header>
  );
}

/**
 * Bar of a side panel: its name (Titre/Section) on the left, its buttons, then close.
 * The same in every panel beside a conversation (bot, colleague, group, screen, search, files, pins).
 */
export function PanelBar({ title, actions, closeLabel, onClose }: { title?: ReactNode; actions?: ReactNode; closeLabel: string; onClose: () => void }) {
  return (
    <div className="flex h-11.5 shrink-0 items-center gap-1 pr-3 pl-5">
      <span className="min-w-0 flex-1 truncate text-ui font-medium">{title}</span>
      {actions}
      <Button variant="ghost" size="icon-sm" aria-label={closeLabel} onClick={onClose}>
        <CloseIcon />
      </Button>
    </div>
  );
}
