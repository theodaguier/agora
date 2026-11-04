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
  className?: string;
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
        "group/tab flex h-8 min-w-0 max-w-48 flex-1 select-none items-center gap-2 rounded-md pr-1.5 pl-2.5 text-sm text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
        active && "bg-background font-medium text-foreground shadow-sm ring-1 ring-border hover:bg-background",
        active && dimmed && "text-muted-foreground",
        className,
      )}
    >
      <span className="flex min-w-4 shrink-0 items-center justify-center gap-1">{icon}</span>
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
        className={cn("shrink-0 opacity-0 group-hover/tab:opacity-100 focus-visible:opacity-100", active && "opacity-100")}
      >
        <CloseIcon />
      </Button>
    </div>
  );
}
