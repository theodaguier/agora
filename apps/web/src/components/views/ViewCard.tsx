import type { Drafts, DraftType, MailItem, ViewAction, ViewActionKind, ViewBlock } from "@agora/core";
import { lazy, Suspense } from "react";
import { integrations } from "@agora/core/i18n";
import { CardContent } from "@/components/ui/card";
import { ChartIcon, IntegrationIcon, MapPinIcon } from "@/components/icons";
import { PlaceList } from "./PlaceMap";
import { defineMessages, useT } from "@/i18n";
import { BlockCard, BlockHeader } from "./block";
import { SourceLogo } from "@/components/ProviderLogo";
import { DraftCard } from "./DraftCard";
import { draftLabel } from "./format";
import { displayName } from "./format";
import { Spinner } from "@/components/ui/spinner";
import { ChatList, CodeList, ContactList, DataTable, EventList, FileList, FinanceList, GenericList, MailList, MailMessage, TaskItems } from "./lists";

const ViewChart = lazy(() => import("./ViewChart").then((m) => ({ default: m.ViewChart })));
const ViewStats = lazy(() => import("./ViewChart").then((m) => ({ default: m.ViewStats })));

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
  const count = view.kind === "list" ? view.items.length : view.kind === "table" ? view.rows.length : view.kind === "place" ? view.places.length : null;

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
        return <Suspense fallback={<Spinner className="mx-auto" />}><ViewChart view={view} /></Suspense>;
      case "place":
        return <PlaceList view={view} />;
      case "stats":
        return <Suspense fallback={<Spinner className="mx-auto" />}><ViewStats view={view} /></Suspense>;
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

  // One muted line under the title: where it comes from; how many there are goes in a badge.
  // Untitled, a block is named after the integration it read (« HubSpot »), not its kind (« Contacts et CRM »).
  const source = view.source ? serverName(view.source) : null;
  const title = view.title || source || t.types[view.type];
  // The integration is said by its logo: never its name again in grey beside the title.
  const subtitle = view.kind === "draft" ? (view.subtitle ?? m.draft[view.type]) : view.subtitle;

  // Files are attachments, not a list in a box: their tiles, bare, under the reply.
  // A table is read as the message's own tables: bare, under the reply, not a box holding a box.
  if (view.kind === "table") return <DataTable view={view} />;
  if (view.kind === "list" && view.type === "files") return <FileList items={view.items} source={view.source && serverName(view.source)} />;

  return (
    <BlockCard>
      {/* A chart's title is its conclusion, a sentence: it wraps rather than being cut. Its icon: what kind of data, or a chart. */}
      <BlockHeader
        // The integration it called (GitHub, Gmail…) by its logo; a chart of no known source, a chart.
        icon={<SourceLogo source={view.source} fallback={view.kind === "place" ? <MapPinIcon className="size-4" /> : view.kind === "chart" || view.kind === "stats" ? <ChartIcon className="size-4" /> : <IntegrationIcon type={view.type} className="size-4" />} />}
        title={title}
        titleClassName={view.kind === "chart" || view.kind === "stats" ? "line-clamp-2" : "truncate"}
        // What it is (« Brouillon de mail ») or how many, on the right: the title stays alone beside its logo.
        action={
          count ? (
            <span className="text-xs text-subtle-foreground tabular-nums">{count}</span>
          ) : subtitle ? (
            <span className="text-xs text-subtle-foreground">{subtitle}</span>
          ) : undefined
        }
      />
      {/* A draft lays out its own form; a map runs edge to edge. */}
      {view.kind === "draft" || view.kind === "place" ? body() : <CardContent className="text-ui">{body()}</CardContent>}
    </BlockCard>
  );
}

/** "google-calendar" → "Google Calendar": the MCP server's name, as a person would write it. */
const serverName = (server: string) => server.replace(/[-_]+/g, " ").replace(/(^|\s)\S/g, (c) => c.toUpperCase());
