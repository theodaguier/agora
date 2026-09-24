import { CheckIcon, ClockIcon, ToolIcon } from "@/components/icons";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Fragment } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { toolServer } from "@/lib/tools";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import type { Mentionable } from "@/lib/mentions";
import { brandsQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { defineMessages, useT } from "@/i18n";
import { MessageText } from "./MessageText";

const messages = defineMessages({
  en: { using: "Using", used: "Used", and: "and" },
  fr: { using: "Utilise", used: "A utilisé", and: "et" },
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
      className={cn("w-fit min-w-0 max-w-[min(680px,88%)] rounded-2xl bg-secondary px-3.5 py-2.5 text-[15px] leading-[1.45]", className)}
    />
  );
}

export function UserBubble({ text, mentionables, className }: { text: string; mentionables?: Mentionable[]; className?: string }) {
  return (
    <MessageText
      plain
      text={text}
      mentionables={mentionables}
      className={cn("ml-auto w-fit min-w-0 max-w-[min(560px,80%)] break-words rounded-2xl bg-accent px-3.5 py-2 text-[15px] leading-[1.45]", className)}
    />
  );
}

export function TypingBubble({ label, className }: { label: string; className?: string }) {
  return (
    <div className={cn("flex w-fit gap-1 rounded-2xl bg-secondary px-4 py-3.5", className)} aria-label={label}>
      {[0, 1, 2].map((d) => (
        <span key={d} className="typing-dot size-1.5 rounded-full bg-muted-foreground" style={{ animationDelay: `${d * 150}ms` }} />
      ))}
    </div>
  );
}

/** Tools used by the agent during a reply (hermes.tool.progress events). */
export function ToolLine({ tools, running, className }: { tools: { name: string; status: string }[]; running?: boolean; className?: string }) {
  const t = useT(messages);
  const { data: brands } = useQuery(brandsQuery);
  const servers = Object.keys(brands?.servers ?? {});
  const names = [...new Set(tools.map((tool) => tool.name))];
  if (!names.length) return null;
  return (
    <p className={cn("my-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-muted-foreground", className)}>
      {running ? <Spinner className="size-3.5" /> : <CheckIcon className="size-3.5" />}
      {running ? t.using : t.used}
      {names.map((n) => (
        <Badge key={n} variant="secondary" className="h-auto gap-1 rounded-md px-1.5 py-0.5 font-mono text-[12px] font-normal text-foreground/80">
          <BrandLogo server={toolServer(n, servers)} fallback={<ToolIcon name={n} className="size-3.5" />} className="size-3.5 rounded-[3px]" />
          {n}
        </Badge>
      ))}
    </p>
  );
}

export function EventLine({ label, routines }: { label: string; routines: string[] }) {
  const t = useT(messages);
  return (
    <p className="my-2 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-center text-[13px] text-muted-foreground">
      {label}
      {routines.map((r, i) => (
        <Fragment key={r}>
          {i > 0 && <span>{t.and}</span>}
          <span className="inline-flex items-center gap-1 text-foreground/80">
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
    <p className="my-3 text-center text-[13px] text-subtle">
      {conversationId ? (
        <Link
          to="/c/$conversationId"
          params={{ conversationId }}
          className="rounded-sm underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
      className={cn("w-fit min-w-0 max-w-[min(560px,80%)] break-words rounded-2xl bg-secondary px-3.5 py-2 text-[15px] leading-[1.45]", className)}
    />
  );
}

/** Author name at the start of a run of messages, in a group. */
export function AuthorLine({ avatar, name, className }: { avatar: React.ReactNode; name: string; className?: string }) {
  return (
    <p className={cn("mt-2 flex items-center gap-1.5 text-[13px] text-muted-foreground", className)}>
      {avatar}
      {name}
    </p>
  );
}
