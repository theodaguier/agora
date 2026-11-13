import { Children, isValidElement, memo, useContext, useMemo, useState, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { TaskStatusIcon } from "@/components/Marks";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CodeBlock, CodeBlockCopyButton, defaultRehypePlugins, Streamdown, type CustomRendererProps } from "streamdown";
import { RunCommandContext } from "@/lib/run-command";
import { createCodePlugin } from "@streamdown/code";
import { CHAT_LINE, prepareMarkdown, rehypeNumericColumns, rehypeQuotes, remarkChat } from "@/lib/chat-markdown";
import { asFile, asPath, fileOfUrl, linkClass, linkLabel, parseRepo, rehypeLinks, splitEntities } from "@/lib/links";
import { rehypeTaskRefs } from "@/lib/task-refs";
import { TaskRef } from "@/components/TaskRef";
import { Button } from "@/components/ui/button";
import { defineMessages, useT } from "@/i18n";
import { MentionText, mentionComponents, rehypeMentions, type Mentionable } from "@/lib/mentions";
import { cn, contentKeys } from "@/lib/utils";
import { ColorValue, FileChip, PathChip, PortChip, RepoChip, Swatch } from "./TextEntities";

const NONE: Mentionable[] = [];

const messages = defineMessages({
  en: { showImage: (host: string) => `Show image from ${host}`, run: "Run", runLabel: "Ask the agent to run this command and read its result" },
  fr: { showImage: (host: string) => `Afficher l'image de ${host}`, run: "Exécuter", runLabel: "Demander à l'agent d'exécuter cette commande et d'en lire le résultat" },
});

/** Words of a reply being written fade in as they arrive instead of popping in by chunks. */
const streamedWords = { animation: "fadeIn", duration: 180, easing: "var(--ease-out)" };

/**
 * Stable across renders. Streamdown memoizes on these by reference: a fresh array or object on
 * every token re-renders every message in the thread, and its code highlighter setStates from an
 * effect — the path that throws React's minified error #185 on a fast reply.
 */
const SHIKI_THEME = ["github-light", "github-dark"] as ["github-light", "github-dark"];
/** Shiki colours code blocks (Streamdown 2 ships it apart); languages load on first use. */
const CODE_PLUGIN = createCodePlugin({ themes: SHIKI_THEME });
const LINK_SAFETY = { enabled: false };
const REMARK_CHAT = [remarkChat];
/** A table is read, not a tool: no copy/download/fullscreen bar over it. Code keeps its copy button. */
const CONTROLS = { table: false, code: { copy: true, download: false }, mermaid: false } as const;

/** Lists, paragraphs and blocks of a message's markdown, spaced for a bubble. */
/**
 * A code block is one box, not a box in a box: its language and copy on a thin bar over a hairline,
 * then the code on the same ground, 13 px, no line numbers (Linear, GitHub's comments).
 */
const proseClass = cn(
  "[&_p]:my-0 [&>div>*+*]:mt-2.5",
  "[&_[data-streamdown=code-block]]:my-2 [&_[data-streamdown=code-block]]:gap-0 [&_[data-streamdown=code-block]]:overflow-hidden [&_[data-streamdown=code-block]]:rounded-lg [&_[data-streamdown=code-block]]:border [&_[data-streamdown=code-block]]:bg-card [&_[data-streamdown=code-block]]:p-0",
  "[&_[data-streamdown=code-block-header]]:border-b [&_[data-streamdown=code-block-header]]:px-2 [&_[data-streamdown=code-block-header]]:text-subtle-foreground",
  "[&_[data-streamdown=code-block-actions]]:border-0 [&_[data-streamdown=code-block-actions]]:bg-transparent [&_[data-streamdown=code-block-actions]]:px-1 [&_[data-streamdown=code-block-actions]]:backdrop-blur-none",
  // Copy sits on the language's bar, not 8 px under it.
  "[&_:has(>[data-streamdown=code-block-actions])]:top-0 [&_:has(>[data-streamdown=code-block-actions])]:-mt-8",
  "[&_[data-streamdown=code-block-body]]:rounded-none [&_[data-streamdown=code-block-body]]:border-0 [&_[data-streamdown=code-block-body]]:bg-transparent [&_[data-streamdown=code-block-body]]:px-3 [&_[data-streamdown=code-block-body]]:py-2.5 [&_[data-streamdown=code-block-body]]:text-ui [&_[data-streamdown=code-block-body]_pre]:bg-transparent!",
);

type Md<T extends "table" | "thead" | "tbody" | "tr" | "th" | "td" | "ul" | "ol" | "li"> = ComponentProps<T> & { node?: unknown };

/**
 * Markdown tables are shadcn's Table: Streamdown's own wrapper boxes the table twice. Figma
 * (« Atelier · Théo »): a quiet header, rows without hover, figures right-aligned in mono, and the
 * figure the author set in bold is the one that stands out, in the waiting colour.
 */
const numeric = (props: object) => "data-numeric" in props;
const tableComponents = {
  table: ({ node, ...props }: Md<"table">) => <Table {...props} />,
  thead: ({ node, ...props }: Md<"thead">) => <TableHeader {...props} />,
  tbody: ({ node, ...props }: Md<"tbody">) => <TableBody {...props} />,
  tr: ({ node, ...props }: Md<"tr">) => <TableRow {...props} className="hover:bg-transparent" />,
  th: ({ node, ...props }: Md<"th">) => (
    <TableHead {...props} className={cn("h-auto px-0 pt-1 pb-2 text-xs text-muted-foreground not-first:pl-4", numeric(props) ? "w-24 text-right font-normal" : "first:font-medium")} />
  ),
  td: ({ node, ...props }: Md<"td">) => (
    <TableCell {...props} className={cn("px-0 py-2.25 text-ui not-first:pl-4", numeric(props) && "text-right font-mono [&_[data-streamdown=strong]]:font-normal [&_[data-streamdown=strong]]:text-warning")} />
  ),
};

/**
 * Lists as a chat writes them: the bullet or number outside the text (a long item wraps under its words,
 * not under the bullet), a short indent, grey markers, little space between items. Streamdown's own put
 * the marker inside the line with a wide gap.
 */
const listComponents = {
  // A checklist (« - [x] … ») has its marks, not bullets too.
  ul: ({ node, className, ...props }: Md<"ul">) => (
    <ul {...props} className={cn("flex flex-col gap-1", className?.includes("contains-task-list") ? "list-none" : "list-disc pl-5 marker:text-muted-foreground", className)} />
  ),
  ol: ({ node, className, ...props }: Md<"ol">) => <ol {...props} className={cn("flex list-decimal flex-col gap-1 pl-5 marker:text-muted-foreground", className)} />,
  li: ({ node, className, children, ...props }: Md<"li">) => {
    if (!className?.includes("task-list-item")) return <li {...props} className={cn("pl-0.5 [&>p]:inline", className)}>{children}</li>;
    // The checkbox becomes the app's task mark: an empty ring to do, a filled check done (greyed text).
    const kids = Children.toArray(children);
    const box = kids.find((k): k is ReactElement<{ checked?: boolean }> => isValidElement(k) && k.type === "input");
    const done = !!box?.props.checked;
    return (
      <li {...props} className={cn("flex items-start gap-2 [&>p]:inline", done && "text-muted-foreground")}>
        <TaskStatusIcon status={done ? "done" : "todo"} className="mt-0.5" />
        <span className="min-w-0">{kids.filter((k) => k !== box)}</span>
      </li>
    );
  },
};

/** Languages a terminal runs: their blocks get « Exécuter » in a conversation. */
const SHELLS = ["bash", "sh", "shell", "zsh", "console", "terminal"];

/**
 * A shell block: Streamdown's own code block (highlighted, copy), with « Exécuter » beside copy when
 * the page can send it to the bot (RunCommandContext): the bot runs it and reads the result.
 */
function ShellBlock({ code, language, isIncomplete }: CustomRendererProps) {
  const t = useT(messages);
  const run = useContext(RunCommandContext);
  return (
    <CodeBlock code={code} language={language} isIncomplete={isIncomplete} lineNumbers={false}>
      {run && !isIncomplete && (
        <button type="button" title={t.runLabel} onClick={() => run(code, language)} className="cursor-pointer rounded-sm px-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
          {t.run}
        </button>
      )}
      <CodeBlockCopyButton code={code} />
    </CodeBlock>
  );
}

/**
 * Headings, quotes and rules at a message's scale: a reply is not a document, so a « # » title is a
 * strong line a step above the text, never Streamdown's 30 px; a quote a grey rule and grey words.
 */
type Hx = ComponentProps<"h1"> & { node?: unknown };
const blockComponents = {
  h1: ({ node, className, ...props }: Hx) => <h3 {...props} className={cn("mt-2 text-base font-semibold", className)} />,
  h2: ({ node, className, ...props }: Hx) => <h3 {...props} className={cn("mt-2 text-base font-semibold", className)} />,
  h3: ({ node, className, ...props }: Hx) => <h4 {...props} className={cn("mt-1 text-ui font-semibold", className)} />,
  h4: ({ node, className, ...props }: Hx) => <h4 {...props} className={cn("mt-1 text-ui font-semibold", className)} />,
  blockquote: ({ node, className, ...props }: ComponentProps<"blockquote"> & { node?: unknown }) => (
    <blockquote {...props} className={cn("my-0 border-l-2 pl-3 text-muted-foreground", className)} />
  ),
  hr: ({ node, className, ...props }: ComponentProps<"hr"> & { node?: unknown }) => <hr {...props} className={cn("my-3 border-border", className)} />,
};

/**
 * The text of a message, as markdown: tables, code, quotes, lists; links, emails,
 * phone numbers, file paths, colors and mentions are recognized in it.
 * `plain`: written by a person, so a line break stays a line break and HTML shows as typed.
 */
export const MessageText = memo(function MessageText({
  text,
  streaming,
  plain,
  mentionables = NONE,
  className,
}: {
  text: string;
  streaming?: boolean;
  plain?: boolean;
  mentionables?: Mentionable[];
  className?: string;
}) {
  // Links first: an email's "@" must not be read as a mention.
  const rehypePlugins = useMemo(
    () => [...Object.values(defaultRehypePlugins), rehypeLinks, rehypeQuotes, rehypeNumericColumns, rehypeTaskRefs, ...(mentionables.length ? [rehypeMentions(mentionables)] : [])],
    [mentionables],
  );
  const components = useMemo(() => {
    const mention = mentionables.length ? mentionComponents(mentionables).span : undefined;
    return {
      ...tableComponents,
      ...listComponents,
      ...blockComponents,
      a: MessageLink,
      img: MessageImage,
      inlineCode: InlineCode,
      span: ({ node, ...props }: ComponentProps<"span"> & { node?: unknown }) => {
        const data = props as { "data-path"?: string; "data-color"?: string; "data-port"?: string; "data-file"?: string; "data-url"?: string };
        if (data["data-file"]) {
          const url = data["data-url"];
          return (
            <FileChip name={data["data-file"]} url={url}>
              {url ? data["data-file"] : props.children}
            </FileChip>
          );
        }
        const taskId = (props as { "data-task"?: string })["data-task"];
        if (taskId) return <TaskRef taskId={taskId} />;
        if (data["data-port"]) return <PortChip url={data["data-port"]}>{props.children}</PortChip>;
        if (data["data-path"]) return <PathChip path={data["data-path"]}>{props.children}</PathChip>;
        if (data["data-color"]) return <ColorValue color={data["data-color"]}>{props.children}</ColorValue>;
        return mention ? mention({ node, ...props }) : <span {...props} />;
      },
    };
  }, [mentionables]);
  const plugins = useMemo(
    () => ({
      code: CODE_PLUGIN,
      renderers: [
        { language: "chat", component: (p: CustomRendererProps) => <ChatQuote code={p.code} mentionables={mentionables} /> },
        { language: SHELLS, component: ShellBlock },
      ],
    }),
    [mentionables],
  );
  const markdown = useMemo(() => prepareMarkdown(text), [text]);
  return (
    <div className={cn("message-prose", proseClass, className)}>
      <Streamdown
        parseIncompleteMarkdown
        isAnimating={streaming}
        animated={streaming ? streamedWords : undefined}
        shikiTheme={SHIKI_THEME}
        linkSafety={LINK_SAFETY}
        controls={CONTROLS}
        lineNumbers={false}
        remarkPlugins={plain ? REMARK_CHAT : undefined}
        rehypePlugins={rehypePlugins}
        components={components}
        plugins={plugins}
      >
        {markdown}
      </Streamdown>
    </div>
  );
});

/** A link in a message, blue like the others; web pages open in a new tab, "mailto:" and "tel:" in their app. */
function MessageLink({ node: _node, className: _className, href, ...props }: ComponentProps<"a"> & { node?: unknown }) {
  // A repository written as its address becomes a repository chip; "[the app](github.com/…)" stays a link.
  const repo = href ? parseRepo(href) : undefined;
  if (repo && isAutolink(href!, props.children)) {
    return <RepoChip url={href!} repo={repo} />;
  }
  // "http://localhost:5173" written as is: a port chip, like "localhost:5173".
  if (href && /^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):\d+/i.test(href) && textOf(props.children).includes(":")) {
    return <PortChip url={href}>{props.children}</PortChip>;
  }
  // "https://…/rapport.pdf" written as is: the file, by its name.
  const file = href && isAutolink(href, props.children) ? fileOfUrl(href) : undefined;
  if (file) {
    return (
      <FileChip name={file} url={href}>
        {file}
      </FileChip>
    );
  }
  const web = !!href && /^https?:/i.test(href);
  return <a {...props} href={href} {...(web && { target: "_blank", rel: "noreferrer noopener" })} className={linkClass} />;
}

/**
 * An image in a message. One from another site loads only on a click: loading it sends its
 * address to that site, and a reply steered by a trapped page could hide the conversation
 * in it ("![](https://…/?d=…)"). The full address shows on hover, before the click.
 */
function MessageImage({ node: _node, src, alt, ...props }: ComponentProps<"img"> & { node?: unknown }) {
  const t = useT(messages);
  const external = typeof src === "string" && isExternal(src);
  const [shown, setShown] = useState(!external);
  if (!src || typeof src !== "string") return null;
  if (!shown) {
    return (
      <Button type="button" variant="outline" size="sm" title={src} onClick={() => setShown(true)}>
        {t.showImage(new URL(src).host)}
      </Button>
    );
  }
  return <img {...props} src={src} alt={alt ?? ""} loading="lazy" referrerPolicy="no-referrer" className="max-w-full rounded-lg" />;
}

/** An absolute http(s) address on another origin than the app's. */
function isExternal(src: string) {
  try {
    const url = new URL(src, window.location.href);
    return /^https?:$/.test(url.protocol) && url.origin !== window.location.origin;
  } catch {
    return false;
  }
}

/** A link whose text is its own address: markdown wrote it, not the author ("[the app](…)"). */
function isAutolink(href: string, children: ReactNode) {
  const text = textOf(children);
  return linkLabel(href) === linkLabel(/^https?:\/\//i.test(text) ? text : `https://${text}`);
}

const textOf = (node: ReactNode): string =>
  Children.toArray(node)
    .map((c) => (typeof c === "string" || typeof c === "number" ? String(c) : isValidElement<{ children?: ReactNode }>(c) ? textOf(c.props.children) : ""))
    .join("");

/** Inline code: a path in it is shown as a path, a color with its swatch. */
function InlineCode({ node: _node, className, children, ...props }: ComponentProps<"code"> & { node?: unknown }) {
  const text = textOf(children);
  const path = asPath(text);
  if (path) return <PathChip path={path}>{text}</PathChip>;
  const file = asFile(text);
  if (file) return <FileChip name={file}>{text}</FileChip>;
  const [only, ...more] = splitEntities(text.trim());
  if (!more.length && only && typeof only !== "string" && only.kind === "port" && only.text.includes(":")) return <PortChip url={only.url}>{text}</PortChip>;
  if (!more.length && only && typeof only !== "string" && only.kind === "repo") return <RepoChip url={only.url} repo={only} label={only.text.startsWith("git@") ? only.text : undefined} />;
  const color = /^#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})$/i.test(text.trim()) ? text.trim() : null;
  return (
    <code {...props} className={cn("font-mono text-ui text-muted-foreground", className)}>
      {color && <Swatch color={color} />}
      {children}
    </code>
  );
}

/** Stable color of a speaker, from their name. */
const speakerColor = (name: string) => `oklch(0.62 0.14 ${[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)})`;

/**
 * A conversation quoted line by line ("Marie: …", "[10:47] Théo: …"), as the messages it was:
 * each speaker in their color, lines without a speaker continuing the previous message.
 */
function ChatQuote({ code, mentionables }: { code: string; mentionables: Mentionable[] }) {
  const lines: { who?: string; time?: string; text: string }[] = [];
  for (const line of code.split("\n")) {
    if (!line.trim()) continue;
    const m = CHAT_LINE.exec(line)?.groups;
    if (m) lines.push({ who: m.who!.trim(), time: m.time?.replace(/^\[|\]$/g, ""), text: m.text! });
    else if (lines.length) lines.at(-1)!.text += `\n${line}`;
    else lines.push({ text: line });
  }
  return (
    <div className="my-1 flex flex-col gap-2 border-l-2 border-border pl-3">
      {contentKeys(lines, (l) => `${l.who}|${l.time}|${l.text}`).map(([key, l], i) => {
        const continued = i > 0 && lines[i - 1]!.who === l.who && !l.time;
        return (
          <div key={key} className={cn("flex flex-col", continued && "-mt-1.5")}>
            {!continued && l.who && (
              <p className="flex items-baseline gap-1.5 text-xs">
                <span className="font-medium" style={{ color: speakerColor(l.who) }}>
                  {l.who}
                </span>
                {l.time && <span className="text-muted-foreground tabular-nums">{l.time}</span>}
              </p>
            )}
            <p className="whitespace-pre-wrap break-words">
              <MentionText text={l.text} mentionables={mentionables} />
            </p>
          </div>
        );
      })}
    </div>
  );
}
