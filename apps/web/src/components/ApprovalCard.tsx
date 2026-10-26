import { useMutation } from "@tanstack/react-query";
import { CheckIcon, ChevronDownIcon, CloseIcon } from "@/components/icons";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api, conversationPath, type AgentSummary, type PendingApproval } from "@/lib/api";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";
import { clearApproval } from "@/lib/realtime";
import { contentKeys } from "@/lib/utils";

const messages = defineMessages({
  en: {
    choices: { once: "Allow once", session: "For this conversation", always: "Always allow", deny: "Deny" } as Record<PendingApproval["choices"][number], string>,
    asks: (bot: string) => `${bot} is asking for your approval`,
    wantsToRun: (bot: string) => `${bot} wants to run a command`,
    requestedBy: (bot: string) => `Approval requested by ${bot}`,
    waiting: "Waiting for the person who started the request.",
    denied: "denied",
    allowed: "allowed",
    allow: "Allow",
    more: "Other permissions",
  },
  fr: {
    choices: { once: "Autoriser une fois", session: "Pour cette conversation", always: "Toujours autoriser", deny: "Refuser" },
    asks: (bot: string) => `${bot} demande ton autorisation`,
    wantsToRun: (bot: string) => `${bot} veut exécuter une commande`,
    requestedBy: (bot: string) => `Autorisation demandée par ${bot}`,
    waiting: "En attente de la personne qui a lancé la demande.",
    denied: "refusé",
    allowed: "autorisé",
    allow: "Autoriser",
    more: "Autres autorisations",
  },
});

/**
 * The agent is waiting for approval before running a sensitive action. Figma « Carte d'autorisation »:
 * one white card, the request as its first line, the command, then the answers on one row: Refuser on
 * the left, « Autoriser » (once) in the bot's colour on the right, the broader permissions behind its
 * arrow. Keys 1–4 answer.
 */
export function ApprovalCard(props: { conversationId: string; turnId: string; botName: string; bot?: AgentSummary; approval: PendingApproval; canAnswer: boolean }) {
  const { conversationId, turnId, botName, approval, canAnswer } = props;
  const t = useT(messages);
  const co = useT(common);
  const answer = useMutation({
    mutationFn: (choice: string) =>
      api(conversationPath(conversationId, `/turns/${encodeURIComponent(turnId)}/approval`), {
        method: "POST",
        body: JSON.stringify({ approvalId: approval.id, choice }),
      }),
    onSuccess: () => clearApproval(conversationId, turnId),
    meta: { error: false },
  });
  // Allowing first (narrowest to broadest), denying last: the order of the keys 1–4.
  const choices = [...approval.choices.filter((c) => c !== "deny"), ...approval.choices.filter((c) => c === "deny")];
  const broader = choices.filter((c) => c !== "deny" && c !== "once");

  useEffect(() => {
    if (!canAnswer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || answer.isPending) return;
      if ((e.target as HTMLElement).closest?.("input, textarea, select, [contenteditable]")) return;
      const choice = choices[Number(e.key) - 1];
      if (!choice) return;
      e.preventDefault();
      answer.mutate(choice);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const button = (c: PendingApproval["choices"][number], variant: "default" | "secondary") => (
    <Button key={c} variant={variant} disabled={answer.isPending} onClick={() => answer.mutate(c)} title={`${choices.indexOf(c) + 1}`}>
      {answer.isPending && answer.variables === c ? co.inProgress : c === "once" ? t.allow : t.choices[c]}
    </Button>
  );

  return (
    <section
      aria-label={t.requestedBy(botName)}
      className="flex w-full max-w-[520px] flex-col gap-3 rounded-[14px] border border-border bg-background px-4 py-3.5"
    >
      <p className="text-[15px] leading-[21px]">{approval.command ? t.wantsToRun(botName) : t.asks(botName)}</p>
      {approval.command && (
        <code title={approval.description || undefined} className="block w-full overflow-x-auto rounded-[10px] bg-muted px-3 py-2.5 font-mono text-[13.5px] leading-[18px] whitespace-pre">{approval.command}</code>
      )}
      {canAnswer ? (
        <div role="group" aria-label={t.requestedBy(botName)} className="flex flex-wrap items-center gap-2">
          {choices.includes("deny") && button("deny", "secondary")}
          <span className="flex-1" />
          {choices.includes("once") && broader.length > 0 ? (
            <ButtonGroup>
              {button("once", "default")}
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button size="icon" aria-label={t.more} disabled={answer.isPending} className="border-l border-primary-foreground/20" />}>
                  <ChevronDownIcon />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-56">
                  {broader.map((c) => (
                    <DropdownMenuItem key={c} onClick={() => answer.mutate(c)}>
                      {t.choices[c]}
                      <span className="ml-auto text-xs text-muted-foreground tabular-nums">{choices.indexOf(c) + 1}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </ButtonGroup>
          ) : (
            <>
              {broader.map((c) => button(c, "secondary"))}
              {choices.includes("once") && button("once", "default")}
            </>
          )}
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">{t.waiting}</p>
      )}
      {answer.error && <p className="text-[13px] text-destructive">{answer.error.message}</p>}
    </section>
  );
}

/** Figma « Trace »: a decided command, one grey line in the history (check, the command, the answer). */
export function ApprovalLog({ approvals }: { approvals: { command: string; choice: string }[] }) {
  const t = useT(messages);
  return (
    <div className="flex flex-col gap-0.5">
      {contentKeys(approvals, (a) => `${a.choice}:${a.command}`).map(([key, a]) => (
        <p key={key} className="flex min-w-0 items-center gap-1.5 py-0.5 pl-3">
          {a.choice === "deny" ? <CloseIcon className="size-3.5 shrink-0 text-subtle" /> : <CheckIcon className="size-3.5 shrink-0 text-subtle" />}
          <code className="truncate font-mono text-[12.5px] leading-[18px] text-muted-foreground">{a.command}</code>
          <span className="shrink-0 text-xs text-subtle">· {a.choice === "deny" ? t.denied : t.allowed}</span>
        </p>
      ))}
    </div>
  );
}
