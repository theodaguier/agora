import { useMutation } from "@tanstack/react-query";
import { ShieldAlertIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
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

  return (
    <section aria-label={t.requestedBy(botName)} className="w-full max-w-[min(680px,88%)] rounded-2xl bg-secondary p-3.5">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent">
          <ShieldAlertIcon className="size-4 text-warning" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium leading-snug">{t.asks(botName)}</p>
          {approval.description && <p className="mt-0.5 text-[15px] leading-snug text-muted-foreground">{approval.description}</p>}
          {approval.command && (
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-background px-3 py-2 font-mono text-xs">{approval.command}</pre>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 pl-12">
        {canAnswer ? (
          <>
            {allow.map((c, i) => (
              <Button key={c} size="sm" variant={i === 0 ? "default" : "secondary"} disabled={answer.isPending} onClick={() => answer.mutate(c)}>
                {answer.isPending && answer.variables === c ? co.inProgress : labels[c]}
              </Button>
            ))}
            {approval.choices.includes("deny") && (
              <Button size="sm" variant="ghost" disabled={answer.isPending} onClick={() => answer.mutate("deny")}>
                {labels.deny}
              </Button>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t.waiting}</p>
        )}
        {answer.error && <p className="w-full text-sm text-destructive">{answer.error.message}</p>}
      </div>
    </section>
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
          <code className="truncate font-mono text-[12px] text-foreground/80">{a.command}</code>
        </p>
      ))}
    </div>
  );
}
