import { CheckIcon, ClockIcon, ToolIcon } from "@/components/icons";
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
    and: "and",
    usingTool: (name: string) => `${name} is using`,
    typing: (names: string, n: number) => `${names} ${n > 1 ? "are" : "is"} typing…`,
  },
  fr: {
    using: "Utilise",
    used: "A utilisé",
    and: "et",
    usingTool: (name: string) => `${name} utilise`,
    typing: (names: string, n: number) => `${names} ${n > 1 ? "écrivent" : "écrit"}…`,
  },
});

export function BotBubble({
  text,
  streaming,
  mentionables,
  className,
}: {
  text: string;
  streaming?: boolean;
  mentionables?: Mentionable[];
  className?: string;
}) {
  return (
    <MessageText
      text={text}
      streaming={streaming}
      mentionables={mentionables}
      className={cn("w-fit min-w-0 max-w-lg rounded-2xl bg-muted px-3 py-2 text-sm", className)}
    />
  );
}

/** Our message: the bot's colour (--bot in a conversation). */
export function UserBubble({ text, mentionables, className }: { text: string; mentionables?: Mentionable[]; className?: string }) {
  return (
    <MessageText
      plain
      text={text}
      mentionables={mentionables}
      className={cn("bubble-mine ml-auto w-fit min-w-0 max-w-lg break-words rounded-2xl bg-bot px-3 py-2 text-sm text-bot-foreground", className)}
    />
  );
}

export function TypingBubble({ label, className }: { label: string; className?: string }) {
  return (
    <div className={cn("flex w-fit gap-1 rounded-2xl bg-muted p-3", className)} aria-label={label}>
      {[0, 1, 2].map((d) => (
        <span key={d} className="typing-dot size-1.5 rounded-full bg-muted-foreground" style={{ animationDelay: `${d * 150}ms` }} />
      ))}
    </div>
  );
}

/** Who is writing, on one line as in a messaging app: the bots before their reply (with the tool they use), and people. */
export function TypingLine({ entries, className }: { entries: { key: string; name: string; avatar?: React.ReactNode; tool?: string }[]; className?: string }) {
  const t = useT(messages);
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
          <ToolBadge name={e.tool!} />
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

function ToolBadge({ name }: { name: string }) {
  const { data: brands } = useQuery(brandsQuery);
  const servers = Object.keys(brands?.servers ?? {});
  return (
    <span className="inline-flex items-center gap-1 text-foreground">
      <BrandLogo server={toolServer(name, servers)} fallback={<ToolIcon name={name} className="size-3.5" />} className="size-3.5 rounded-sm" />
      {name}
    </span>
  );
}

/** Tools used by the agent during a reply (hermes.tool.progress events). */
export function ToolLine({ tools, running, className }: { tools: { name: string; status: string }[]; running?: boolean; className?: string }) {
  const t = useT(messages);
  // The code session tools are told by the session's card under the reply, not by their raw names.
  const names = [...new Set(tools.map((tool) => tool.name))].filter((n) => !n.startsWith("claude_code_"));
  if (!names.length) return null;
  return (
    <p className={cn("my-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground", className)}>
      {running ? <Spinner /> : <CheckIcon className="size-4" />}
      {running ? t.using : t.used}
      {names.map((n) => (
        <ToolBadge key={n} name={n} />
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

/** Message from another employee, left-aligned. */
export function PeerBubble({ text, mentionables, className }: { text: string; mentionables?: Mentionable[]; className?: string }) {
  return (
    <MessageText
      plain
      text={text}
      mentionables={mentionables}
      className={cn("w-fit min-w-0 max-w-lg break-words rounded-2xl bg-muted px-3 py-2 text-sm", className)}
    />
  );
}

/** Author name at the start of a run of messages, in a group. */
export function AuthorLine({ avatar, name, className }: { avatar: React.ReactNode; name: string; className?: string }) {
  return (
    <p className={cn("mt-2 flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      {avatar}
      {name}
    </p>
  );
}
