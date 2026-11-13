import type { ChainedCommands } from "@tiptap/core";
import type { ReactNode } from "react";
import {
  CalloutIcon,
  CodeBlockIcon,
  DividerIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ListIcon,
  ListOrderedIcon,
  ListTodoIcon,
  QuoteIcon,
  TableIcon,
  TextIcon,
  ToggleListIcon,
} from "@/components/icons";
import { defineMessages, useT } from "@/i18n";

/** A kind of block, as Notion's "/" menu lists them. `turnInto`: a block an existing one can become. */
export type Block = {
  id: string;
  label: string;
  /** The Markdown shortcut that makes it while typing. */
  hint?: string;
  keywords: string;
  icon: ReactNode;
  turnInto?: boolean;
  /** Is the block at the cursor of this kind (the menu's check). */
  active?: string;
  run: (chain: ChainedCommands) => ChainedCommands;
};

export const blockMessages = defineMessages({
  en: {
    text: "Text",
    h1: "Heading 1",
    h2: "Heading 2",
    h3: "Heading 3",
    bullets: "Bulleted list",
    numbers: "Numbered list",
    todo: "To-do list",
    toggle: "Toggle list",
    quote: "Quote",
    callout: "Callout",
    code: "Code",
    divider: "Divider",
    table: "Table",
  },
  fr: {
    text: "Texte",
    h1: "Titre 1",
    h2: "Titre 2",
    h3: "Titre 3",
    bullets: "Liste à puces",
    numbers: "Liste numérotée",
    todo: "Liste de tâches",
    toggle: "Liste dépliante",
    quote: "Citation",
    callout: "Encadré",
    code: "Code",
    divider: "Séparateur",
    table: "Tableau",
  },
});

/** Every block, in Notion's order. */
export function useBlocks(): Block[] {
  const t = useT(blockMessages);
  return [
    { id: "text", label: t.text, keywords: "text texte paragraph paragraphe normal", icon: <TextIcon />, turnInto: true, active: "paragraph", run: (c) => c.clearNodes() },
    { id: "h1", label: t.h1, hint: "#", keywords: "heading title titre h1", icon: <Heading1Icon />, turnInto: true, active: "h1", run: (c) => c.clearNodes().setHeading({ level: 1 }) },
    { id: "h2", label: t.h2, hint: "##", keywords: "heading title titre h2 sous-titre", icon: <Heading2Icon />, turnInto: true, active: "h2", run: (c) => c.clearNodes().setHeading({ level: 2 }) },
    { id: "h3", label: t.h3, hint: "###", keywords: "heading title titre h3", icon: <Heading3Icon />, turnInto: true, active: "h3", run: (c) => c.clearNodes().setHeading({ level: 3 }) },
    { id: "bullets", label: t.bullets, hint: "-", keywords: "bullet list liste puces ul", icon: <ListIcon />, turnInto: true, active: "bulletList", run: (c) => c.clearNodes().toggleBulletList() },
    { id: "numbers", label: t.numbers, hint: "1.", keywords: "numbered ordered list liste numérotée ol", icon: <ListOrderedIcon />, turnInto: true, active: "orderedList", run: (c) => c.clearNodes().toggleOrderedList() },
    { id: "todo", label: t.todo, hint: "[]", keywords: "todo task check checkbox tâche case cocher", icon: <ListTodoIcon />, turnInto: true, active: "taskList", run: (c) => c.clearNodes().toggleTaskList() },
    { id: "toggle", label: t.toggle, keywords: "toggle details dépliante accordéon replier", icon: <ToggleListIcon />, run: (c) => c.setDetails() },
    { id: "quote", label: t.quote, hint: ">", keywords: "quote citation blockquote", icon: <QuoteIcon />, turnInto: true, active: "blockquote", run: (c) => c.clearNodes().toggleBlockquote() },
    { id: "callout", label: t.callout, keywords: "callout encadré note info astuce", icon: <CalloutIcon />, turnInto: true, active: "callout", run: (c) => c.clearNodes().setCallout() },
    { id: "code", label: t.code, hint: "```", keywords: "code snippet bloc", icon: <CodeBlockIcon />, turnInto: true, active: "codeBlock", run: (c) => c.clearNodes().toggleCodeBlock() },
    { id: "divider", label: t.divider, hint: "---", keywords: "divider separator séparateur ligne hr", icon: <DividerIcon />, run: (c) => c.setHorizontalRule() },
    { id: "table", label: t.table, keywords: "table tableau grille", icon: <TableIcon />, run: (c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }) },
  ];
}

/** Without accents or case: "numerotee" finds « numérotée ». */
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function filterBlocks(blocks: Block[], query: string) {
  const q = fold(query.trim());
  if (!q) return blocks;
  return blocks.filter((b) => fold(`${b.label} ${b.keywords}`).includes(q));
}
