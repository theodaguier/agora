import { useMutation } from "@tanstack/react-query";
import { ShieldAlertIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BlockCard, BlockFooter } from "@/components/views/block";
import { api, conversationPath, type PendingApproval } from "@/lib/api";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";
import { clearApproval } from "@/lib/realtime";
import { contentKeys } from "@/lib/utils";

const messages = defineMessages({
  en: {
    choices: { once: "Allow", session: "Allow for this conversation", always: "Always allow", deny: "Deny" } as Record<PendingApproval["choices"][number], string>,
    requestedBy: (bot: string) => `Approval requested by ${bot}`,
    asks: (bot: string) => `${bot} is asking for your approval`,
    waiting: "Waiting for the person who started the request.",
    denied: "Denied:",
    allowed: "Allowed:",
  },
  fr: {
    choices: { once: "Autoriser", session: "Autoriser pour la conversation", always: "Toujours autoriser", deny: "Refuser" },
    requestedBy: (bot: string) => `Autorisation demandée par ${bot}`,
    asks: (bot: string) => `${bot} demande ton autorisation`,
    waiting: "En attente de la personne qui a lancé la demande.",
    denied: "Refusé :",
    allowed: "Autorisé :",
  },
});

/** The agent is waiting for approval before running a sensitive action. */
export function ApprovalCard(props: { conversationId: string; turnId: string; botName: string; approval: PendingApproval; canAnswer: boolean }) {
  const { conversationId, turnId, botName, approval, canAnswer } = props;
  const t = useT(messages);
  const co = useT(common);
  const labels = t.choices;
  const answer = useMutation({
    mutationFn: (choice: string) =>
      api(conversationPath(conversationId, `/turns/${encodeURIComponent(turnId)}/approval`), {
        method: "POST",
        body: JSON.stringify({ approvalId: approval.id, choice }),
      }),
    onSuccess: () => clearApproval(conversationId, turnId),
    meta: { error: false },
  });
  const allow = approval.choices.filter((c) => c !== "deny");
  // The primary choice (the first one) on the far right, the broader ones before it.
  const variant = (c: string, i: number) => (i === 0 ? "default" : c === "session" ? "outline" : "ghost");

  return (
    <BlockCard role="region" aria-label={t.requestedBy(botName)}>
      <CardHeader className="grid-cols-[auto_1fr] gap-x-2.5">
        <ShieldAlertIcon aria-hidden className="mt-0.5 size-[18px] text-warning" />
        <CardTitle className="font-semibold">{t.asks(botName)}</CardTitle>
        {approval.description && <CardDescription className="col-start-2">{approval.description}</CardDescription>}
      </CardHeader>
      {(approval.command || !canAnswer || answer.error) && (
        <CardContent className="flex flex-col gap-3">
          {approval.command && (
            <pre className="max-h-40 overflow-auto rounded-[10px] bg-muted px-3 py-2.5 font-mono text-xs break-all whitespace-pre-wrap">{approval.command}</pre>
          )}
          {!canAnswer && <p className="text-sm text-muted-foreground">{t.waiting}</p>}
          {answer.error && <p className="text-sm text-destructive">{answer.error.message}</p>}
        </CardContent>
      )}
      {canAnswer && (
        <BlockFooter>
          {approval.choices.includes("deny") && (
            <Button size="sm" variant="ghost" className="mr-auto text-destructive hover:text-destructive" disabled={answer.isPending} onClick={() => answer.mutate("deny")}>
              {labels.deny}
            </Button>
          )}
          {allow
            .map((c, i) => (
              <Button key={c} size="sm" variant={variant(c, i)} disabled={answer.isPending} onClick={() => answer.mutate(c)}>
                {answer.isPending && answer.variables === c ? co.inProgress : labels[c]}
              </Button>
            ))
            .reverse()}
        </BlockFooter>
      )}
    </BlockCard>
  );
}

/** Reminder, in the history, of the approvals given during the reply. */
export function ApprovalLog({ approvals }: { approvals: { command: string; choice: string }[] }) {
  const t = useT(messages);
  return (
    <div className="my-1 flex flex-col gap-0.5 text-[13px] text-muted-foreground">
      {contentKeys(approvals, (a) => `${a.choice}:${a.command}`).map(([key, a]) => (
        <p key={key} className="flex min-w-0 items-center gap-1.5">
          <ShieldAlertIcon className="size-3.5 shrink-0" />
          <span className="shrink-0">{a.choice === "deny" ? t.denied : t.allowed}</span>
          <code className="truncate font-mono text-xs text-foreground/80">{a.command}</code>
        </p>
      ))}
    </div>
  );
}
