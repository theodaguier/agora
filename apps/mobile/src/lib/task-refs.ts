/* apps/web/src/lib/task-refs.ts; the rehype plugin has no equivalent here: MessageText splits its text leaves itself. */

import { matchAll } from "./utils";

/** A task cited by a bot: "[[task:<id>]]", shown with its title and status. */
const TASK_REF = /\[\[task:([\w-]{1,64})\]\]/g;

export type TaskRefSegment = string | { taskId: string };

export function splitTaskRefs(text: string): TaskRefSegment[] {
  if (!text.includes("[[task:")) return [text];
  const out: TaskRefSegment[] = [];
  let last = 0;
  for (const m of matchAll(text, TASK_REF)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push({ taskId: m[1]! });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
