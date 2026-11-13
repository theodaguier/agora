import { Extension, Node, createBlockMarkdownSpec, mergeAttributes, type Editor, type Range } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details";
import { Highlight } from "@tiptap/extension-highlight";
import { TextAlign } from "@tiptap/extension-text-align";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { Typography } from "@tiptap/extension-typography";
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";
import type { Block } from "./blocks";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: { setCallout: () => ReturnType };
  }
}

/** A Notion callout: a tinted box holding blocks. */
export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  parseHTML: () => [{ tag: "div[data-callout]" }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-callout": "", class: "callout" }), 0],
  // ":::callout … :::" in Markdown, the directive syntax toggles use too: it reads back as a callout.
  ...createBlockMarkdownSpec({ nodeName: "callout" }),
  addCommands() {
    return { setCallout: () => ({ commands }) => commands.wrapIn(this.name) };
  },
});


/** What the slash menu shows: the suggestion in progress, which item is picked, whether Escape closed it. */
export type SlashState = { props: SuggestionProps<Block, Block>; index: number } | null;

/** A tiny store between the editor's suggestion plugin and the React menu. */
export function createSlashStore() {
  let state: SlashState = null;
  const listeners = new Set<() => void>();
  const set = (next: SlashState) => {
    state = next;
    listeners.forEach((l) => l());
  };
  return {
    get: () => state,
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    open: (props: SuggestionProps<Block, Block>) => set({ props, index: state && state.props.query === props.query ? Math.min(state.index, Math.max(0, props.items.length - 1)) : 0 }),
    close: () => set(null),
    pick: (index: number) => state && set({ ...state, index }),
    key: ({ event }: SuggestionKeyDownProps) => {
      if (!state) return false;
      const n = state.props.items.length;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (!n) return true;
        set({ ...state, index: (state.index + (event.key === "ArrowDown" ? 1 : n - 1)) % n });
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const item = state.props.items[state.index];
        if (!item) return false;
        state.props.command(item);
        return true;
      }
      if (event.key === "Escape") {
        // Only the menu closes, not the dialog the editor is in.
        event.stopPropagation();
        set(null);
        return true;
      }
      return false;
    },
  };
}
export type SlashStore = ReturnType<typeof createSlashStore>;

/** "/" opens the block menu, as in Notion; what follows filters it. */
const SlashCommand = Extension.create<{ store: SlashStore | null; items: (query: string) => Block[] }>({
  name: "slashCommand",
  addOptions: () => ({ store: null, items: () => [] }),
  addProseMirrorPlugins() {
    const { store, items } = this.options;
    if (!store) return [];
    return [
      Suggestion<Block, Block>({
        editor: this.editor,
        char: "/",
        allowSpaces: false,
        // Not inside code, where "/" is just a character.
        allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
        items: ({ query }) => items(query),
        command: ({ editor, range, props }) => runBlock(editor, props, range),
        render: () => ({
          onStart: (p) => store.open(p),
          onUpdate: (p) => store.open(p),
          onKeyDown: (p) => store.key(p),
          onExit: () => store.close(),
        }),
      }),
    ];
  },
});

/** Runs a block's command where the "/" was typed, the "/query" removed first. */
export function runBlock(editor: Editor, block: Block, range?: Range) {
  const chain = editor.chain().focus();
  block.run(range ? chain.deleteRange(range) : chain).run();
}

/** Every extension, once per editor: rebuilding them on each render would reset it. */
export type Placeholders = { text: string; heading: (level: number) => string; summary: string };

export function buildExtensions({ plain, placeholders, slash }: { plain?: boolean; placeholders: Placeholders; slash?: { store: SlashStore; items: (q: string) => Block[] } }) {
  if (plain)
    return [
      StarterKit.configure({
        bold: false,
        italic: false,
        underline: false,
        strike: false,
        code: false,
        codeBlock: false,
        heading: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
        horizontalRule: false,
        link: false,
      }),
      Placeholder.configure({ placeholder: placeholders.text }),
    ];
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      dropcursor: { color: "var(--primary)", width: 2 },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: true, HTMLAttributes: { class: "rich-table" } } }),
    Details.configure({ persist: true, HTMLAttributes: { class: "details" } }),
    DetailsSummary,
    DetailsContent,
    Callout,
    Highlight.configure({ multicolor: true }),
    TextStyle,
    Color,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    // Arrows, ellipses, dashes; quotes stay as typed (French and English disagree on them).
    Typography.configure({ openDoubleQuote: false, closeDoubleQuote: false, openSingleQuote: false, closeSingleQuote: false }),
    Placeholder.configure({
      includeChildren: true,
      placeholder: ({ node }) => (node.type.name === "heading" ? placeholders.heading(node.attrs.level as number) : node.type.name === "detailsSummary" ? placeholders.summary : placeholders.text),
    }),
    Markdown,
    ...(slash ? [SlashCommand.configure(slash)] : []),
  ];
}
