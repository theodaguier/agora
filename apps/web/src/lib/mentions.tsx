import { ALL_HANDLE } from "@agora/core";
import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { Mention } from "@/components/Mention";
import { TaskRef } from "@/components/TaskRef";
import { EntityText } from "@/components/TextEntities";
import { agentAccent } from "./agent-avatar";
import { splitTaskRefs } from "./task-refs";
import { withOffsets } from "./utils";
import type { AgentSummary, Person } from "./api";

/** Who a mention designates, to show their avatar and card. */
export type MentionTarget = { kind: "agent"; agent: AgentSummary } | { kind: "person"; person: Person & { handle: string } };

/** Mentionable bot (its name, avatar color) or colleague (their handle, brand color). */
export type Mentionable = { name: string; avatar: { color: string }; target?: MentionTarget };

/** "@all" in a group with several bots: the bots the message concerns answer. Brand color, no card. */
export const allMentionable: Mentionable = { name: ALL_HANDLE, avatar: { color: "var(--brand)" } };

type Segment = string | { name: string; color: string; text: string; target?: MentionTarget };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The color ends up in CSS: only hex colors and theme variables get through. */
const safeColor = (c: string) => (/^#[0-9a-f]{3,8}$/i.test(c) || /^var\(--[\w-]+\)$/.test(c) ? c : "currentColor");

// Built once per list (the field splits its text on every keystroke).
const regexes = new WeakMap<Mentionable[], RegExp | null>();

/** "@Name" not inside a word (an email) and followed by something other than a letter or digit; longest names first. */
function mentionRegex(list: Mentionable[]) {
  if (regexes.has(list)) return regexes.get(list)!;
  const names = [...new Set(list.map((m) => m.name))].sort((a, b) => b.length - a.length);
  const re = names.length ? new RegExp(`(?<![\\p{L}\\p{N}_.])@(${names.map(escape).join("|")})(?![\\p{L}\\p{N}_])`, "giu") : null;
  regexes.set(list, re);
  return re;
}

export function splitMentions(text: string, list: Mentionable[]): Segment[] {
  const re = text.includes("@") ? mentionRegex(list) : null;
  if (!re) return [text];
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const who = list.find((x) => x.name.toLowerCase() === m[1]!.toLowerCase())!;
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push({ name: who.name, color: safeColor(who.avatar.color), text: m[0], target: who.target });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * In a group, the bot a message calls (its first bot mention) dresses it: your bubble and the send
 * button take its colour, as in a conversation with that bot. Nothing when it calls no bot.
 */
export function addressedAccent(text: string, list: Mentionable[]): CSSProperties | undefined {
  // A bot: its target says so, or (the field's list) no target and a colour of its own; colleagues
  // have a person target and "@all" the brand variable.
  const bot = splitMentions(text, list).find(
    (s) => typeof s !== "string" && (s.target ? s.target.kind === "agent" : s.color.startsWith("#")),
  );
  if (typeof bot !== "object") return undefined;
  const color = bot.target?.kind === "agent" ? bot.target.agent.avatar.color : bot.color;
  return { "--primary": agentAccent(color), "--primary-foreground": "#fff" } as CSSProperties;
}

/**
 * Plain text with colored mentions, each with its avatar and hover card.
 * `flat`: color only, to overlay the input field character for character.
 */
export function MentionText({ text, mentionables, flat }: { text: string; mentionables: Mentionable[]; flat?: boolean }): ReactNode {
  if (!flat && text.includes("[[task:")) {
    return withOffsets(splitTaskRefs(text)).map(([key, s]) =>
      typeof s === "string" ? <MentionText key={key} text={s} mentionables={mentionables} /> : <TaskRef key={key} taskId={s.taskId} />,
    );
  }
  return withOffsets(splitMentions(text, mentionables)).map(([key, s]) =>
    typeof s === "string" ? (
      flat ? (
        s
      ) : (
        <EntityText key={key} text={s} />
      )
    ) : flat ? (
      <span key={key} className="text-brand">
        {s.text}
      </span>
    ) : (
      <Mention key={key} text={s.text} target={s.target} />
    ),
  );
}

/** Streamdown `span` override: turns the spans marked by rehypeMentions into mentions. */
export function mentionComponents(list: Mentionable[]) {
  return {
    span: ({ node: _node, ...props }: ComponentProps<"span"> & { node?: unknown }) => {
      const name = (props as { "data-mention"?: string })["data-mention"];
      const who = name ? list.find((m) => m.name.toLowerCase() === name) : undefined;
      if (!who) return <span {...props} />;
      return <Mention text={`@${who.name}`} color={safeColor(who.avatar.color)} target={who.target} />;
    },
  };
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

/** rehype plugin: wraps bots' "@Name" in a colored span, outside code and links. */
export function rehypeMentions(list: Mentionable[]) {
  return () => (tree: HastNode) => {
    const walk = (node: HastNode) => {
      if (!node.children || (node.tagName && SKIP.has(node.tagName))) return;
      node.children = node.children.flatMap((child): HastNode[] => {
        if (child.type !== "text" || !child.value?.includes("@")) {
          walk(child);
          return [child];
        }
        return splitMentions(child.value, list).map((s) =>
          typeof s === "string"
            ? { type: "text", value: s }
            : {
                type: "element",
                tagName: "span",
                properties: {
                  dataMention: s.name.toLowerCase(),
                  className: ["font-medium", "text-brand"],
                },
                children: [{ type: "text", value: s.text }],
              },
        );
      });
    };
    walk(tree);
  };
}

/**
 * A mention is plain blue medium text: no tinted tile, no avatar, and never the bot's own colour
 * (an agent's colour lives only in its orb).
 */
/** Blue (état/non-lu), never the bot's colour; white and underlined in your own bubble (index.css). */
export const mentionClass = "mention font-medium text-brand";

