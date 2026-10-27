import type { CodePriority, CodeSessionState } from "@agora/core";
import { cn } from "@/lib/utils";

/**
 * A session's state and priority as marks, the Figma « Statut de session » and « Priorité de session »
 * components: one shape and one color per state, Linear's bars for the priority. Same marks in the
 * Sessions list, the tabs, the panel's header and the cards of the thread.
 */

const STATE_TONE: Record<CodeSessionState, string> = {
  running: "text-state-running",
  waiting: "text-state-you",
  idle: "text-state-neutral",
  finished: "text-state-finished",
  merged: "text-state-merged",
  stopped: "text-state-neutral",
  failed: "text-priority-urgent",
};

export function CodeStateIcon({ state, className }: { state: CodeSessionState; className?: string }) {
  const svg = cn("size-4 shrink-0", STATE_TONE[state], className);
  switch (state) {
    // A ring half filled: under way.
    case "running":
      return (
        <svg viewBox="0 0 16 16" className={svg} aria-hidden>
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 4.5a3.5 3.5 0 0 1 0 7z" fill="currentColor" />
        </svg>
      );
    // A ring with a dot: something for you to answer.
    case "waiting":
      return (
        <svg viewBox="0 0 16 16" className={svg} aria-hidden>
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="8" cy="8" r="3" fill="currentColor" />
        </svg>
      );
    // An empty ring: waits for an instruction.
    case "idle":
      return (
        <svg viewBox="0 0 16 16" className={svg} aria-hidden>
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "finished":
      return (
        <svg viewBox="0 0 16 16" className={svg} aria-hidden>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="M5 8.2 7.1 10.2 11 6" fill="none" stroke="var(--background)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    // GitHub's merge mark, in its violet.
    case "merged":
      return (
        <svg viewBox="0 0 16 16" className={svg} aria-hidden>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="M6 4.8v6.4M6 6.4c0 2.2 1.6 2.8 4 2.8" fill="none" stroke="var(--background)" strokeWidth="1.3" strokeLinecap="round" />
          <circle cx="6" cy="4.8" r="1.3" fill="var(--background)" />
          <circle cx="6" cy="11.2" r="1.3" fill="var(--background)" />
          <circle cx="10.4" cy="9.2" r="1.3" fill="var(--background)" />
        </svg>
      );
    case "stopped":
    case "failed":
      return (
        <svg viewBox="0 0 16 16" className={svg} aria-hidden>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="m5.8 5.8 4.4 4.4m0-4.4-4.4 4.4" fill="none" stroke="var(--background)" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
  }
}

const BARS: Record<Exclude<CodePriority, "urgent" | "none">, { n: number; tone: string }> = {
  high: { n: 3, tone: "text-priority-high" },
  medium: { n: 2, tone: "text-priority-medium" },
  low: { n: 1, tone: "text-priority-low" },
};

export function CodePriorityIcon({ priority, className }: { priority: CodePriority; className?: string }) {
  const svg = cn("size-4 shrink-0", className);
  if (priority === "urgent") {
    return (
      <svg viewBox="0 0 16 16" className={cn(svg, "text-priority-urgent")} aria-hidden>
        <rect x="1" y="1" width="14" height="14" rx="3.5" fill="currentColor" />
        <rect x="7" y="3.5" width="2" height="6" rx="1" fill="var(--background)" />
        <rect x="7" y="10.5" width="2" height="2" rx="1" fill="var(--background)" />
      </svg>
    );
  }
  if (priority === "none") {
    return (
      <svg viewBox="0 0 16 16" className={cn(svg, "text-subtle")} aria-hidden>
        {[1.5, 6.5, 11.5].map((x) => (
          <rect key={x} x={x} y="7.25" width="3" height="1.5" rx="0.75" fill="currentColor" />
        ))}
      </svg>
    );
  }
  const { n, tone } = BARS[priority];
  return (
    <svg viewBox="0 0 16 16" className={cn(svg, tone)} aria-hidden>
      {[
        [1.5, 6],
        [6.5, 9],
        [11.5, 12],
      ].map(([x, h], i) => (
        <rect key={x} x={x} y={14 - h!} width="3" height={h} rx="1" fill={i < n ? "currentColor" : "var(--border)"} />
      ))}
    </svg>
  );
}

/** An issue of GitHub, a ring and its dot, in the color of the text it goes with. */
export function IssueIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn("size-3.5 shrink-0", className)} aria-hidden>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="1.75" fill="currentColor" />
    </svg>
  );
}
