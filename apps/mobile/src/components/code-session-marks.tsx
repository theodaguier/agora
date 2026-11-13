import type { CodePriority, CodeSessionState } from "@agora/core";
import type { TaskPriority, TaskStatus } from "@/lib/tasks";
import type { ReactNode } from "react";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { useResolveClassNames } from "uniwind";

/*
 * apps/web/src/components/CodeSessionMarks.tsx: a session's state and priority as marks, the Figma
 * « Statut de session » and « Priorité de session » components, same shapes and colours (global.css
 * statut/ and priorité/ tokens). Same marks in the session lists, the card in the thread and the
 * session's header.
 */

const STATE_TONE: Record<CodeSessionState, string> = {
  running: "text-state-running",
  waiting: "text-state-you",
  idle: "text-state-neutral",
  parked: "text-state-neutral",
  finished: "text-state-finished",
  merged: "text-state-merged",
  // As the web: stopped by someone reads in orange, apart from what merely rests.
  stopped: "text-warning",
  failed: "text-priority-urgent",
};

/** The text colour of a state, for the words that go with its mark (the header's state). */
export const codeStateTone = (state: CodeSessionState) => (state === "waiting" || state === "failed" ? STATE_TONE[state] : undefined);

const useColor = (className: string) => (useResolveClassNames(className) as { color?: string }).color ?? "#888";

export function CodeStateIcon({ state, size = 16 }: { state: CodeSessionState; size?: number }) {
  const ink = useColor(STATE_TONE[state]);
  const bg = useColor("text-background");
  const svg = (children: ReactNode) => (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      {children}
    </Svg>
  );
  switch (state) {
    // A ring half filled: under way.
    case "running":
      return svg(
        <>
          <Circle cx="8" cy="8" r="6.25" fill="none" stroke={ink} strokeWidth="1.5" />
          <Path d="M8 4.5a3.5 3.5 0 0 1 0 7z" fill={ink} />
        </>,
      );
    // A question mark: something for you to answer (a ring and a dot is a GitHub issue).
    case "waiting":
      return svg(
        <>
          <Circle cx="8" cy="8" r="7" fill={ink} />
          <Path d="M6.2 6.3a1.85 1.85 0 1 1 2.6 1.7c-.5.25-.8.6-.8 1.1v.4" fill="none" stroke={bg} strokeWidth="1.5" strokeLinecap="round" />
          <Circle cx="8" cy="11.6" r="0.9" fill={bg} />
        </>,
      );
    // An empty ring: waits for an instruction.
    case "idle":
      return svg(<Circle cx="8" cy="8" r="6.25" fill="none" stroke={ink} strokeWidth="1.5" />);
    // A dashed ring: set aside, as Linear's backlog.
    case "parked":
      return svg(<Circle cx="8" cy="8" r="6.25" fill="none" stroke={ink} strokeWidth="1.5" strokeDasharray="2.2 2.2" />);
    case "finished":
      return svg(
        <>
          <Circle cx="8" cy="8" r="7" fill={ink} />
          <Path d="M5 8.2 7.1 10.2 11 6" fill="none" stroke={bg} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </>,
      );
    // GitHub's merge mark, in its violet.
    case "merged":
      return svg(
        <>
          <Circle cx="8" cy="8" r="7" fill={ink} />
          <Path d="M6 4.8v6.4M6 6.4c0 2.2 1.6 2.8 4 2.8" fill="none" stroke={bg} strokeWidth="1.3" strokeLinecap="round" />
          <Circle cx="6" cy="4.8" r="1.3" fill={bg} />
          <Circle cx="6" cy="11.2" r="1.3" fill={bg} />
          <Circle cx="10.4" cy="9.2" r="1.3" fill={bg} />
        </>,
      );
    // A stop square: stopped by someone, nothing went wrong.
    case "stopped":
      return svg(
        <>
          <Circle cx="8" cy="8" r="7" fill={ink} />
          <Rect x="5.5" y="5.5" width="5" height="5" rx="1" fill={bg} />
        </>,
      );
    // A cross: it failed.
    case "failed":
      return svg(
        <>
          <Circle cx="8" cy="8" r="7" fill={ink} />
          <Path d="m5.8 5.8 4.4 4.4m0-4.4-4.4 4.4" fill="none" stroke={bg} strokeWidth="1.6" strokeLinecap="round" />
        </>,
      );
  }
}

const BARS: Record<Exclude<CodePriority, "urgent" | "none">, { n: number; tone: string }> = {
  high: { n: 3, tone: "text-priority-high" },
  medium: { n: 2, tone: "text-priority-medium" },
  low: { n: 1, tone: "text-priority-low" },
};

const PRIORITY_TONE: Record<CodePriority, string> = {
  urgent: "text-priority-urgent",
  high: BARS.high.tone,
  medium: BARS.medium.tone,
  low: BARS.low.tone,
  none: "text-subtle",
};

export function CodePriorityIcon({ priority, size = 16 }: { priority: CodePriority; size?: number }) {
  const ink = useColor(PRIORITY_TONE[priority]);
  const bg = useColor("text-background");
  const border = useColor("text-border");
  if (priority === "urgent") {
    return (
      <Svg width={size} height={size} viewBox="0 0 16 16">
        <Rect x="1" y="1" width="14" height="14" rx="3.5" fill={ink} />
        <Rect x="7" y="3.5" width="2" height="6" rx="1" fill={bg} />
        <Rect x="7" y="10.5" width="2" height="2" rx="1" fill={bg} />
      </Svg>
    );
  }
  if (priority === "none") {
    return (
      <Svg width={size} height={size} viewBox="0 0 16 16">
        {[1.5, 6.5, 11.5].map((x) => (
          <Rect key={x} x={x} y="7.25" width="3" height="1.5" rx="0.75" fill={ink} />
        ))}
      </Svg>
    );
  }
  const { n } = BARS[priority];
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      {(
        [
          [1.5, 6],
          [6.5, 9],
          [11.5, 12],
        ] as const
      ).map(([x, h], i) => (
        <Rect key={x} x={x} y={14 - h} width="3" height={h} rx="1" fill={i < n ? ink : border} />
      ))}
    </Svg>
  );
}

/** An issue of GitHub, a ring and its dot, in the colour of the text it goes with (`className`: text-muted…). */
export function IssueIcon({ size = 14, className = "text-muted" }: { size?: number; className?: string }) {
  const ink = useColor(className);
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      <Circle cx="8" cy="8" r="6" fill="none" stroke={ink} strokeWidth="1.5" />
      <Circle cx="8" cy="8" r="1.75" fill={ink} />
    </Svg>
  );
}

/*
 * apps/web/src/components/Marks.tsx: the small marks of the Geist lists (Figma « Atelier · Théo »,
 * sections 5 to 8). A task's state as a 14 px circle, always in its colour; a priority as Linear draws
 * it in a list, three grey bars or a red square.
 */

/** To do: an empty ring; in progress: half filled, orange; done: filled, with a check. */
export function TaskStatusIcon({ status, size = 14 }: { status: TaskStatus; size?: number }) {
  const ink = useColor(status === "done" ? "text-state-merged" : status === "in_progress" ? "text-warning" : "text-muted");
  const bg = useColor("text-background");
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {status === "done" ? (
        <>
          <Circle cx="12" cy="12" r="10" fill={ink} />
          <Path d="m8 12.5 2.8 2.8L16.5 9.5" fill="none" stroke={bg} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <Circle cx="12" cy="12" r="9" fill="none" stroke={ink} strokeWidth="2" />
          {status === "in_progress" && <Path d="M12 7a5 5 0 0 1 0 10z" fill={ink} />}
        </>
      )}
    </Svg>
  );
}

/** A list row's priority: urgent, a red square with « ! »; high, medium (normal), low: grey bars lit from the left; none: three dashes. */
export function PriorityMark({ priority, size = 14 }: { priority: TaskPriority | CodePriority; size?: number }) {
  const urgent = useColor("text-priority-urgent");
  const lit = useColor("text-muted");
  const off = useColor("text-border");
  const none = useColor("text-subtle");
  const bg = useColor("text-background");
  if (priority === "urgent")
    return (
      <Svg width={size} height={size} viewBox="0 0 14 14">
        <Rect width="14" height="14" rx="3" fill={urgent} />
        <Path d="M7 3.5v4.2M7 10.2v.3" stroke={bg} strokeWidth="1.8" strokeLinecap="round" />
      </Svg>
    );
  const n = { high: 3, medium: 2, normal: 2, low: 1, none: 0 }[priority];
  return (
    <Svg width={size} height={size} viewBox="0 0 14 14">
      {[5, 8, 11].map((h, i) =>
        n === 0 ? (
          <Rect key={h} x={1.5 + i * 4.5} y={11} width={3} height={1.5} rx={0.75} fill={none} />
        ) : (
          <Rect key={h} x={1.5 + i * 4.5} y={12.5 - h} width={3} height={h} rx={0.75} fill={i < n ? lit : off} />
        ),
      )}
    </Svg>
  );
}

/** A thin progress bar (the web's tasks done over total): the track grey, what is done in violet. */
export function ProgressMark({ value, total }: { value: number; total: number }) {
  const track = useColor("text-surface-tertiary");
  const fill = useColor("text-state-merged");
  const ratio = total ? Math.min(1, value / total) : 0;
  return (
    <Svg width="100%" height={4} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: value }}>
      <Rect width="100%" height={4} rx={2} fill={track} />
      {ratio > 0 && <Rect width={`${ratio * 100}%`} height={4} rx={2} fill={fill} />}
    </Svg>
  );
}
