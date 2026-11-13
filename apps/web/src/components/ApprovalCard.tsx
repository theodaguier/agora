import { useMutation } from "@tanstack/react-query";
import { ChatIntegrationIcon, CheckIcon, ChevronDownIcon, ShieldCheckIcon, TerminalIcon } from "@/components/icons";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuShortcut, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { BlockCard, BlockFooter, BlockHeader } from "@/components/views/block";
import { api, conversationPath, type AgentSummary, type PendingApproval } from "@/lib/api";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";
import { clearApproval } from "@/lib/realtime";

const messages = defineMessages({
  en: {
    choices: { once: "Allow once", session: "For this conversation", always: "Always allow", deny: "Deny" } as Record<PendingApproval["choices"][number], string>,
    asks: (bot: string) => `${bot} is asking for your approval`,
    wantsToRun: (bot: string) => `${bot} wants to run a command`,
    requestedBy: (bot: string) => `Approval requested by ${bot}`,
    waiting: "Waiting for the person who started the request.",
    allow: "Allow",
    more: "Other permissions",
  },
  fr: {
    choices: { once: "Autoriser une fois", session: "Pour cette conversation", always: "Toujours autoriser", deny: "Refuser" },
    asks: (bot: string) => `${bot} demande ton autorisation`,
    wantsToRun: (bot: string) => `${bot} veut exécuter une commande`,
    requestedBy: (bot: string) => `Autorisation demandée par ${bot}`,
    waiting: "En attente de la personne qui a lancé la demande.",
    allow: "Autoriser",
    more: "Autres autorisations",
  },
});

/**
 * The agent is waiting for approval before running a sensitive action: the request as the card's
 * title, the command, then the answers in the footer: Refuser on the left, « Autoriser » (once) on
 * the right, the broader permissions behind its arrow. Keys 1–4 answer.
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
    <BlockCard aria-label={t.requestedBy(botName)} role="region">
      <BlockHeader
        icon={approval.command ? <TerminalIcon className="size-4" /> : <ShieldCheckIcon className="size-4" />}
        title={approval.command ? t.wantsToRun(botName) : t.asks(botName)}
        description={!canAnswer ? t.waiting : approval.description || undefined}
      />
      {(approval.command || answer.error) && (
        <CardContent className="flex flex-col gap-2">
          {approval.command && (
            <pre title={approval.description || undefined} className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs">
              <code>{approval.command}</code>
            </pre>
          )}
          {answer.error && <p className="text-destructive">{answer.error.message}</p>}
        </CardContent>
      )}
      {canAnswer && (
        <BlockFooter role="group" aria-label={t.requestedBy(botName)} className="justify-between">
          {choices.includes("deny") ? button("deny", "secondary") : <span />}
          {choices.includes("once") && broader.length > 0 ? (
            <ButtonGroup>
              {button("once", "default")}
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button size="icon" aria-label={t.more} disabled={answer.isPending} />}>
                  <ChevronDownIcon />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-56">
                  <DropdownMenuGroup>
                    {broader.map((c) => (
                      <DropdownMenuItem key={c} onClick={() => answer.mutate(c)}>
                        {c === "always" ? <ShieldCheckIcon /> : c === "session" ? <ChatIntegrationIcon /> : <CheckIcon />}
                        {t.choices[c]}
                        <DropdownMenuShortcut>{choices.indexOf(c) + 1}</DropdownMenuShortcut>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </ButtonGroup>
          ) : (
            <div className="flex flex-wrap gap-2">
              {broader.map((c) => button(c, "secondary"))}
              {choices.includes("once") && button("once", "default")}
            </div>
          )}
        </BlockFooter>
      )}
    </BlockCard>
  );
}
