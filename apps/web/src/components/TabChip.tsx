import type { DragEvent, ReactNode } from "react";
import { CloseIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
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
}) {
  return (
    <div
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      title={title}
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
        "group/tab flex h-[30px] min-w-0 max-w-[200px] flex-1 select-none items-center gap-[7px] rounded-[9px] pr-1.5 pl-2.5 text-[13px] tracking-[-0.05px] text-muted-foreground outline-none hover:bg-black/4 focus-visible:ring-3 focus-visible:ring-ring/30 dark:hover:bg-white/5",
        active && "bg-background font-medium text-foreground ring-1 ring-black/8 dark:ring-white/10 hover:bg-background dark:bg-accent dark:hover:bg-accent",
        active && dimmed && "text-muted-foreground",
      )}
    >
      <span className="flex size-3.5 shrink-0 items-center justify-center [&_svg]:size-3.5">{icon}</span>
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
        className={cn("size-4 shrink-0 rounded-[4px] opacity-0 group-hover/tab:opacity-100 focus-visible:opacity-100 [&_svg:not([class*='size-'])]:size-3", active && "opacity-100")}
      >
        <CloseIcon />
      </Button>
    </div>
  );
}
