import { splitEntities } from "./links";

/*
 * What a message's markdown becomes before and while Streamdown renders it:
 * paths turned into code (markdown would otherwise read "10.47.39@2x.png" as an email),
 * conversations quoted line by line turned into a "chat" block, quotes signed "— Author".
 */

/** "[10:47] Marie: …", "23/09/2026 10:47 - Marie : …", "[23/09/2026, 10:47:12] Marie: …". */
const TIMESTAMP = String.raw`\[?(?:\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4},?\s+)?\d{1,2}[:h]\d{2}(?::\d{2})?\]?`;
/** A speaker: a name of a few words, bold or not ("**Marie**:", "Marie :"). */
const SPEAKER = String.raw`(?:\*\*|__)?[\p{L}][\p{L}\p{N} ._'’-]{0,39}?(?:\*\*|__)?\s*:(?:\*\*|__)?\s+\S`;

const TIMED_LINE = new RegExp(String.raw`^${TIMESTAMP}\s*(?:[-–]\s*)?${SPEAKER}`, "u");
const SPEAKER_LINE = new RegExp(String.raw`^(?:${TIMESTAMP}\s*(?:[-–]\s*)?)?${SPEAKER}`, "u");
/** One line of a quoted conversation, split: time, speaker, text. */
export const CHAT_LINE = new RegExp(
  String.raw`^(?:(?<time>${TIMESTAMP})\s*(?:[-–]\s*)?)?(?:\*\*|__)?(?<who>[\p{L}][\p{L}\p{N} ._'’-]{0,39}?)(?:\*\*|__)?\s*:(?:\*\*|__)?\s+(?<text>.*)$`,
  "u",
);

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

/** A run of lines, quoted with ">" or timestamped, is a conversation when 2 of its lines have a speaker. */
function chatBlock(lines: string[], quoted: boolean): string[] | null {
  const body = quoted ? lines.map((l) => l.replace(/^\s{0,3}>\s?/, "")) : lines;
  const test = quoted ? SPEAKER_LINE : TIMED_LINE;
  const nonEmpty = body.filter((l) => l.trim());
  if (!nonEmpty.length || !test.test(nonEmpty[0]!)) return null;
  if (nonEmpty.filter((l) => test.test(l)).length < 2) return null;
  // Outside a quote, only timestamped lines belong to it.
  if (!quoted && nonEmpty.some((l) => !test.test(l))) return null;
  return ["```chat", ...nonEmpty, "```"];
}

/** Paths, file names and SSH repository addresses outside code become inline code, rendered as such; the quotes around them go. */
function wrapPaths(line: string): string {
  // Inline code is left as is: split on code spans, odd parts are code.
  return line
    .split(/(`+[^`]*`+)/)
    .map((part, i) => {
      if (i % 2) return part;
      // Paths become code; everything else stays as written.
      // "git@github.com:…" too: markdown would read its start as an email.
      const parts = splitEntities(part).map((p) =>
        typeof p === "string" ? p : p.kind === "path" || (p.kind === "file" && !p.url) || (p.kind === "repo" && p.text.startsWith("git@")) ? p : p.text,
      );
      for (let k = 0; k < parts.length; k++) {
        const p = parts[k]!;
        if (typeof p === "string") continue;
        const before = (parts[k - 1] as string | undefined) ?? "";
        const after = (parts[k + 1] as string | undefined) ?? "";
        // A markdown link's target, an autolink, or a path holding a backtick: left as is.
        if (p.text.includes("`") || /\]\($|<$/.test(before)) {
          parts[k] = p.text;
          continue;
        }
        const q = before.at(-1);
        if ((q === "'" || q === '"') && after[0] === q) {
          parts[k - 1] = before.slice(0, -1);
          parts[k + 1] = after.slice(1);
        }
        parts[k] = `\`${p.text}\``;
      }
      return parts.join("");
    })
    .join("");
}

/** The markdown of a message, ready for Streamdown. */
export function prepareMarkdown(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const open = FENCE.exec(line);
    if (fence) {
      out.push(line);
      if (open && open[1]!.startsWith(fence)) fence = null;
      continue;
    }
    if (open) {
      fence = open[1]!;
      out.push(line);
      continue;
    }
    // A quote block (consecutive ">" lines) or a run of timestamped lines.
    const quoted = /^\s{0,3}>/.test(line);
    if (quoted || TIMED_LINE.test(line)) {
      let j = i;
      while (j < lines.length && (quoted ? /^\s{0,3}>/.test(lines[j]!) : TIMED_LINE.test(lines[j]!))) j++;
      const chat = chatBlock(lines.slice(i, j), quoted);
      if (chat) {
        out.push(...chat);
        i = j - 1;
        continue;
      }
    }
    out.push(wrapPaths(line));
  }
  return out.join("\n");
}

type MdNode = { type: string; value?: string; children?: MdNode[] };

/**
 * remark plugin for messages written by people:
 * a line break is a line break (not a space), and HTML is shown as typed.
 */
export function remarkChat() {
  return (tree: MdNode) => {
    const walk = (node: MdNode) => {
      if (!node.children) return;
      node.children = node.children.flatMap((child): MdNode[] => {
        if (child.type === "html") return [{ type: "text", value: child.value ?? "" }];
        if (child.type === "text" && child.value?.includes("\n")) {
          return child.value.split("\n").flatMap((v, i): MdNode[] => [...(i ? [{ type: "break" }] : []), ...(v ? [{ type: "text", value: v }] : [])]);
        }
        walk(child);
        return [child];
      });
    };
    walk(tree);
  };
}

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

/** "— Victor Hugo", "-- Victor Hugo", "– Victor Hugo". */
const SIGNATURE = /^\s*(?:[—–―]|--?)\s*(?=\S)/;

/** The last line of a paragraph, when it signs the quote: removed from the paragraph and returned. */
function takeSignature(p: HastNode): HastNode[] | null {
  const kids = p.children ?? [];
  // The last line starts after the last <br>, or after the last "\n" of a text node.
  let start = kids.length;
  let head: HastNode | null = null;
  for (let k = kids.length - 1; k >= 0; k--) {
    const kid = kids[k]!;
    if (kid.type === "element" && kid.tagName === "br") break;
    if (kid.type === "text" && kid.value?.includes("\n")) {
      const cut = kid.value.lastIndexOf("\n");
      head = { type: "text", value: kid.value.slice(0, cut) };
      start = k;
      kids[k] = { type: "text", value: kid.value.slice(cut + 1) };
      break;
    }
    start = k;
  }
  const line = kids.slice(start);
  const first = line[0];
  if (first?.type !== "text" || !SIGNATURE.test(first.value ?? "")) {
    if (head) kids[start] = { type: "text", value: `${head.value}\n${kids[start]!.value}` };
    return null;
  }
  line[0] = { type: "text", value: first.value!.replace(SIGNATURE, "") };
  let keep = kids.slice(0, start);
  if (head?.value) keep.push(head);
  while (keep.length && keep.at(-1)!.type === "element" && keep.at(-1)!.tagName === "br") keep = keep.slice(0, -1);
  p.children = keep;
  return line;
}

/** rehype plugin: a quote whose last line starts with a dash is signed; it becomes a figure with its caption. */
export function rehypeQuotes() {
  return (tree: HastNode) => {
    const walk = (node: HastNode) => {
      node.children = node.children?.map((child) => {
        if (child.type !== "element") return child;
        if (child.tagName !== "blockquote") {
          walk(child);
          return child;
        }
        const paragraphs = (child.children ?? []).filter((c) => c.type === "element" && c.tagName === "p");
        const last = paragraphs.at(-1);
        const author = last && takeSignature(last);
        if (!author) return child;
        if (!last!.children?.length) child.children = child.children?.filter((c) => c !== last);
        return {
          type: "element",
          tagName: "figure",
          properties: { className: ["my-1", "flex", "flex-col", "gap-1.5"] },
          children: [
            { ...child, properties: { ...child.properties, className: ["my-0", "border-l-[3px]", "border-foreground/20", "pl-3", "italic"] } },
            { type: "element", tagName: "figcaption", properties: { className: ["pl-[15px]", "text-[13px]", "text-muted-foreground"] }, children: [{ type: "text", value: "— " }, ...author] },
          ],
        };
      });
    };
    walk(tree);
  };
}
