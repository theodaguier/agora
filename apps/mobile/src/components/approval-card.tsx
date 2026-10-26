import { common } from "@agora/core/i18n";
import { useMutation } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Button, Card, LinkButton, Typography, useToast } from "heroui-native";
import { View } from "react-native";
import { CheckIcon, CloseIcon } from "@/components/icons";
import { CodeBlock } from "@/components/views/block";
import { api, conversationPath } from "@/lib/api";
import { withTap } from "@/lib/haptics";
import { defineMessages, tr } from "@/lib/i18n";
import type { PendingApproval } from "@/lib/types";
import { clearApproval } from "@/lib/realtime";

/* apps/web/src/components/ApprovalCard.tsx */

type Choice = PendingApproval["choices"][number];

const messages = defineMessages({
  en: {
    choices: { once: "Allow", session: "Allow for this conversation", always: "Always allow", deny: "Deny" } as Record<Choice, string>,
    short: { once: "Allow", session: "This conversation", always: "Always", deny: "Deny" } as Record<Choice, string>,
    wantsToRun: (bot: string) => `${bot} wants to run a command`,
    requestedBy: (bot: string) => `Approval requested by ${bot}`,
    asks: (bot: string) => `${bot} is asking for your approval`,
    waiting: "Waiting for the person who started the request.",
    denied: "Denied",
    allowed: "Allowed",
  },
  fr: {
    choices: { once: "Autoriser", session: "Autoriser pour la conversation", always: "Toujours autoriser", deny: "Refuser" },
    short: { once: "Autoriser", session: "Cette conversation", always: "Toujours", deny: "Refuser" },
    wantsToRun: (bot: string) => `${bot} veut exécuter une commande`,
    requestedBy: (bot: string) => `Autorisation demandée par ${bot}`,
    asks: (bot: string) => `${bot} demande ton autorisation`,
    waiting: "En attente de la personne qui a lancé la demande.",
    denied: "Refusé",
    allowed: "Autorisé",
  },
});

/** The agent is waiting for approval before running a sensitive action: one card, the request, the command, the answers. */
export function ApprovalCard(props: { conversationId: string; turnId: string; botName: string; approval: PendingApproval; canAnswer: boolean }) {
  const { conversationId, turnId, botName, approval, canAnswer } = props;
  const t = messages;
  const co = tr(common);
  const labels = t.choices;
  const { toast } = useToast();
  const answer = useMutation({
    mutationFn: (choice: string) =>
      api(conversationPath(conversationId, `/turns/${encodeURIComponent(turnId)}/approval`), {
        method: "POST",
        body: JSON.stringify({ approvalId: approval.id, choice }),
      }),
    onSuccess: (_, choice) => {
      clearApproval(conversationId, turnId, approval.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(choice === "deny" ? { variant: "default", label: t.denied } : { variant: "success", label: t.allowed, description: labels[choice as Choice] });
    },
    onError: (error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ variant: "danger", label: error.message });
    },
  });
  // Figma « Carte d'autorisation »: Refuser, Toujours (grey), Autoriser (the accent: the bot's colour).
  const row = (["deny", "always", "once"] as const).filter((c) => approval.choices.includes(c));
  const choice = (c: Choice) => (
    <Button key={c} size="sm" variant={c === "once" ? "primary" : "secondary"} className="flex-1" isDisabled={answer.isPending} onPress={withTap(() => answer.mutate(c))}>
      <Button.Label numberOfLines={1}>{answer.isPending && answer.variables === c ? co.inProgress : t.short[c]}</Button.Label>
    </Button>
  );

  return (
    <Card role="alert" accessibilityLabel={t.requestedBy(botName)} className="w-full gap-3 rounded-[14px] border border-border bg-background px-4 py-3.5">
      <Card.Body className="gap-3">
        <Typography>{approval.command ? t.wantsToRun(botName) : t.asks(botName)}</Typography>
        {!!approval.command && <CodeBlock>{approval.command}</CodeBlock>}
      </Card.Body>
      <Card.Footer className="gap-2">
        {canAnswer ? (
          <>
            <View className="flex-row gap-2">{row.map(choice)}</View>
            {approval.choices.includes("session") && (
              <LinkButton size="sm" className="self-center" isDisabled={answer.isPending} onPress={withTap(() => answer.mutate("session"))}>
                {labels.session}
              </LinkButton>
            )}
          </>
        ) : (
          <Typography.Paragraph type="body-sm" color="muted">
            {t.waiting}
          </Typography.Paragraph>
        )}
      </Card.Footer>
    </Card>
  );
}

/** Figma « Trace »: a decided command, one grey line in the history (check, the command, the answer). */
export function ApprovalLog({ approvals }: { approvals: { command: string; choice: string }[] }) {
  const t = messages;
  return (
    <View className="gap-0.5">
      {approvals.map((a, i) => (
        <View key={i} className="min-w-0 flex-row items-center gap-1.5 pl-3">
          {a.choice === "deny" ? <CloseIcon size={14} className="text-subtle" /> : <CheckIcon size={14} className="text-subtle" />}
          <Typography.Code numberOfLines={1} className="shrink text-muted">
            {a.command}
          </Typography.Code>
          <Typography type="body-xs" className="shrink-0 text-subtle">
            · {a.choice === "deny" ? t.denied.toLowerCase() : t.allowed.toLowerCase()}
          </Typography>
        </View>
      ))}
    </View>
  );
}
