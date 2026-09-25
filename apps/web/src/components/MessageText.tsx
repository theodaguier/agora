import { Children, isValidElement, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { defaultRehypePlugins, Streamdown, type CustomRendererProps } from "streamdown";
import { CHAT_LINE, prepareMarkdown, rehypeQuotes, remarkChat } from "@/lib/chat-markdown";
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
  en: { showImage: (host: string) => `Show image from ${host}` },
  fr: { showImage: (host: string) => `Afficher l'image de ${host}` },
});

/** Words of a reply being written fade in as they arrive instead of popping in by chunks. */
const streamedWords = { animation: "fadeIn", duration: 180, easing: "var(--ease-out)" };

/**
 * Stable across renders. Streamdown memoizes on these by reference: a fresh array or object on
 * every token re-renders every message in the thread, and its code highlighter setStates from an
 * effect — the path that throws React's minified error #185 on a fast reply.
 */
const SHIKI_THEME = ["github-dark", "github-dark"] as ["github-dark", "github-dark"];
const LINK_SAFETY = { enabled: false };

/** Lists, paragraphs and blocks of a message's markdown, spaced for a bubble. */
const proseClass = "[&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-0.5 [&_p]:my-0 [&>div>*+*]:mt-2.5";

/**
 * The text of a message, as markdown: tables, code, quotes, lists; links, emails,
 * phone numbers, file paths, colors and mentions are recognized in it.
 * `plain`: written by a person, so a line break stays a line break and HTML shows as typed.
 */
export function MessageText({
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
    () => [...Object.values(defaultRehypePlugins), rehypeLinks, rehypeQuotes, rehypeTaskRefs, ...(mentionables.length ? [rehypeMentions(mentionables)] : [])],
    [mentionables],
  );
  const components = useMemo(() => {
    const mention = mentionables.length ? mentionComponents(mentionables).span : undefined;
    return {
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
    () => ({ renderers: [{ language: "chat", component: (p: CustomRendererProps) => <ChatQuote code={p.code} mentionables={mentionables} /> }] }),
    [mentionables],
  );
  const markdown = useMemo(() => prepareMarkdown(text), [text]);
  return (
    <div className={cn(proseClass, className)}>
      <Streamdown
        parseIncompleteMarkdown
        isAnimating={streaming}
        animated={streaming ? streamedWords : undefined}
        shikiTheme={SHIKI_THEME}
        linkSafety={LINK_SAFETY}
        remarkPlugins={plain ? [remarkChat] : undefined}
        rehypePlugins={rehypePlugins}
        components={components}
        plugins={plugins}
      >
        {markdown}
      </Streamdown>
    </div>
  );
}

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
    <code {...props} className={cn("rounded bg-foreground/[0.07] px-1.5 py-0.5 font-mono text-[0.88em]", className)}>
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
    <div className="my-1 flex flex-col gap-2 border-l-[3px] border-foreground/20 py-0.5 pl-3">
      {contentKeys(lines, (l) => `${l.who}|${l.time}|${l.text}`).map(([key, l], i) => {
        const continued = i > 0 && lines[i - 1]!.who === l.who && !l.time;
        return (
          <div key={key} className={cn("flex flex-col", continued && "-mt-1.5")}>
            {!continued && l.who && (
              <p className="flex items-baseline gap-1.5 text-[13px]">
                <span className="font-medium" style={{ color: speakerColor(l.who) }}>
                  {l.who}
                </span>
                {l.time && <span className="text-subtle tabular-nums">{l.time}</span>}
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
