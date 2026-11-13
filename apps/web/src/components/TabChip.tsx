import type { DragEvent, ReactNode } from "react";
import { CloseIcon } from "@/components/icons";
import { ShortcutKeys } from "@/components/Shortcuts";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Shortcut } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

/**
 * A tab of a tab bar (the workspace's panes, the Claude Code panel): what it shows, a click to bring it
 * to the front, its close button (or a middle click). `dimmed`: in front, but in a pane without the focus.
 */
export function TabChip({
  title,
  icon,
  active,
  dimmed,
  unread,
  closeLabel,
  onSelect,
  onClose,
  onDragStart,
  shortcut,
  className,
}: {
  title: string;
  icon: ReactNode;
  active: boolean;
  dimmed?: boolean;
  unread?: boolean;
  closeLabel: string;
  onSelect: () => void;
  onClose: () => void;
  /** Makes the tab draggable. */
  onDragStart?: (e: DragEvent) => void;
  /** Its keys (⌃1…), shown with its title on hover. */
  shortcut?: Shortcut;
  className?: string;
}) {
  const tab = (
    <div
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      title={shortcut ? undefined : title}
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      onAuxClick={(e) => {
        if (e.button !== 1) return;
        e.preventDefault();
        onClose();
      }}
      className={cn(
        "group/tab flex h-7 min-w-0 max-w-48 shrink select-none items-center gap-1.5 rounded-md pr-1 pl-2 text-sm text-muted-foreground outline-none hover:bg-muted/50 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
        active && "bg-muted text-foreground hover:bg-muted",
        active && dimmed && "text-muted-foreground",
        className,
      )}
    >
      <span className="flex min-w-4 shrink-0 items-center justify-center gap-1 [&_svg:not([class*='size-'])]:size-4">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {unread && !active && <span className="size-1.5 shrink-0 rounded-full bg-brand" />}
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={closeLabel}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="shrink-0 opacity-0 group-hover/tab:opacity-100 focus-visible:opacity-100"
      >
        <CloseIcon />
      </Button>
    </div>
  );
  if (!shortcut) return tab;
  return (
    <Tooltip>
      <TooltipTrigger render={tab} />
      <TooltipContent>
        {title}
        <ShortcutKeys shortcut={shortcut} />
      </TooltipContent>
    </Tooltip>
  );
}
