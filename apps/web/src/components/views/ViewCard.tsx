import type { Drafts, DraftType, MailItem, ViewAction, ViewActionKind, ViewBlock } from "@agora/core";
import { integrations } from "@agora/core/i18n";
import { IntegrationTile } from "@/components/marketplace/IntegrationType";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/i18n";
import { DraftCard } from "./DraftCard";
import { draftLabel } from "./format";
import { displayName } from "./format";
import { ViewChart } from "./ViewChart";
import { ChatList, CodeList, ContactList, DataTable, EventList, FileList, FinanceList, GenericList, MailList, MailMessage, TaskItems } from "./lists";

/**
 * A view of connector data shown by a bot (```view``` block): a list, a message,
 * a table or a draft to confirm, rendered by integration type, whatever the provider.
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

  return (
    <section className="w-full max-w-[min(680px,88%)] rounded-2xl bg-secondary p-2.5">
      <header className="mb-1.5 flex items-center gap-2.5 px-1">
        <IntegrationTile type={view.type} server={view.source} className="size-8 rounded-lg [&_svg]:size-4" />
        <h3 className="min-w-0 flex-1 truncate text-[15px] font-medium">{view.title || t.types[view.type]}</h3>
        {count != null && count > 0 && (
          <Badge variant="secondary" className="bg-accent font-normal tabular-nums text-muted-foreground">
            {count}
          </Badge>
        )}
      </header>
      <div className={view.kind === "draft" || view.kind === "message" ? "px-1.5 pb-1.5 pt-1" : undefined}>{body()}</div>
    </section>
  );
}
