import type { CodePriority, CodeSessionStatus } from "@agora/core";
import type { TaskPriority, TaskStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

/*
 * The small marks of the lists (Figma « Atelier · Théo », sections 5 to 8): a task's or a session's
 * state as a 14 px circle, and a priority as Linear draws it, three bars or a red square.
 */

const box = "size-3.5 shrink-0";
// Each colour is also set inline: a highlighted menu row recolours all it holds (focus:**:text-accent-foreground).

/** To do: an empty ring; in progress: half filled, orange; done: filled, with a check. */
export function TaskStatusIcon({ status, className }: { status: TaskStatus; className?: string }) {
  if (status === "done")
    return (
      <svg viewBox="0 0 24 24" aria-hidden className={cn(box, "text-state-merged", className)} style={{ color: "var(--state-merged)" }} data-tone="">
        <circle cx="12" cy="12" r="10" fill="currentColor" />
        <path d="m8 12.5 2.8 2.8L16.5 9.5" fill="none" stroke="var(--background)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (status === "in_progress")
    return (
      <svg viewBox="0 0 24 24" aria-hidden className={cn(box, "text-warning", className)} style={{ color: "var(--warning)" }} data-tone="">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M12 7a5 5 0 0 1 0 10z" fill="currentColor" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn(box, "text-muted-foreground", className)} style={{ color: "var(--muted-foreground)" }} data-tone="">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/** A code session: running (a turning arc), waiting for you, at rest (dashed), done, stopped (a square), failed (a cross). */
export function SessionStatusIcon({ status, className }: { status: CodeSessionStatus; className?: string }) {
  const ring = (props: React.SVGProps<SVGCircleElement>) => <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" {...props} />;
  switch (status) {
    case "failed":
      return (
        <svg viewBox="0 0 24 24" aria-hidden className={cn(box, "text-destructive", className)} style={{ color: "var(--destructive)" }} data-tone="">
          {ring({})}
          <path d="m9 9 6 6m0-6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "stopped":
      return (
        <svg viewBox="0 0 24 24" aria-hidden className={cn(box, "text-muted-foreground", className)} style={{ color: "var(--muted-foreground)" }} data-tone="">
          {ring({})}
          <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" />
        </svg>
      );
    case "done":
      return <TaskStatusIcon status="done" className={className} />;
    case "waiting":
      return (
        <svg viewBox="0 0 24 24" aria-hidden className={cn(box, "text-warning", className)} style={{ color: "var(--warning)" }} data-tone="">
          {ring({})}
          <circle cx="12" cy="12" r="3.5" fill="currentColor" />
        </svg>
      );
    case "running":
      return (
        <svg viewBox="0 0 24 24" aria-hidden className={cn(box, "animate-spin text-state-running", className)} style={{ color: "var(--state-running)" }} data-tone="">
          {ring({ strokeOpacity: 0.3 })}
          <path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    default:
      return <svg viewBox="0 0 24 24" aria-hidden className={cn(box, "text-muted-foreground", className)} style={{ color: "var(--muted-foreground)" }} data-tone="">{ring({ strokeDasharray: "2.6 2.6" })}</svg>;
  }
}

/** Urgent: a red square with « ! »; high, medium, low: three bars lit from the left; none: three dashes. */
export function PriorityIcon({ priority, className }: { priority: TaskPriority | CodePriority; className?: string }) {
  if (priority === "urgent")
    return (
      <svg viewBox="0 0 14 14" aria-hidden className={cn(box, className)}>
        <rect width="14" height="14" rx="3" className="fill-priority-urgent" />
        <path d="M7 3.5v4.2M7 10.2v.3" stroke="var(--background)" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  const lit = { high: 3, medium: 2, normal: 2, low: 1, none: 0 }[priority];
  return (
    <svg viewBox="0 0 14 14" aria-hidden className={cn(box, className)}>
      {[5, 8, 11].map((h, i) =>
        lit === 0 ? (
          <rect key={i} x={1.5 + i * 4.5} y={11} width={3} height={1.5} rx={0.75} className="fill-subtle-foreground" />
        ) : (
          <rect key={i} x={1.5 + i * 4.5} y={12.5 - h} width={3} height={h} rx={0.75} className={i < lit ? "fill-muted-foreground" : "fill-border"} />
        ),
      )}
    </svg>
  );
}
