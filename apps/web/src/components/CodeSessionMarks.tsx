import type { CodePriority, CodeSessionState } from "@agora/core";
import { cn } from "@/lib/utils";

/**
 * A session's state and priority as marks, the Figma « Statut de session » and « Priorité de session »
 * components. Each state has its own shape, never just a colour: rings for the open ones (working,
 * waiting for an instruction, set aside), a filled disc with its own glyph for the others. Linear's bars
 * for the priority; no priority draws nothing (its dashes read as the « … » menu next to them).
 * Same marks in the Sessions list, the tabs, the panel's header and the cards of the thread.
 */

/**
 * A tone class (« text-state-running ») as its colour, set on the mark itself: a highlighted menu row
 * recolours the text of all it holds, and a mark drawn in `currentColor` would turn white with it.
 */
const toneColor = (tone: string) => ({ color: `var(--${tone.replace(/^text-/, "")})` });

export const STATE_TONE: Record<CodeSessionState, string> = {
  running: "text-state-running",
  waiting: "text-state-you",
  idle: "text-state-neutral",
  parked: "text-state-neutral",
  finished: "text-state-finished",
  merged: "text-state-merged",
  stopped: "text-warning",
  failed: "text-priority-urgent",
};

export function CodeStateIcon({ state, className }: { state: CodeSessionState; className?: string }) {
  const svg = cn("size-4 shrink-0", STATE_TONE[state], className);
  const style = toneColor(STATE_TONE[state]);
  switch (state) {
    // A ring half filled: under way.
    case "running":
      return (
        <svg viewBox="0 0 16 16" className={svg} style={style} data-tone="" aria-hidden>
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 4.5a3.5 3.5 0 0 1 0 7z" fill="currentColor" />
        </svg>
      );
    // A question mark: something for you to answer (a ring and a dot is a GitHub issue).
    case "waiting":
      return (
        <svg viewBox="0 0 16 16" className={svg} style={style} data-tone="" aria-hidden>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="M6.2 6.3a1.85 1.85 0 1 1 2.6 1.7c-.5.25-.8.6-.8 1.1v.4" fill="none" stroke="var(--background)" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="11.6" r="0.9" fill="var(--background)" />
        </svg>
      );
    // An empty ring: waits for an instruction.
    case "idle":
      return (
        <svg viewBox="0 0 16 16" className={svg} style={style} data-tone="" aria-hidden>
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    // A dashed ring: set aside, as Linear's backlog.
    case "parked":
      return (
        <svg viewBox="0 0 16 16" className={svg} style={style} data-tone="" aria-hidden>
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.2 2.2" />
        </svg>
      );
    case "finished":
      return (
        <svg viewBox="0 0 16 16" className={svg} style={style} data-tone="" aria-hidden>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="M5 8.2 7.1 10.2 11 6" fill="none" stroke="var(--background)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    // GitHub's merge mark, in its violet.
    case "merged":
      return (
        <svg viewBox="0 0 16 16" className={svg} style={style} data-tone="" aria-hidden>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="M6 4.8v6.4M6 6.4c0 2.2 1.6 2.8 4 2.8" fill="none" stroke="var(--background)" strokeWidth="1.3" strokeLinecap="round" />
          <circle cx="6" cy="4.8" r="1.3" fill="var(--background)" />
          <circle cx="6" cy="11.2" r="1.3" fill="var(--background)" />
          <circle cx="10.4" cy="9.2" r="1.3" fill="var(--background)" />
        </svg>
      );
    // A stop square: stopped by someone, nothing went wrong.
    case "stopped":
      return (
        <svg viewBox="0 0 16 16" className={svg} style={style} data-tone="" aria-hidden>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <rect x="5.5" y="5.5" width="5" height="5" rx="1" fill="var(--background)" />
        </svg>
      );
    // A cross: it failed.
    case "failed":
      return (
        <svg viewBox="0 0 16 16" className={svg} style={style} data-tone="" aria-hidden>
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

/** `showNone`: draw the dashes of « Sans priorité » (in the priority menu, where it is an option). */
export function CodePriorityIcon({ priority, className, showNone }: { priority: CodePriority; className?: string; showNone?: boolean }) {
  const svg = cn("size-4 shrink-0", className);
  if (priority === "urgent") {
    return (
      <svg viewBox="0 0 16 16" className={cn(svg, "text-priority-urgent")} style={toneColor("text-priority-urgent")} data-tone="" aria-hidden>
        <rect x="1" y="1" width="14" height="14" rx="3.5" fill="currentColor" />
        <rect x="7" y="3.5" width="2" height="6" rx="1" fill="var(--background)" />
        <rect x="7" y="10.5" width="2" height="2" rx="1" fill="var(--background)" />
      </svg>
    );
  }
  if (priority === "none") {
    if (!showNone) return null;
    return (
      <svg viewBox="0 0 16 16" className={cn(svg, "text-muted-foreground")} style={toneColor("text-muted-foreground")} data-tone="" aria-hidden>
        {[1.5, 6.5, 11.5].map((x) => (
          <rect key={x} x={x} y="7.25" width="3" height="1.5" rx="0.75" fill="currentColor" />
        ))}
      </svg>
    );
  }
  const { n, tone } = BARS[priority];
  return (
    <svg viewBox="0 0 16 16" className={cn(svg, tone)} style={toneColor(tone)} aria-hidden>
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
