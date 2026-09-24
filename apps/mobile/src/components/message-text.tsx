import * as Clipboard from "expo-clipboard";
import type { Blockquote, Code, Heading, List, ListItem, Nodes, PhrasingContent, Root, RootContent, Table } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import { Button, Chip, Separator, Surface, Typography, useToast } from "heroui-native";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { ScrollView, Share, View } from "react-native";
import remend from "remend";
import { CopyIcon, DownloadIcon, type IconComponent } from "@/components/icons";
import { MentionText } from "@/components/mention";
import { FileChip, InlineBox, PathChip, PortChip, RepoChip, Swatch, Text, TextLink, TextStyle, useEm } from "@/components/text-entities";
import { boxText, cx, LinkClassContext, OnAccentContext } from "@/components/text-style";
import { CHAT_LINE, prepareMarkdown, remarkChat, signedQuote } from "@/lib/chat-markdown";
import { haptic } from "@/lib/haptics";
import { defineMessages } from "@/lib/i18n";
import { asFile, asPath, fileOfUrl, linkLabel, parseRepo, splitEntities } from "@/lib/links";
import type { Mentionable } from "@/lib/mentions";

/*
 * apps/web/src/components/MessageText.tsx. The web hands the markdown to Streamdown; here it is parsed
 * into mdast with the same pieces (GFM, remend for what a stream leaves unfinished) and rendered with
 * HeroUI's tokens and iOS text sizes: blocks are Views, text is nested Texts (React Native lays out text
 * only inside a Text). CSS inheritance (the color of a quote, the size of a table) goes through TextStyle.
 */

const NONE: Mentionable[] = [];

/** What the blocks and the text inside them need to know. */
type MarkdownContextValue = { mentionables: Mentionable[]; streaming: boolean; definitions: ReadonlyMap<string, string> };

const MarkdownContext = createContext<MarkdownContextValue>({ mentionables: NONE, streaming: false, definitions: new Map() });

/**
 * The text of a message, as markdown: tables, code, quotes, lists; links, emails,
 * phone numbers, file paths, colors and mentions are recognized in it.
 * `plain`: written by a person, so a line break stays a line break and HTML shows as typed.
 * `className`: the container (the bubble); `textClassName`: the text's size and line height.
 */
export function MessageText({
  text,
  streaming,
  plain,
  mentionables = NONE,
  className,
  textClassName,
  onAccent,
}: {
  text: string;
  streaming?: boolean;
  plain?: boolean;
  mentionables?: Mentionable[];
  className?: string;
  textClassName?: string;
  /** On the accent color (a bubble of yours): links and mentions in white. */
  onAccent?: boolean;
}) {
  const tree = useMemo(() => (streaming ? parse(text, !!plain) : parsed(text, !!plain)), [text, plain, streaming]);
  const context = useMemo(() => ({ mentionables, streaming: !!streaming, definitions: definitionsOf(tree) }), [mentionables, streaming, tree]);
  const content = (
    <View className={className}>
      <TextStyle className={cx("text-body", textClassName)}>
        <MarkdownContext.Provider value={context}>
          <Blocks nodes={tree.children} top />
        </MarkdownContext.Provider>
      </TextStyle>
    </View>
  );
  if (!onAccent) return content;
  return (
    <OnAccentContext.Provider value>
      <LinkClassContext.Provider value="text-accent-foreground underline">{content}</LinkClassContext.Provider>
    </OnAccentContext.Provider>
  );
}

/** Trees of finished messages, so reopening a conversation doesn't parse its thread again. */
const trees = new Map<string, Root>();
const MAX_TREES = 1000;

function parsed(text: string, plain: boolean): Root {
  const key = (plain ? "p:" : "m:") + text;
  const hit = trees.get(key);
  if (hit) {
    // Most recently used last: the oldest is the first dropped.
    trees.delete(key);
    trees.set(key, hit);
    return hit;
  }
  const tree = parse(text, plain);
  trees.set(key, tree);
  if (trees.size > MAX_TREES) trees.delete(trees.keys().next().value!);
  return tree;
}

/**
 * Streamdown's pipeline: the web's prepareMarkdown, remend (Streamdown's parseIncompleteMarkdown,
 * which it applies to every message, finished or not), then remark with GFM. A person's text gets
 * remarkChat instead of GFM, as `remarkPlugins={[remarkChat]}` replaces Streamdown's defaults on the web.
 */
function parse(text: string, plain: boolean): Root {
  const markdown = remend(prepareMarkdown(text));
  if (!plain) return fromMarkdown(markdown, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
  const tree = fromMarkdown(markdown);
  remarkChat(tree);
  return tree;
}

/** Link reference definitions ("[1]: https://…"), by identifier. */
function definitionsOf(tree: Root) {
  const found = new Map<string, string>();
  const walk = (node: Nodes) => {
    if (node.type === "definition") found.set(node.identifier, node.url);
    if ("children" in node) node.children.forEach(walk);
  };
  walk(tree);
  return found;
}

/** The text of a node, without its formatting. */
const textOf = (node: Nodes): string =>
  "value" in node && typeof node.value === "string" ? node.value : "children" in node ? (node.children as Nodes[]).map(textOf).join("") : "";

/** Inline text with more classes (bold, italic…), passed on to the text nested in it. */
function Span({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <TextStyle className={className}>
      <Text>{children}</Text>
    </TextStyle>
  );
}

/* ---------- Blocks ---------- */

type BlockKind = "p" | "heading" | "list" | "quote" | "figure" | "chat" | "code" | "table" | "hr";

/** Margins of a block on the web (Streamdown's classes, the web's quotes): above, below. */
const MARGINS: Record<BlockKind, [number, number]> = {
  p: [0, 0],
  heading: [24, 8],
  list: [0, 0],
  quote: [16, 16],
  figure: [4, 4],
  chat: [4, 4],
  code: [16, 16],
  table: [16, 16],
  hr: [24, 24],
};

const SPACE: Record<number, string> = { 0: "", 4: "mt-1", 8: "mt-2", 10: "mt-2.5", 16: "mt-4", 24: "mt-6" };

function kindOf(node: RootContent): BlockKind {
  switch (node.type) {
    case "heading":
      return "heading";
    case "list":
      return "list";
    case "blockquote":
      return signedQuote(node) ? "figure" : "quote";
    case "code":
      return node.lang === "chat" ? "chat" : "code";
    case "table":
      return "table";
    case "thematicBreak":
      return "hr";
    default:
      return "p";
  }
}

/**
 * The space above a block. At the top of a message, the web's proseClass sets 10px above each block
 * ([&>div>*+*]:mt-2.5), collapsed with the margin under the previous one (Streamdown's `space-y-4`
 * for a list, which has none of its own). Deeper, the two margins collapse, as CSS margins do.
 */
function spaceAbove(prev: BlockKind, next: BlockKind, top: boolean) {
  if (top) return Math.max(10, prev === "list" ? 16 : MARGINS[prev][1]);
  return Math.max(MARGINS[prev][1], MARGINS[next][0]);
}

/** Nodes that render nothing: link definitions (used by the links citing them), footnote definitions. */
const isShown = (node: RootContent) => node.type !== "definition" && node.type !== "footnoteDefinition" && node.type !== "yaml";

/** `after`: the block before these ones in the same parent, when there is one (the text of a list item). */
function Blocks({ nodes, top, after }: { nodes: RootContent[]; top?: boolean; after?: BlockKind }) {
  const shown = nodes.filter(isShown);
  const kinds = shown.map(kindOf);
  return shown.map((node, i) => {
    const prev = i ? kinds[i - 1] : after;
    return <Block key={i} node={node} className={prev ? SPACE[spaceAbove(prev, kinds[i]!, !!top)] : undefined} />;
  });
}

/** Headings on the iOS text styles: title3 and headline, then the body size in bold. */
const HEADINGS: Record<Heading["depth"], string> = {
  1: "text-title3 font-bold",
  2: "text-title3 font-semibold",
  3: "text-headline font-semibold",
  4: "text-headline font-semibold",
  5: "text-callout font-semibold",
  6: "text-subheadline font-semibold",
};

function Block({ node, className }: { node: RootContent; className?: string }) {
  switch (node.type) {
    case "paragraph":
      return (
        <Text className={className}>
          <Inlines nodes={node.children} />
        </Text>
      );
    case "heading":
      return (
        <TextStyle className={HEADINGS[node.depth]}>
          <Text accessibilityRole="header" className={className}>
            <Inlines nodes={node.children} />
          </Text>
        </TextStyle>
      );
    case "list":
      return <MarkdownList node={node} className={className} />;
    case "blockquote":
      return <Quote node={node} className={className} />;
    case "code":
      return node.lang === "chat" ? <ChatQuote code={node.value} className={className} /> : <CodeBlock node={node} className={className} />;
    case "table":
      return <MarkdownTable node={node} className={className} />;
    case "thematicBreak":
      return <Separator className={className} />;
    case "html": {
      // Streamdown renders HTML; only its text is kept here.
      const value = node.value.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "");
      return value.trim() ? <Text className={className}>{value}</Text> : null;
    }
    default:
      // Text left at the top by remarkChat (HTML typed by a person), and anything else inline.
      return (
        <Text className={className}>
          <Inline node={node as PhrasingContent} />
        </Text>
      );
  }
}

/**
 * A list, as Streamdown draws it (a disc marker then an em space: the width the browser gives `list-disc` inside): `list-inside` (the marker starts the first line, the next lines go
 * under it), `pl-5`, and `pl-6` for a list inside an item. Items are `py-1 my-0.5` (margins collapsed: 2px between them).
 */
function MarkdownList({ node, nested, className }: { node: List; nested?: boolean; className?: string }) {
  return (
    <View className={cx("gap-0.5", nested ? "my-0.5 pl-6" : "pl-5", className)}>
      {node.children.map((item, i) => (
        <MarkdownListItem key={i} item={item} marker={node.ordered ? `${(node.start ?? 1) + i}. ` : "•\u2003"} />
      ))}
    </View>
  );
}

/** An item: its paragraphs are inline after the marker ([&>p]:inline), then its other blocks (a nested list). */
function MarkdownListItem({ item, marker }: { item: ListItem; marker: string }) {
  const lead = item.children.findIndex((c) => c.type !== "paragraph");
  const paragraphs = (lead === -1 ? item.children : item.children.slice(0, lead)) as Extract<RootContent, { type: "paragraph" }>[];
  const rest = lead === -1 ? [] : item.children.slice(lead);
  // GFM task lists: the web shows a disabled checkbox.
  const check = item.checked == null ? "" : item.checked ? "☑ " : "☐ ";
  return (
    <View className="py-1">
      <Text>
        {marker}
        {check}
        {paragraphs.map((p, i) => (
          <Inlines key={i} nodes={p.children} />
        ))}
      </Text>
      {rest.map((node, i) =>
        node.type === "list" ? (
          <MarkdownList key={i} node={node} nested />
        ) : (
          <Blocks key={i} nodes={[node]} after={i ? kindOf(rest[i - 1]!) : "p"} />
        ),
      )}
    </View>
  );
}

/** A quote's bar on the left (HeroUI's Separator, standing), then what it quotes. */
function QuoteBar({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <View className={cx("flex-row gap-3", className)}>
      <Separator orientation="vertical" thickness={3} className="h-auto self-stretch" />
      <View className="min-w-0 flex-1">{children}</View>
    </View>
  );
}

/**
 * A quote: a bar on the left, the text muted and italic.
 * Signed ("— Author" on its last line), it is the web's rehypeQuotes figure: the quote, then its author.
 */
function Quote({ node, className }: { node: Blockquote; className?: string }) {
  const signed = signedQuote(node);
  if (!signed) {
    return (
      <TextStyle className="text-muted italic">
        <QuoteBar className={className}>
          <Blocks nodes={node.children} />
        </QuoteBar>
      </TextStyle>
    );
  }
  return (
    <View className={cx("flex-col gap-1.5", className)}>
      <TextStyle className="text-muted italic">
        <QuoteBar>
          <Blocks nodes={signed.quote.children} />
        </QuoteBar>
      </TextStyle>
      <TextStyle className="text-footnote text-muted">
        <Text className="pl-[15px]">
          {"— "}
          <Inlines nodes={signed.author} />
        </Text>
      </TextStyle>
    </View>
  );
}

/** Streamdown's labels (English only on the web too: no translations are passed to it). */
const streamdownLabels = { copyCode: "Copy Code", downloadFile: "Download file", copyTable: "Copy table", downloadTable: "Download table" };

/** What a toast says once a code block or a table is copied (the web's check for 2s). */
const copiedMessages = defineMessages({
  en: { code: "Code copied", table: "Table copied" },
  fr: { code: "Code copié", table: "Tableau copié" },
});

/** An icon button of a code block or a table (44pt tap target); `copied`: the toast shown once done. Disabled while the reply streams. */
function ActionButton({ icon: Icon, label, copied, onPress }: { icon: IconComponent; label: string; copied?: string; onPress: () => Promise<unknown> | void }) {
  const { streaming } = useContext(MarkdownContext);
  const { toast } = useToast();
  const press = async () => {
    haptic.tap();
    await onPress();
    if (copied) {
      haptic.success();
      toast.show({ variant: "success", label: copied });
    }
  };
  return (
    <Button variant="ghost" size="sm" isIconOnly accessibilityLabel={label} isDisabled={streaming} onPress={press} className="-my-1.5">
      <Icon className="size-[18px] text-muted" />
    </Button>
  );
}

/**
 * A fenced code block, as Streamdown draws it without a highlighter (the web passes no code plugin,
 * so no colors): a header with the language and the download and copy buttons, then the code with
 * its line numbers, scrolling sideways, 400px high at most.
 */
function CodeBlock({ node, className }: { node: Code; className?: string }) {
  const code = node.value.replace(/\n+$/, "");
  const lines = code.split("\n");
  const lang = node.lang ?? "";
  return (
    <Surface variant="secondary" className={cx("w-full flex-col p-0", className)}>
      <View className="h-10 flex-row items-center justify-between pl-3 pr-1">
        <Typography type="code" color="muted">
          {lang.toLowerCase()}
        </Typography>
        <View className="flex-row items-center">
          <ActionButton icon={DownloadIcon} label={streamdownLabels.downloadFile} onPress={() => Share.share({ message: code })} />
          <ActionButton icon={CopyIcon} label={streamdownLabels.copyCode} copied={copiedMessages.code} onPress={() => Clipboard.setStringAsync(code)} />
        </View>
      </View>
      <View className="max-h-[400px]">
        <ScrollView nestedScrollEnabled>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="px-3 pb-3">
            <View className="flex-row">
              <Typography type="code" color="muted" align="end" className="mr-3 w-6">
                {lines.map((_, i) => i + 1).join("\n")}
              </Typography>
              <Typography type="code">{code}</Typography>
            </View>
          </ScrollView>
        </ScrollView>
      </View>
    </Surface>
  );
}

/** Rows of a table as text, for its copy (markdown) and download (CSV) buttons. */
const tableCells = (node: Table) => node.children.map((row) => row.children.map((cell) => textOf(cell).trim()));
const tableMarkdown = (rows: string[][]) =>
  rows.map((r, i) => [`| ${r.join(" | ")} |`, ...(i ? [] : [`| ${r.map(() => "---").join(" | ")} |`])].join("\n")).join("\n");
const tableCsv = (rows: string[][]) => rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n");

const ALIGN = { left: "start", center: "center", right: "end" } as const;

/**
 * A table, as Streamdown draws it: in a frame with its buttons, the header on a neutral fill, rows
 * divided by a line, scrolling sideways, 300px high at most. Laid out by columns so that they line
 * up; a cell stays on one line (the web wraps a cell when the table is wider than the bubble).
 */
function MarkdownTable({ node, className }: { node: Table; className?: string }) {
  const columns = node.children[0]?.children.map((_, c) => c) ?? [];
  return (
    <Surface variant="secondary" className={cx("flex-col p-0", className)}>
      <View className="h-10 flex-row items-center justify-end pr-1">
        <ActionButton icon={CopyIcon} label={streamdownLabels.copyTable} copied={copiedMessages.table} onPress={() => Clipboard.setStringAsync(tableMarkdown(tableCells(node)))} />
        <ActionButton icon={DownloadIcon} label={streamdownLabels.downloadTable} onPress={() => Share.share({ message: tableCsv(tableCells(node)) })} />
      </View>
      <Surface className="mx-2 mb-2 max-h-[300px] p-0">
        <ScrollView nestedScrollEnabled>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="min-w-full">
            <View className="min-w-full flex-row">
                {columns.map((c) => (
                  <View key={c} className="grow">
                    {node.children.map((row, r) => {
                      const cell = (
                        <Text numberOfLines={1} align={ALIGN[node.align?.[c] ?? "left"]} weight={r ? undefined : "semibold"}>
                          <Inlines nodes={row.children[c]?.children ?? []} />
                        </Text>
                      );
                      // The header on a neutral fill, the rows below divided by a line.
                      return r ? (
                        <View key={r}>
                          <Separator />
                          <View className="px-3 py-2">{cell}</View>
                        </View>
                      ) : (
                        <Surface key={r} variant="secondary" className="px-3 py-2">
                          {cell}
                        </Surface>
                      );
                    })}
                  </View>
                ))}
            </View>
          </ScrollView>
        </ScrollView>
      </Surface>
    </Surface>
  );
}

/* ---------- Inline ---------- */

/** `link`: inside a link, where the web's rehype plugins leave the text as is (no chips, no mentions). */
function Inlines({ nodes, link }: { nodes: PhrasingContent[]; link?: boolean }) {
  return nodes.map((node, i) => <Inline key={i} node={node} link={link} />);
}

/** HTML collapses spaces and turns a soft line break into a space; React Native shows them as written. */
const collapse = (text: string) => text.replace(/[ \t]*\n[ \t]*/g, " ").replace(/[ \t]{2,}/g, " ");

function Inline({ node, link }: { node: PhrasingContent; link?: boolean }): ReactNode {
  const { mentionables, definitions } = useContext(MarkdownContext);
  switch (node.type) {
    case "text":
      // Links, paths, colors, tasks and mentions in the text (the web's rehypeLinks, rehypeTaskRefs, rehypeMentions).
      return link ? collapse(node.value) : <MentionText text={collapse(node.value)} mentionables={mentionables} />;
    case "strong":
      return (
        <Span className="font-semibold">
          <Inlines nodes={node.children} link={link} />
        </Span>
      );
    case "emphasis":
      return (
        <Span className="italic">
          <Inlines nodes={node.children} link={link} />
        </Span>
      );
    case "delete":
      return (
        <Span className="line-through">
          <Inlines nodes={node.children} link={link} />
        </Span>
      );
    case "inlineCode":
      return <InlineCode text={node.value} />;
    case "break":
      return "\n";
    case "link":
      return <MessageLink href={node.url} nodes={node.children} />;
    case "linkReference":
      return <MessageLink href={definitions.get(node.identifier)} nodes={node.children} />;
    case "image":
      return <TextLink url={node.url}>{node.alt || node.url}</TextLink>;
    case "imageReference":
      return <TextLink url={definitions.get(node.identifier)}>{node.alt ?? ""}</TextLink>;
    case "footnoteReference":
      return `[${node.label ?? node.identifier}]`;
    case "html":
      // A <br> is a line break; other tags are dropped (the web renders them).
      return /^<br\s*\/?>$/i.test(node.value) ? "\n" : null;
    default:
      return null;
  }
}

/**
 * A link in a message, blue like the others. A repository, a local address or a file written as its
 * address becomes a chip; "[the app](…)" stays a link. remend's unfinished link opens nothing.
 */
function MessageLink({ href, nodes }: { href?: string; nodes: PhrasingContent[] }) {
  const text = nodes.map(textOf).join("");
  const url = href && href !== "streamdown:incomplete-link" ? href : undefined;
  const repo = url ? parseRepo(url) : undefined;
  if (url && repo && isAutolink(url, text)) return <RepoChip url={url} repo={repo} />;
  // "http://localhost:5173" written as is: a port chip, like "localhost:5173".
  if (url && /^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):\d+/i.test(url) && text.includes(":")) return <PortChip url={url}>{text}</PortChip>;
  // "https://…/rapport.pdf" written as is: the file, by its name.
  const file = url && isAutolink(url, text) ? fileOfUrl(url) : undefined;
  if (file) {
    return (
      <FileChip name={file} url={url}>
        {file}
      </FileChip>
    );
  }
  return (
    <TextLink url={url}>
      <Inlines nodes={nodes} link />
    </TextLink>
  );
}

/** A link whose text is its own address: markdown wrote it, not the author ("[the app](…)"). */
const isAutolink = (href: string, text: string) => linkLabel(href) === linkLabel(/^https?:\/\//i.test(text) ? text : `https://${text}`);

/** Inline code: a path in it is shown as a path, a color with its swatch. */
function InlineCode({ text }: { text: string }) {
  const em = useEm();
  const path = asPath(text);
  if (path) return <PathChip path={path}>{text}</PathChip>;
  const file = asFile(text);
  if (file) return <FileChip name={file}>{text}</FileChip>;
  const [only, ...more] = splitEntities(text.trim());
  if (!more.length && only && typeof only !== "string" && only.kind === "port" && only.text.includes(":")) return <PortChip url={only.url}>{text}</PortChip>;
  if (!more.length && only && typeof only !== "string" && only.kind === "repo") return <RepoChip url={only.url} repo={only} label={only.text.startsWith("git@") ? only.text : undefined} />;
  const color = /^#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})$/i.test(text.trim()) ? text.trim() : null;
  // A neutral chip in monospace at 0.88em (the web's inline code). A box can't break across
  // lines in React Native: long code is drawn as code text instead, which can.
  if (text.length > 40) {
    return (
      <Text type="code" style={{ fontSize: em(0.88) }}>
        {text}
      </Text>
    );
  }
  return (
    <InlineBox>
      <Chip size="sm" variant="secondary" color="default">
        {color && <Swatch color={color} />}
        <Typography type="code" className="shrink" style={boxText(em, 0.88)}>
          {text}
        </Typography>
      </Chip>
    </InlineBox>
  );
}

/* ---------- Quoted conversations ---------- */

/** oklch → sRGB hex: React Native doesn't read CSS's oklch(). */
function oklchToHex(l: number, c: number, h: number) {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const S = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
  const channel = (x: number) => {
    const v = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${linear.map(channel).join("")}`;
}

/** Stable color of a speaker, from their name: the web's `oklch(0.62 0.14 hue)`. */
const speakerColor = (name: string) => oklchToHex(0.62, 0.14, [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7));

/**
 * A conversation quoted line by line ("Marie: …", "[10:47] Théo: …"), as the messages it was:
 * each speaker in their color, lines without a speaker continuing the previous message.
 */
function ChatQuote({ code, className }: { code: string; className?: string }) {
  const { mentionables } = useContext(MarkdownContext);
  const lines: { who?: string; time?: string; text: string }[] = [];
  for (const line of code.split("\n")) {
    if (!line.trim()) continue;
    const m = CHAT_LINE.exec(line)?.groups;
    if (m) lines.push({ who: m.who!.trim(), time: m.time?.replace(/^\[|\]$/g, ""), text: m.text! });
    else if (lines.length) lines.at(-1)!.text += `\n${line}`;
    else lines.push({ text: line });
  }
  return (
    <QuoteBar className={cx("py-0.5", className)}>
      <View className="flex-col gap-2">
        {lines.map((l, i) => {
          const continued = i > 0 && lines[i - 1]!.who === l.who && !l.time;
          return (
            <View key={i} className={cx("flex-col", continued && "-mt-1.5")}>
              {!continued && l.who && (
                <View className="flex-row items-baseline gap-1.5">
                  <Typography type="body-sm" weight="semibold" style={{ color: speakerColor(l.who) }}>
                    {l.who}
                  </Typography>
                  {l.time && (
                    <Typography type="body-sm" color="muted" className="tabular-nums">
                      {l.time}
                    </Typography>
                  )}
                </View>
              )}
              <Text>
                <MentionText text={l.text} mentionables={mentionables} />
              </Text>
            </View>
          );
        })}
      </View>
    </QuoteBar>
  );
}
