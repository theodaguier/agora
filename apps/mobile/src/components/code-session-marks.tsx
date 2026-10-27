import type { CodePriority, CodeSessionState } from "@agora/core";
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
  finished: "text-state-finished",
  merged: "text-state-merged",
  stopped: "text-state-neutral",
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
    // A ring with a dot: something for you to answer.
    case "waiting":
      return svg(
        <>
          <Circle cx="8" cy="8" r="6.25" fill="none" stroke={ink} strokeWidth="1.5" />
          <Circle cx="8" cy="8" r="3" fill={ink} />
        </>,
      );
    // An empty ring: waits for an instruction.
    case "idle":
      return svg(<Circle cx="8" cy="8" r="6.25" fill="none" stroke={ink} strokeWidth="1.5" />);
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
    case "stopped":
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
