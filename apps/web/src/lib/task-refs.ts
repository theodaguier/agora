/** A task cited by a bot: "[[task:<id>]]", shown with its title and status. */
const TASK_REF = /\[\[task:([\w-]{1,64})\]\]/g;

export type TaskRefSegment = string | { taskId: string };

export function splitTaskRefs(text: string): TaskRefSegment[] {
  if (!text.includes("[[task:")) return [text];
  const out: TaskRefSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(TASK_REF)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push({ taskId: m[1]! });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/* ---------- Markdown (Streamdown) ---------- */

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

const SKIP = new Set(["code", "pre", "a"]);

/** rehype plugin: turns "[[task:<id>]]" into a span marked `data-task`, outside code and links. */
export function rehypeTaskRefs() {
  return (tree: HastNode) => {
    const walk = (node: HastNode) => {
      if (!node.children || (node.tagName && SKIP.has(node.tagName))) return;
      // The brackets can come out of the markdown parser as several text nodes: rejoin them first.
      const merged: HastNode[] = [];
      for (const child of node.children) {
        const prev = merged.at(-1);
        if (child.type === "text" && prev?.type === "text") prev.value = (prev.value ?? "") + (child.value ?? "");
        else merged.push(child.type === "text" ? { ...child } : child);
      }
      node.children = merged.flatMap((child): HastNode[] => {
        if (child.type !== "text" || !child.value?.includes("[[task:")) {
          walk(child);
          return [child];
        }
        return splitTaskRefs(child.value).map((s) =>
          typeof s === "string" ? { type: "text", value: s } : { type: "element", tagName: "span", properties: { dataTask: s.taskId }, children: [] },
        );
      });
    };
    walk(tree);
  };
}
