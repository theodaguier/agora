import type { Drafts, DraftType, MailItem, ViewAction, ViewActionKind, ViewBlock } from "@agora/core";
import { integrations } from "@agora/core/i18n";
import { Card } from "heroui-native";
import { tr } from "@/lib/i18n";
import { DraftCard } from "./DraftCard";
import { draftLabel } from "@/components/views/draft-label";
import { displayName } from "./format";
import { ViewChart, ViewStats } from "./ViewChart";
import { ChatList, CodeList, ContactList, DataTable, EventList, FileList, FinanceList, GenericList, MailList, MailMessage, TaskItems } from "./lists";
import { BlockHeader, blockCard } from "./block";

/* apps/web/src/components/views/ViewCard.tsx */

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
  const t = tr(integrations);
  const { view } = props;
  const count = view.kind === "list" ? view.items.length : view.kind === "table" ? view.rows.length : null;

  const openMail = (m: MailItem) => props.onAsk(`${t.open} « ${m.subject || t.noSubject} » (${displayName(m.from)})`);

  const body = () => {
    switch (view.kind) {
      case "draft":
        return null;
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

  // One muted line under the title: what the view is (its subtitle, else its type) and how many rows it has.
  const line = [view.subtitle || (view.title ? t.types[view.type] : null), count != null && count > 0 ? String(count) : null].filter(Boolean).join(" · ");

  return (
    <Card className={blockCard}>
      {/* A chart's title is its conclusion, a sentence: it wraps rather than being cut. */}
      <BlockHeader title={view.title || t.types[view.type]} description={line} titleLines={view.kind === "chart" || view.kind === "stats" ? 3 : 1} />
      {view.kind === "draft" ? (
        <DraftCard
          view={props.answer?.draft ? ({ ...view, draft: props.answer.draft } as typeof view) : view}
          answer={props.answer?.action}
          canAct={props.canAct}
          onAnswer={(action, draft, note) => props.onAnswer(action, draft, draftLabel({ ...view, draft } as typeof view), note)}
        />
      ) : (
        <Card.Body>{body()}</Card.Body>
      )}
    </Card>
  );
}
