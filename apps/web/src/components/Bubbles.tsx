import { CheckIcon, ClockIcon } from "@/components/icons";
import { connectorName } from "@agora/core";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Fragment } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { toolServer } from "@/lib/tools";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import type { Mentionable } from "@/lib/mentions";
import { brandsQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { defineMessages, useT } from "@/i18n";
import { MessageText } from "./MessageText";

const messages = defineMessages({
  en: {
    using: "Using",
    used: "Used",
    tools: {
      terminal: "Terminal", execute_code: "Code", read_file: "File read", write_file: "File edit", patch: "File edit",
      search_files: "File search", web_search: "Web search", web_extract: "Web page", web_fetch: "Web page", browser: "Browser",
      vision_analyze: "Image analysis", image_generate: "Image generation", text_to_speech: "Voice", memory: "Memory",
      session_search: "History", todo: "Tasks", clarify: "Question", delegate_task: "Sub-agent", cronjob: "Routine",
      send_message: "Message", mixture_of_agents: "Several models", skill: "Skill", thinking: "Thinking",
    } as Record<string, string>,
    and: "and",
    denied: (n: number) => `${n} command${n > 1 ? "s" : ""} denied`,
    usingTool: (name: string) => `${name} is using`,
    typing: (names: string, n: number) => `${names} ${n > 1 ? "are" : "is"} typing…`,
  },
  fr: {
    using: "Utilise",
    used: "A utilisé",
    tools: {
      terminal: "Terminal", execute_code: "Code", read_file: "Lecture de fichier", write_file: "Modification de fichier", patch: "Modification de fichier",
      search_files: "Recherche de fichiers", web_search: "Recherche web", web_extract: "Lecture de page", web_fetch: "Lecture de page", browser: "Navigateur",
      vision_analyze: "Analyse d'image", image_generate: "Génération d'image", text_to_speech: "Voix", memory: "Mémoire",
      session_search: "Historique", todo: "Tâches", clarify: "Question", delegate_task: "Sous-agent", cronjob: "Routine",
      send_message: "Message", mixture_of_agents: "Plusieurs modèles", skill: "Compétence", thinking: "Réflexion",
    } as Record<string, string>,
    and: "et",
    denied: (n: number) => `${n} commande${n > 1 ? "s" : ""} refusée${n > 1 ? "s" : ""}`,
    usingTool: (name: string) => `${name} utilise`,
    typing: (names: string, n: number) => `${names} ${n > 1 ? "écrivent" : "écrit"}…`,
  },
});

/**
 * Who wrote a message and when, at the start of its first line (Figma « Conversation — blocs
 * riches »: « 13:31 Théo, l'alerte… »); the name only in a group, where it is not in the header.
 */
export function Lead({ name, time }: { name?: string; time: string }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      {name && <span className="font-medium text-foreground">{name}</span>}
      <span className="text-muted-foreground tabular-nums">{time}</span>
    </span>
  );
}

/**
 * A message's text, flat in its author's column, as in Figma (no bubble around what others write);
 * `lead` floats at its start so the first line runs on after it.
 */
export function FlatText({
  text,
  streaming,
  plain,
  mentionables,
  lead,
  className,
}: {
  text: string;
  streaming?: boolean;
  plain?: boolean;
  mentionables?: Mentionable[];
  lead?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flow-root min-w-0 break-words text-sm", className)}>
      {lead && <span className="float-left mr-2">{lead}</span>}
      <MessageText text={text} streaming={streaming} plain={plain} mentionables={mentionables} />
    </div>
  );
}

/** Our message (Figma « Conversation · Dev »): a grey bubble on the right, the conversation's colours aside. */
export function UserBubble({ text, mentionables, className }: { text: string; mentionables?: Mentionable[]; className?: string }) {
  return (
    <MessageText
      plain
      text={text}
      mentionables={mentionables}
      className={cn("bubble-mine ml-auto w-fit min-w-0 max-w-lg break-words rounded-2xl bg-accent px-3.5 py-2.25 text-sm text-foreground", className)}
    />
  );
}

export function TypingBubble({ label, className }: { label: string; className?: string }) {
  return (
    <div className={cn("flex h-5 w-fit items-center gap-1", className)} aria-label={label}>
      {[0, 1, 2].map((d) => (
        <span key={d} className="typing-dot size-1.5 rounded-full bg-muted-foreground" style={{ animationDelay: `${d * 150}ms` }} />
      ))}
    </div>
  );
}

/** Who is writing, on one line as in a messaging app: the bots before their reply (with the tool they use), and people. */
export function TypingLine({ entries, className }: { entries: { key: string; name: string; avatar?: React.ReactNode; tool?: string }[]; className?: string }) {
  const t = useT(messages);
  const words = useToolWords();
  const writers = entries.filter((e) => !e.tool);
  const users = entries.filter((e) => e.tool);
  const avatars = (list: typeof entries) =>
    list.some((e) => e.avatar) && <span className="flex *:not-first:-ml-1">{list.map((e) => e.avatar && <Fragment key={e.key}>{e.avatar}</Fragment>)}</span>;
  if (!entries.length) return null;
  return (
    <p className={cn("mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground", className)} aria-live="polite">
      {users.map((e, i) => (
        <Fragment key={e.key}>
          {i > 0 && <Separator orientation="vertical" />}
          {avatars([e])}
          <span className="typing-shimmer">{t.usingTool(e.name)}</span>
          <span className="inline-flex items-center gap-1 text-foreground">
            {words(e.tool!).server && <BrandLogo server={words(e.tool!).server!} fallback={null} className="size-3 rounded-sm" />}
            {words(e.tool!).label}
          </span>
        </Fragment>
      ))}
      {writers.length > 0 && (
        <>
          {users.length > 0 && <Separator orientation="vertical" />}
          {avatars(writers)}
          <span className="typing-shimmer">{t.typing(writers.map((e) => e.name).join(", "), writers.length)}</span>
        </>
      )}
    </p>
  );
}

/** A tool in words: a connector by its name and logo, the others by what they do (never `web_search`). */
function useToolWords() {
  const t = useT(messages);
  const { data: brands } = useQuery(brandsQuery);
  const servers = Object.keys(brands?.servers ?? {});
  return (name: string): { key: string; label: string; server: string | null } => {
    const server = toolServer(name, servers);
    if (server) return { key: `mcp:${server}`, label: connectorName(server), server };
    const id = name.toLowerCase();
    const known = id.startsWith("browser_") ? "browser" : id.startsWith("skill") ? "skill" : id === "process" || id === "bash" ? "terminal" : id;
    const label = t.tools[known] ?? id.replace(/^mcp_+/, "").replace(/_+/g, " ").replace(/^./, (c) => c.toUpperCase());
    return { key: label, label, server: null };
  };
}

/**
 * Tools used by the agent during a reply (hermes.tool.progress events): one quiet line, « A utilisé
 * Recherche web · Lecture de page », a connector with its logo. Code sessions are told by their card.
 * The commands it was allowed to run are that same Terminal, not a second line: their text in its
 * tooltip, only a denial said out loud.
 */
export function ToolLine({
  tools,
  approvals = [],
  running,
  className,
}: {
  tools: { name: string; status: string }[];
  approvals?: { command: string; choice: string }[];
  running?: boolean;
  className?: string;
}) {
  const t = useT(messages);
  const words = useToolWords();
  const seen = new Map<string, ReturnType<typeof words>>();
  const terminal = words("terminal");
  const denied = approvals.filter((a) => a.choice === "deny").length;
  for (const tool of [...tools, ...(approvals.length ? [{ name: "terminal", status: "" }] : [])]) {
    // Its reasoning isn't a tool it used.
    if (tool.name.startsWith("claude_code_") || tool.name === "code_session" || /^(thinking|réflexion)$/i.test(tool.name)) continue;
    const w = words(tool.name);
    if (!seen.has(w.key)) seen.set(w.key, w);
  }
  if (!seen.size) return null;
  return (
    <p className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-subtle-foreground", className)}>
      {running ? <Spinner className="size-3" /> : <CheckIcon className="size-3" />}
      <span>{running ? t.using : t.used}</span>
      {[...seen.values()].map((w, i) => (
        <Fragment key={w.key}>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            {w.server && <BrandLogo server={w.server} fallback={null} className="size-3 rounded-sm" />}
            <span title={w.key === terminal.key && approvals.length ? approvals.map((a) => a.command).join("\n") : undefined}>{w.label}</span>
            {w.key === terminal.key && denied > 0 && <span>({t.denied(denied)})</span>}
            {i < seen.size - 1 && ","}
          </span>
        </Fragment>
      ))}
    </p>
  );
}

export function EventLine({ label, routines }: { label: string; routines: string[] }) {
  const t = useT(messages);
  return (
    <p className="my-2 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-center text-xs text-muted-foreground">
      {label}
      {routines.map((r, i) => (
        <Fragment key={r}>
          {i > 0 && <span>{t.and}</span>}
          <span className="inline-flex items-center gap-1 text-foreground">
            <ClockIcon className="size-3.5" /> {r}
          </span>
        </Fragment>
      ))}
    </p>
  );
}

/** Centered line (date, event); `conversationId` makes it a link to that conversation. */
export function DateDivider({ label, conversationId }: { label: string; conversationId?: string }) {
  return (
    <p className="my-3 text-center text-xs text-muted-foreground">
      {conversationId ? (
        <Link
          to="/c/$conversationId"
          params={{ conversationId }}
          className="rounded-sm underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {label}
        </Link>
      ) : (
        label
      )}
    </p>
  );
}


