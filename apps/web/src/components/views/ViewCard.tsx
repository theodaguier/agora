import type { Drafts, DraftType, MailItem, ViewAction, ViewActionKind, ViewBlock } from "@agora/core";
import { integrations } from "@agora/core/i18n";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { defineMessages, useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { BlockCard } from "./block";
import { DraftCard } from "./DraftCard";
import { draftLabel } from "./format";
import { displayName } from "./format";
import { ViewChart, ViewStats } from "./ViewChart";
import { ChatList, CodeList, ContactList, DataTable, EventList, FileList, FinanceList, GenericList, MailList, MailMessage, TaskItems } from "./lists";

const messages = defineMessages({
  en: { draft: { mail: "Mail draft", calendar: "Event draft", chat: "Message draft", tasks: "Task draft" } as Record<DraftType, string> },
  fr: { draft: { mail: "Brouillon de mail", calendar: "Brouillon d'événement", chat: "Brouillon de message", tasks: "Brouillon de tâche" } },
});

/**
 * A view of connector data shown by a bot (```view``` block): a list, a message,
 * a table, a chart, key figures or a draft to confirm, rendered by integration type, whatever the provider.
 */
export function ViewCard(props: {
  view: ViewBlock;
  /** The employee's answer to this draft, if any. */
  answer?: ViewAction;
  /** Member of the conversation, able to answer a draft or ask the bot. */
  canAct: boolean;
  onAnswer: (action: ViewActionKind, draft: Drafts[DraftType], label: string, note?: string) => Promise<void> | void;
  onAsk: (text: string) => void;
}) {
  const t = useT(integrations);
  const m = useT(messages);
  const { view } = props;
  const count = view.kind === "list" ? view.items.length : view.kind === "table" ? view.rows.length : null;

  const openMail = (m: MailItem) => props.onAsk(`${t.open} « ${m.subject || t.noSubject} » (${displayName(m.from)})`);

  const body = () => {
    switch (view.kind) {
      case "draft":
        return (
          <DraftCard
            view={props.answer?.draft ? ({ ...view, draft: props.answer.draft } as typeof view) : view}
            answer={props.answer?.action}
            canAct={props.canAct}
            onAnswer={(action, draft, note) => props.onAnswer(action, draft, draftLabel({ ...view, draft } as typeof view), note)}
          />
        );
      case "message":
        return <MailMessage view={view} />;
      case "table":
        return <DataTable view={view} />;
      case "chart":
        return <ViewChart view={view} />;
      case "stats":
        return <ViewStats view={view} />;
      case "list":
        switch (view.type) {
          case "mail":
            return <MailList items={view.items} onAsk={props.canAct ? openMail : undefined} />;
          case "calendar":
            return <EventList items={view.items} />;
          case "chat":
            return <ChatList items={view.items} />;
          case "tasks":
            return <TaskItems items={view.items} />;
          case "files":
            return <FileList items={view.items} />;
          case "contacts":
            return <ContactList items={view.items} />;
          case "finance":
            return <FinanceList items={view.items} />;
          case "code":
            return <CodeList items={view.items} />;
          default:
            return <GenericList items={view.items} />;
        }
    }
  };

  // One muted line under the title: where it comes from, and how many there are.
  const subtitle =
    view.kind === "draft"
      ? (view.subtitle ?? m.draft[view.type])
      : [view.subtitle ?? (view.source && serverName(view.source)), count ? String(count) : null].filter(Boolean).join(" · ");
  const padded = view.kind !== "list";

  return (
    <BlockCard className={cn(view.kind === "list" && "gap-3")}>
      <CardHeader>
        {/* A chart's title is its conclusion, a sentence: it wraps rather than being cut. */}
        <CardTitle className={cn("font-semibold text-pretty", view.kind === "chart" || view.kind === "stats" ? "line-clamp-2" : "truncate")}>
          {view.title || t.types[view.type]}
        </CardTitle>
        {subtitle && <CardDescription className="text-pretty">{subtitle}</CardDescription>}
      </CardHeader>
      {view.kind === "draft" ? body() : padded ? <CardContent>{body()}</CardContent> : body()}
    </BlockCard>
  );
}

/** "google-calendar" → "Google Calendar": the MCP server's name, as a person would write it. */
const serverName = (server: string) => server.replace(/[-_]+/g, " ").replace(/(^|\s)\S/g, (c) => c.toUpperCase());
