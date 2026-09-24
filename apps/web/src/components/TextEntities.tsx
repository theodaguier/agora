import GitHubLogo from "@lobehub/icons-static-svg/icons/github.svg?react";
import { CheckIcon, CodeIcon, FolderIcon, GlobeIcon } from "@/components/icons";
import { FILE_ICONS } from "@/lib/file-icons";
import { useState, type ReactNode } from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { defineMessages, useT } from "@/i18n";
import { attachmentUrl } from "@/lib/api";
import { useConversationFile } from "@/lib/conversation-files";
import { basename, fileKind } from "@/lib/files";
import { isFolderPath, linkClass, splitEntities, type Repo } from "@/lib/links";
import { cn, withOffsets } from "@/lib/utils";

const messages = defineMessages({
  en: { copyPath: "Copy path", copyName: "Copy name", copied: "Copied" },
  fr: { copyPath: "Copier le chemin", copyName: "Copier le nom", copied: "Copié" },
});

const chipClass =
  "rounded-[5px] bg-foreground/[0.07] px-1 py-px text-left font-mono text-[0.88em] box-decoration-clone hover:bg-foreground/[0.12]";
const chipIcon = "mr-1 inline size-[1.05em] align-[-0.17em] text-muted-foreground";

/**
 * A file named in a message: a path, a name ("rapport.pdf") or a web address of a file.
 * A web address, or a name matching a file of the conversation, opens it (images and videos
 * show on hover); otherwise the file is on someone's computer, which the browser can't
 * reach, and a click copies the path or the name.
 */
export function FileChip({ name, path, url, children }: { name: string; path?: string; url?: string; children: ReactNode }) {
  const t = useT(messages);
  const [copied, setCopied] = useState(false);
  const sent = useConversationFile(basename(path ?? name));
  const href = url ?? (sent && attachmentUrl(sent.id));
  const kind = fileKind(name);
  const Icon = path && isFolderPath(path) ? FolderIcon : FILE_ICONS[kind];
  // A short name stays on one line with its icon; a long path wraps anywhere.
  const wrap = (path ?? name).length > 40 ? "[overflow-wrap:anywhere]" : "whitespace-nowrap";

  if (href) {
    const link = (
      <a href={href} target="_blank" rel="noreferrer noopener" title={url} className={cn(chipClass, wrap, "text-foreground")}>
        <Icon className={chipIcon} />
        {children}
      </a>
    );
    if (kind !== "image" && kind !== "video") return link;
    return (
      <HoverCard>
        <HoverCardTrigger delay={250} render={link} />
        <HoverCardContent align="start" className="w-auto max-w-80 overflow-hidden p-1">
          {kind === "image" ? (
            <img src={href} alt={name} className="max-h-60 rounded-md object-contain" />
          ) : (
            <video src={href} muted autoPlay loop playsInline className="max-h-60 rounded-md" />
          )}
        </HoverCardContent>
      </HoverCard>
    );
  }

  const copy = () => {
    navigator.clipboard.writeText(path ?? name).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            role="button"
            tabIndex={0}
            onClick={copy}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                copy();
              }
            }}
          />
        }
        className={cn(chipClass, wrap, "cursor-pointer")}
      >
        <Icon className={chipIcon} />
        {children}
      </TooltipTrigger>
      <TooltipContent>
        {copied && <CheckIcon className="size-3.5" />}
        {copied ? t.copied : path ? t.copyPath : t.copyName}
      </TooltipContent>
    </Tooltip>
  );
}

/** A file or folder path, as written. */
export function PathChip({ path, children }: { path: string; children: ReactNode }) {
  return (
    <FileChip name={basename(path)} path={path}>
      {children}
    </FileChip>
  );
}

/**
 * A repository, as GitHub shows one in text: its logo, "owner/name" and the issue or commit pointed to.
 * `label`: shown as written instead ("git@github.com:…", a clone address meant to be copied).
 */
export function RepoChip({ url, repo, label }: { url: string; repo: Repo; label?: string }) {
  const Logo = repo.host === "github" ? GitHubLogo : CodeIcon;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      title={url}
      className="rounded-[5px] bg-foreground/[0.07] px-1 py-px font-medium [overflow-wrap:anywhere] box-decoration-clone hover:bg-foreground/[0.12]"
    >
      <Logo className="mr-1 inline size-[1em] align-[-0.14em]" fill="currentColor" />
      {label ?? (
        <>
          {repo.owner}/{repo.name}
          {repo.ref && <span className="font-normal text-muted-foreground">{repo.ref}</span>}
        </>
      )}
    </a>
  );
}

/** A port or a local address ("3001", "localhost:5173"): opens it on this machine, in a new tab. */
export function PortChip({ url, children }: { url: string; children: ReactNode }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      title={url}
      className="whitespace-nowrap rounded-[5px] bg-foreground/[0.07] px-1 py-px font-mono text-[0.88em] hover:bg-foreground/[0.12]"
    >
      <GlobeIcon className="mr-1 inline size-[1.05em] align-[-0.17em] text-muted-foreground" />
      {children}
    </a>
  );
}

/** A small square of the color, before its value. The value is checked as hex before it reaches CSS. */
export function Swatch({ color }: { color: string }) {
  return <span className="mr-1 inline-block size-[0.85em] rounded-[3px] align-[-0.08em] ring-1 ring-foreground/15" style={{ backgroundColor: color }} />;
}

export function ColorValue({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="whitespace-nowrap font-mono text-[0.88em]">
      {/^#[0-9a-f]{6,8}$/i.test(color) && <Swatch color={color} />}
      {children}
    </span>
  );
}

/** Plain text with its web addresses, emails and phone numbers as links, its paths and colors marked. */
export function EntityText({ text }: { text: string }) {
  return (
    <>
      {withOffsets(splitEntities(text)).map(([key, p]) => {
        if (typeof p === "string") return p;
        switch (p.kind) {
          case "link":
          case "phone":
            return (
              <a key={key} href={p.url} {...(p.url.startsWith("http") && { target: "_blank", rel: "noreferrer noopener" })} className={linkClass}>
                {p.text}
              </a>
            );
          case "repo":
            return <RepoChip key={key} url={p.url} repo={p} label={p.text.startsWith("git@") ? p.text : undefined} />;
          case "port":
            return (
              <PortChip key={key} url={p.url}>
                {p.text}
              </PortChip>
            );
          case "file":
            return (
              <FileChip key={key} name={p.name} url={p.url}>
                {p.url ? p.name : p.text}
              </FileChip>
            );
          case "path":
            return (
              <PathChip key={key} path={p.path}>
                {p.text}
              </PathChip>
            );
          case "color":
            return (
              <ColorValue key={key} color={p.color}>
                {p.text}
              </ColorValue>
            );
        }
      })}
    </>
  );
}
