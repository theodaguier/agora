import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import { TextSelection } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  BoldIcon,
  CopyIcon,
  GripIcon,
  HighlighterIcon,
  InlineCodeIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  ListTodoIcon,
  PlusIcon,
  RedoIcon,
  StrikeIcon,
  TableIcon,
  TrashIcon,
  UnderlineIcon,
  UndoIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";
import { defineMessages, useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { filterBlocks, useBlocks, type Block } from "./blocks";
import { buildExtensions, createSlashStore, runBlock, type SlashStore } from "./extensions";

const messages = defineMessages({
  en: {
    toolbar: "Formatting",
    style: "Text style",
    paragraph: "Text",
    heading: (level: number) => `Heading ${level}`,
    bold: "Bold",
    italic: "Italic",
    underline: "Underline",
    strike: "Strikethrough",
    code: "Inline code",
    color: "Colour",
    textColor: "Text colour",
    highlight: "Background",
    defaultColor: "Default",
    noHighlight: "None",
    bullets: "Bulleted list",
    numbers: "Numbered list",
    todo: "To-do list",
    align: "Alignment",
    left: "Left",
    center: "Centre",
    right: "Right",
    link: "Link",
    linkPlaceholder: "Paste or type a link",
    apply: "Apply",
    unlink: "Remove",
    undo: "Undo",
    redo: "Redo",
    insert: "Insert a block",
    blocks: "Blocks",
    noBlock: "No block found",
    write: "Write, or type “/” for blocks…",
    headingPlaceholder: (level: number) => `Heading ${level}`,
    summary: "Toggle title",
    handle: "Drag to move, click for options",
    addBelow: "Add a block below",
    turnInto: "Turn into",
    duplicate: "Duplicate",
    moveUp: "Move up",
    moveDown: "Move down",
    remove: "Delete",
    table: "Table",
    rowAbove: "Insert row above",
    rowBelow: "Insert row below",
    colLeft: "Insert column left",
    colRight: "Insert column right",
    headerRow: "Header row on/off",
    deleteRow: "Delete row",
    deleteCol: "Delete column",
    deleteTable: "Delete table",
  },
  fr: {
    toolbar: "Mise en forme",
    style: "Style du texte",
    paragraph: "Texte",
    heading: (level: number) => `Titre ${level}`,
    bold: "Gras",
    italic: "Italique",
    underline: "Souligné",
    strike: "Barré",
    code: "Code en ligne",
    color: "Couleur",
    textColor: "Couleur du texte",
    highlight: "Surlignage",
    defaultColor: "Par défaut",
    noHighlight: "Aucun",
    bullets: "Liste à puces",
    numbers: "Liste numérotée",
    todo: "Liste de tâches",
    align: "Alignement",
    left: "À gauche",
    center: "Centré",
    right: "À droite",
    link: "Lien",
    linkPlaceholder: "Colle ou tape un lien",
    apply: "Appliquer",
    unlink: "Retirer",
    undo: "Annuler",
    redo: "Rétablir",
    insert: "Insérer un bloc",
    blocks: "Blocs",
    noBlock: "Aucun bloc trouvé",
    write: "Écris, ou tape « / » pour insérer un bloc…",
    headingPlaceholder: (level: number) => `Titre ${level}`,
    summary: "Titre de la liste",
    handle: "Glisser pour déplacer, cliquer pour les options",
    addBelow: "Ajouter un bloc en dessous",
    turnInto: "Transformer en",
    duplicate: "Dupliquer",
    moveUp: "Monter",
    moveDown: "Descendre",
    remove: "Supprimer",
    table: "Tableau",
    rowAbove: "Insérer une ligne au-dessus",
    rowBelow: "Insérer une ligne en dessous",
    colLeft: "Insérer une colonne à gauche",
    colRight: "Insérer une colonne à droite",
    headerRow: "Ligne d'en-tête",
    deleteRow: "Supprimer la ligne",
    deleteCol: "Supprimer la colonne",
    deleteTable: "Supprimer le tableau",
  },
});

/** Notion's palette: readable on light and dark, the same hue for the text and its background. */
const COLORS = [
  { id: "gray", text: "#8a8a85", bg: "rgba(140,140,135,0.2)" },
  { id: "brown", text: "#a87358", bg: "rgba(168,115,88,0.2)" },
  { id: "orange", text: "#d9730d", bg: "rgba(217,115,13,0.2)" },
  { id: "yellow", text: "#c29226", bg: "rgba(223,171,1,0.25)" },
  { id: "green", text: "#448361", bg: "rgba(68,131,97,0.2)" },
  { id: "blue", text: "#337ea9", bg: "rgba(51,126,169,0.2)" },
  { id: "purple", text: "#9065b0", bg: "rgba(144,101,176,0.2)" },
  { id: "pink", text: "#c14c8a", bg: "rgba(193,76,138,0.2)" },
  { id: "red", text: "#d44c47", bg: "rgba(212,76,71,0.2)" },
];

/** What the editor opens with: Markdown (a .md file, a profile), HTML (a Word document read), or plain text. */
export type EditorContentInput = { markdown: string } | { html: string } | { text: string };

/**
 * A real text editor, Notion-like: "/" for blocks (headings, lists, to-dos, toggles, callouts,
 * code, tables…), a handle on each block to move, turn or duplicate it, a bar over the selection,
 * the Markdown shortcuts people know, colours, alignment, undo. `plain` keeps only the text, for
 * a .txt file. `onChange` hands back the editor; the caller reads what it needs (Markdown, JSON, text).
 */
export function RichTextEditor({
  initial,
  onChange,
  plain,
  label,
  toolbarEnd,
  className,
  contentClassName,
}: {
  initial: EditorContentInput;
  onChange?: (editor: Editor) => void;
  plain?: boolean;
  /** Its accessible name, as a field's label. */
  label?: string;
  /** Actions at the end of the toolbar. */
  toolbarEnd?: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const t = useT(messages);
  const blocks = useBlocks();
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const store = useMemo(createSlashStore, []);
  // Built once: new extensions on a render would reconfigure the editor, and lose its history.
  const extensions = useMemo(
    () =>
      buildExtensions({
        plain,
        placeholders: { text: t.write, heading: t.headingPlaceholder, summary: t.summary },
        slash: plain ? undefined : { store, items: (q) => filterBlocks(blocksRef.current, q) },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plain, store],
  );
  const editor = useEditor(
    {
      extensions,
      content: "markdown" in initial ? initial.markdown : "html" in initial ? initial.html : textToHtml(initial.text),
      contentType: "markdown" in initial ? "markdown" : "html",
      editorProps: { attributes: { class: cn("rich-text outline-none", contentClassName), ...(label && { "aria-label": label }), "aria-multiline": "true", role: "textbox" } },
      onCreate: ({ editor }) => repair(editor),
      onUpdate: ({ editor }) => onChangeRef.current?.(editor),
    },
    [extensions],
  );
  const frame = useRef<HTMLDivElement>(null);

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <Toolbar editor={editor} plain={plain} end={toolbarEnd} />
      <div ref={frame} className="relative flex min-h-0 flex-1 flex-col">
        <EditorContent editor={editor} className="min-h-0 flex-1 cursor-text overflow-y-auto" onClick={(e) => e.target === e.currentTarget && editor.chain().focus("end").run()} />
        {!plain && (
          <>
            <SlashMenu store={store} frame={frame} />
            <BlockHandle editor={editor} />
            <SelectionBar editor={editor} />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Fills what a file left invalid (an empty toggle, a list item without text): ProseMirror refuses,
 * without a word, to insert anything into a document that breaks its own rules. Not undoable.
 */
function repair(editor: Editor) {
  const { doc, tr } = editor.state;
  doc.descendants((node, pos) => {
    if (node.isText || node.type.validContent(node.content)) return true;
    const fixed = node.type.createAndFill(node.attrs, node.content, node.marks) ?? node.type.createAndFill(node.attrs);
    if (fixed) tr.replaceWith(tr.mapping.map(pos), tr.mapping.map(pos + node.nodeSize), fixed);
    return false;
  });
  if (tr.docChanged) editor.view.dispatch(tr.setMeta("addToHistory", false));
}

/** Plain text as paragraphs, a blank line between them, single line breaks kept. */
function textToHtml(text: string) {
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((p) => `<p>${escape(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** A .txt file's text back: paragraphs separated by a blank line. */
export const editorText = (editor: Editor) => editor.getText({ blockSeparator: "\n\n" });

const STYLES = ["paragraph", "1", "2", "3"] as const;

/** The marks and block kind at the cursor, for the bars' pressed states. */
function useMarks(editor: Editor) {
  return useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      style: e.isActive("heading", { level: 1 }) ? "1" : e.isActive("heading", { level: 2 }) ? "2" : e.isActive("heading", { level: 3 }) ? "3" : "paragraph",
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      bullets: e.isActive("bulletList"),
      numbers: e.isActive("orderedList"),
      todo: e.isActive("taskList"),
      link: e.isActive("link"),
      table: e.isActive("table"),
      align: e.isActive({ textAlign: "center" }) ? "center" : e.isActive({ textAlign: "right" }) ? "right" : "left",
      color: (e.getAttributes("textStyle").color as string | undefined) ?? null,
      highlight: (e.getAttributes("highlight").color as string | undefined) ?? null,
      undo: e.can().undo(),
      redo: e.can().redo(),
    }),
  });
}

function MarkToggle({ pressed, label, onPress, children }: { pressed: boolean; label: string; onPress: () => void; children: ReactNode }) {
  return (
    <Toggle size="sm" aria-label={label} title={label} pressed={pressed} onPressedChange={onPress}>
      {children}
    </Toggle>
  );
}

const Divider = () => <Separator orientation="vertical" className="mx-1 h-5 self-center" />;

function Toolbar({ editor, plain, end }: { editor: Editor; plain?: boolean; end?: ReactNode }) {
  const t = useT(messages);
  const blocks = useBlocks();
  const s = useMarks(editor);
  const chain = () => editor.chain().focus();
  const styleLabel = (v: string) => (v === "paragraph" ? t.paragraph : t.heading(Number(v)));
  const AlignIcon = s.align === "center" ? AlignCenterIcon : s.align === "right" ? AlignRightIcon : AlignLeftIcon;

  return (
    <div role="toolbar" aria-label={t.toolbar} className="flex shrink-0 flex-wrap items-center gap-0.5 border-b px-2 py-1.5">
      <Button variant="ghost" size="icon-sm" aria-label={t.undo} title={`${t.undo} (⌘Z)`} disabled={!s.undo} onClick={() => chain().undo().run()}>
        <UndoIcon />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label={t.redo} title={`${t.redo} (⇧⌘Z)`} disabled={!s.redo} onClick={() => chain().redo().run()}>
        <RedoIcon />
      </Button>
      {!plain && (
        <>
          <Divider />
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t.insert} title={t.insert} />}>
              <PlusIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>{t.blocks}</DropdownMenuLabel>
                {blocks.map((b) => (
                  <DropdownMenuItem key={b.id} onClick={() => insertBlockBelowCursor(editor, b)}>
                    {b.icon}
                    {b.label}
                    {b.hint && <span className="ml-auto font-mono text-xs text-muted-foreground">{b.hint}</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Select
            items={STYLES.map((v) => ({ value: v, label: styleLabel(v) }))}
            value={s.style}
            onValueChange={(v) => (v === "paragraph" ? chain().setParagraph().run() : v && chain().setHeading({ level: Number(v) as 1 | 2 | 3 }).run())}
          >
            <SelectTrigger size="sm" aria-label={t.style} className="w-28 border-transparent shadow-none dark:bg-transparent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} align="start">
              {STYLES.map((v) => (
                <SelectItem key={v} value={v} className={cn(v === "1" && "text-lg font-semibold", v === "2" && "text-base font-semibold", v === "3" && "font-semibold")}>
                  {styleLabel(v)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Divider />
          <MarkButtons editor={editor} />
          <Divider />
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t.align} title={t.align} />}>
              <AlignIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              <DropdownMenuItem onClick={() => chain().setTextAlign("left").run()}>
                <AlignLeftIcon />
                {t.left}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => chain().setTextAlign("center").run()}>
                <AlignCenterIcon />
                {t.center}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => chain().setTextAlign("right").run()}>
                <AlignRightIcon />
                {t.right}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <MarkToggle pressed={s.bullets} label={t.bullets} onPress={() => chain().toggleBulletList().run()}>
            <ListIcon />
          </MarkToggle>
          <MarkToggle pressed={s.numbers} label={t.numbers} onPress={() => chain().toggleOrderedList().run()}>
            <ListOrderedIcon />
          </MarkToggle>
          <MarkToggle pressed={s.todo} label={t.todo} onPress={() => chain().toggleTaskList().run()}>
            <ListTodoIcon />
          </MarkToggle>
          {s.table && <TableMenu editor={editor} />}
        </>
      )}
      {end && <div className="ml-auto flex items-center gap-1">{end}</div>}
    </div>
  );
}

/** Bold to link: in the toolbar and over the selection. */
function MarkButtons({ editor }: { editor: Editor }) {
  const t = useT(messages);
  const s = useMarks(editor);
  const chain = () => editor.chain().focus();
  return (
    <>
      <MarkToggle pressed={s.bold} label={`${t.bold} (⌘B)`} onPress={() => chain().toggleBold().run()}>
        <BoldIcon />
      </MarkToggle>
      <MarkToggle pressed={s.italic} label={`${t.italic} (⌘I)`} onPress={() => chain().toggleItalic().run()}>
        <ItalicIcon />
      </MarkToggle>
      <MarkToggle pressed={s.underline} label={`${t.underline} (⌘U)`} onPress={() => chain().toggleUnderline().run()}>
        <UnderlineIcon />
      </MarkToggle>
      <MarkToggle pressed={s.strike} label={t.strike} onPress={() => chain().toggleStrike().run()}>
        <StrikeIcon />
      </MarkToggle>
      <MarkToggle pressed={s.code} label={t.code} onPress={() => chain().toggleCode().run()}>
        <InlineCodeIcon />
      </MarkToggle>
      <ColorButton editor={editor} color={s.color} highlight={s.highlight} />
      <LinkButton editor={editor} active={s.link} />
    </>
  );
}

/** Text colour and background, Notion's palette, in one popover. */
function ColorButton({ editor, color, highlight }: { editor: Editor; color: string | null; highlight: string | null }) {
  const t = useT(messages);
  const swatch = "flex size-7 items-center justify-center rounded-md border text-sm font-semibold outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50";
  return (
    <Popover>
      <PopoverTrigger render={<Toggle size="sm" aria-label={t.color} title={t.color} pressed={!!color || !!highlight} />}>
        <HighlighterIcon style={color ? { color } : undefined} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto gap-2 p-3">
        <p className="text-xs font-medium text-muted-foreground">{t.textColor}</p>
        <div className="grid grid-cols-5 gap-1.5">
          <button type="button" title={t.defaultColor} aria-label={t.defaultColor} className={cn(swatch, !color && "ring-2 ring-ring")} onClick={() => editor.chain().focus().unsetColor().run()}>
            A
          </button>
          {COLORS.map((c) => (
            <button key={c.id} type="button" title={c.id} aria-label={c.id} className={cn(swatch, color === c.text && "ring-2 ring-ring")} style={{ color: c.text }} onClick={() => editor.chain().focus().setColor(c.text).run()}>
              A
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs font-medium text-muted-foreground">{t.highlight}</p>
        <div className="grid grid-cols-5 gap-1.5">
          <button type="button" title={t.noHighlight} aria-label={t.noHighlight} className={cn(swatch, !highlight && "ring-2 ring-ring")} onClick={() => editor.chain().focus().unsetHighlight().run()} />
          {COLORS.map((c) => (
            <button key={c.id} type="button" title={c.id} aria-label={c.id} className={cn(swatch, highlight === c.bg && "ring-2 ring-ring")} style={{ background: c.bg }} onClick={() => editor.chain().focus().setHighlight({ color: c.bg }).run()} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** A link on the selection: its address in a small popover, as Docs does. */
function LinkButton({ editor, active }: { editor: Editor; active: boolean }) {
  const t = useT(messages);
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState("");
  const apply = () => {
    const url = href.trim();
    const chain = editor.chain().focus().extendMarkRange("link");
    (url ? chain.setLink({ href: /^[a-z][\w+.-]*:/i.test(url) ? url : `https://${url}` }) : chain.unsetLink()).run();
    setOpen(false);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setHref((editor.getAttributes("link").href as string | undefined) ?? "");
        setOpen(next);
      }}
    >
      <PopoverTrigger render={<Toggle size="sm" aria-label={t.link} title={`${t.link} (⌘K)`} pressed={active || open} />}>
        <LinkIcon />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          <Input autoFocus type="text" inputMode="url" aria-label={t.link} placeholder={t.linkPlaceholder} value={href} onChange={(e) => setHref(e.target.value)} />
          {active && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                editor.chain().focus().extendMarkRange("link").unsetLink().run();
                setOpen(false);
              }}
            >
              {t.unlink}
            </Button>
          )}
          <Button type="submit" size="sm">
            {t.apply}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/** Rows and columns of the table at the cursor. */
function TableMenu({ editor }: { editor: Editor }) {
  const t = useT(messages);
  const chain = () => editor.chain().focus();
  return (
    <>
      <Divider />
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
          {t.table}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuItem onClick={() => chain().addRowBefore().run()}>{t.rowAbove}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => chain().addRowAfter().run()}>{t.rowBelow}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => chain().addColumnBefore().run()}>{t.colLeft}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => chain().addColumnAfter().run()}>{t.colRight}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => chain().toggleHeaderRow().run()}>{t.headerRow}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => chain().deleteRow().run()}>
            {t.deleteRow}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => chain().deleteColumn().run()}>
            {t.deleteCol}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => chain().deleteTable().run()}>
            <TableIcon />
            {t.deleteTable}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

/** A block from the toolbar's "+": below the block at the cursor, unless that one is empty. */
function insertBlockBelowCursor(editor: Editor, block: Block) {
  const { $from } = editor.state.selection;
  const top = $from.depth >= 1 ? $from.before(1) : 0;
  const node = editor.state.doc.nodeAt(top);
  if (!node || (node.type.name === "paragraph" && node.content.size === 0)) return runBlock(editor, block);
  const at = top + node.nodeSize;
  editor.chain().insertContentAt(at, { type: "paragraph" }).setTextSelection(at + 1).run();
  runBlock(editor, block);
}

/** The "/" menu, under the cursor. */
function SlashMenu({ store, frame }: { store: SlashStore; frame: RefObject<HTMLDivElement | null> }) {
  const t = useT(messages);
  const state = useSyncExternalStore(store.subscribe, store.get);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.querySelector("[data-active=true]")?.scrollIntoView({ block: "nearest" });
  }, [state?.index]);
  if (!state || !frame.current) return null;
  const rect = state.props.clientRect?.();
  if (!rect) return null;
  const box = frame.current.getBoundingClientRect();
  // Below the "/", or above it when the frame has no room left underneath.
  const below = box.bottom - rect.bottom > 300;
  const style = { left: Math.min(rect.left - box.left, box.width - 288), ...(below ? { top: rect.bottom - box.top + 6 } : { bottom: box.bottom - rect.top + 6 }) };
  return (
    <div
      ref={list}
      role="listbox"
      aria-label={t.blocks}
      style={style}
      className="absolute z-50 max-h-72 w-72 overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
      // Clicking the menu must not take the cursor out of the text.
      onMouseDown={(e) => e.preventDefault()}
    >
      <p className="px-1.5 py-1 text-xs font-medium text-muted-foreground">{t.blocks}</p>
      {state.props.items.length === 0 && <p className="px-1.5 py-1.5 text-sm text-muted-foreground">{t.noBlock}</p>}
      {state.props.items.map((b, i) => (
        <div
          key={b.id}
          role="option"
          aria-selected={i === state.index}
          data-active={i === state.index}
          onMouseEnter={() => store.pick(i)}
          onClick={() => state.props.command(b)}
          className="flex cursor-default items-center gap-2 rounded-md px-1.5 py-1 text-sm select-none data-[active=true]:bg-accent data-[active=true]:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0"
        >
          {b.icon}
          {b.label}
          {b.hint && <span className="ml-auto font-mono text-xs text-muted-foreground">{b.hint}</span>}
        </div>
      ))}
    </div>
  );
}

/** The handle on the left of each block, as in Notion: "+" adds one below, the grip moves it or opens its menu. */
function BlockHandle({ editor }: { editor: Editor }) {
  const t = useT(messages);
  const blocks = useBlocks();
  const current = useRef<{ node: PMNode; pos: number } | null>(null);
  const [menu, setMenu] = useState(false);
  const menuOpen = useRef(false);

  /** Puts the cursor over the whole block, so a command applies to all of it. */
  const selectBlock = () => {
    const c = current.current;
    if (!c) return false;
    const { doc } = editor.state;
    const from = TextSelection.near(doc.resolve(c.pos + 1));
    const to = TextSelection.near(doc.resolve(c.pos + c.node.nodeSize - 1), -1);
    editor.chain().focus().command(({ tr }) => {
      tr.setSelection(TextSelection.between(from.$from, to.$to));
      return true;
    }).run();
    return true;
  };

  const addBelow = () => {
    const c = current.current;
    if (!c) return;
    if (c.node.type.name === "paragraph" && c.node.content.size === 0) {
      editor.chain().focus().setTextSelection(c.pos + 1).insertContent("/").run();
      return;
    }
    const at = c.pos + c.node.nodeSize;
    editor.chain().focus().insertContentAt(at, { type: "paragraph" }).setTextSelection(at + 1).insertContent("/").run();
  };

  const move = (dir: -1 | 1) => {
    const c = current.current;
    if (!c) return;
    const { doc } = editor.state;
    const $pos = doc.resolve(c.pos);
    const index = $pos.index();
    const parent = $pos.parent;
    const target = index + dir;
    if (target < 0 || target >= parent.childCount) return;
    const sibling = parent.child(target);
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        if (dir === -1) {
          const at = c.pos - sibling.nodeSize;
          tr.delete(c.pos, c.pos + c.node.nodeSize).insert(at, c.node);
          tr.setSelection(TextSelection.near(tr.doc.resolve(at + 1)));
        } else {
          const end = c.pos + c.node.nodeSize;
          tr.delete(end, end + sibling.nodeSize).insert(c.pos, sibling);
          const at = c.pos + sibling.nodeSize;
          tr.setSelection(TextSelection.near(tr.doc.resolve(at + 1)));
        }
        return true;
      })
      .run();
  };

  const duplicate = () => {
    const c = current.current;
    if (c) editor.chain().focus().insertContentAt(c.pos + c.node.nodeSize, c.node.toJSON()).run();
  };
  const remove = () => {
    const c = current.current;
    if (c) editor.chain().focus().deleteRange({ from: c.pos, to: c.pos + c.node.nodeSize }).run();
  };

  return (
    <DragHandle
      editor={editor}
      onNodeChange={({ node, pos }) => {
        // The last block hovered, kept while its menu is open (the pointer leaves it to reach the menu).
        if (node && !menuOpen.current) current.current = { node, pos };
      }}
      className="flex items-center pr-1"
    >
      <button
        type="button"
        aria-label={t.addBelow}
        title={t.addBelow}
        onClick={addBelow}
        className="flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground [&_svg]:size-4"
      >
        <PlusIcon />
      </button>
      <DropdownMenu
        open={menu}
        onOpenChange={(open) => {
          setMenu(open);
          menuOpen.current = open;
          // The handle stays on its block while the menu is open.
          editor.commands.setMeta("lockDragHandle", open);
        }}
      >
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={t.handle}
              title={t.handle}
              className="flex h-6 w-5 cursor-grab items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground active:cursor-grabbing [&_svg]:size-4"
            />
          }
        >
          <GripIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="left" align="start" className="w-56">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>{t.turnInto}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-52">
              {blocks
                .filter((b) => b.turnInto)
                .map((b) => (
                  <DropdownMenuItem key={b.id} onClick={() => selectBlock() && runBlock(editor, b)}>
                    {b.icon}
                    {b.label}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={duplicate}>
            <CopyIcon />
            {t.duplicate}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => move(-1)}>
            <ArrowUpIcon />
            {t.moveUp}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => move(1)}>
            <ArrowDownIcon />
            {t.moveDown}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={remove}>
            <TrashIcon />
            {t.remove}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </DragHandle>
  );
}

/** Over a selection of text: its marks, colour and link, as Notion and Medium show them. */
function SelectionBar({ editor }: { editor: Editor }) {
  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: "top", offset: 8 }}
      // Stays up while its colour or link popover has the focus.
      shouldShow={({ editor: e, state }) => e.isEditable && !state.selection.empty && state.selection instanceof TextSelection && !e.isActive("codeBlock")}
      className="z-40 flex items-center gap-0.5 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
    >
      <MarkButtons editor={editor} />
    </BubbleMenu>
  );
}
