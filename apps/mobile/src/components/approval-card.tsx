import { common } from "@agora/core/i18n";
import { useMutation } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Button, Card, useToast } from "heroui-native";
import { View } from "react-native";
import { ChevronDownIcon, ShieldCheckIcon, TerminalIcon } from "@/components/icons";
import { TapMenu } from "@/components/menus";
import { BlockHeader, blockCard, CodeBlock } from "@/components/views/block";
import { api, conversationPath } from "@/lib/api";
import { withTap } from "@/lib/haptics";
import { defineMessages, tr } from "@/lib/i18n";
import type { PendingApproval } from "@/lib/types";
import { clearApproval } from "@/lib/realtime";

/* apps/web/src/components/ApprovalCard.tsx */

type Choice = PendingApproval["choices"][number];

const messages = defineMessages({
  en: {
    choices: { once: "Allow once", session: "For this conversation", always: "Always allow", deny: "Deny" } as Record<Choice, string>,
    allow: "Allow",
    more: "Other permissions",
    wantsToRun: (bot: string) => `${bot} wants to run a command`,
    requestedBy: (bot: string) => `Approval requested by ${bot}`,
    asks: (bot: string) => `${bot} is asking for your approval`,
    waiting: "Waiting for the person who started the request.",
    denied: "Denied",
    allowed: "Allowed",
  },
  fr: {
    choices: { once: "Autoriser une fois", session: "Pour cette conversation", always: "Toujours autoriser", deny: "Refuser" },
    allow: "Autoriser",
    more: "Autres autorisations",
    wantsToRun: (bot: string) => `${bot} veut exécuter une commande`,
    requestedBy: (bot: string) => `Autorisation demandée par ${bot}`,
    asks: (bot: string) => `${bot} demande ton autorisation`,
    waiting: "En attente de la personne qui a lancé la demande.",
    denied: "Refusé",
    allowed: "Autorisé",
  },
});

/** Each broader permission as an SF Symbol in its menu. */
const CHOICE_ICON: Record<Exclude<Choice, "deny" | "once">, string> = { always: "checkmark.shield", session: "bubble.left.and.bubble.right" };

/**
 * The agent is waiting for approval before running a sensitive action (web: ApprovalCard): what it asks
 * and its command; « Refuser » on the left, « Autoriser » on the right with the broader permissions behind its arrow.
 */
export function ApprovalCard(props: { conversationId: string; turnId: string; botName: string; approval: PendingApproval; canAnswer: boolean }) {
  const { conversationId, turnId, botName, approval, canAnswer } = props;
  const t = messages;
  const co = tr(common);
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
      toast.show(choice === "deny" ? { variant: "default", label: t.denied } : { variant: "success", label: t.allowed, description: t.choices[choice as Choice] });
    },
    onError: (error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ variant: "danger", label: error.message });
    },
  });
  const choices = approval.choices;
  const broader = choices.filter((c): c is Exclude<Choice, "deny" | "once"> => c !== "deny" && c !== "once");
  const label = (c: Choice) => (answer.isPending && answer.variables === c ? co.inProgress : c === "once" ? t.allow : t.choices[c]);

  return (
    <Card role="alert" accessibilityLabel={t.requestedBy(botName)} className={blockCard}>
      <BlockHeader
        icon={approval.command ? <TerminalIcon size={16} className="text-muted" /> : <ShieldCheckIcon size={16} className="text-muted" />}
        title={approval.command ? t.wantsToRun(botName) : t.asks(botName)}
        description={!canAnswer ? t.waiting : approval.description || undefined}
      />
      {!!approval.command && (
        <Card.Body>
          <CodeBlock>{approval.command}</CodeBlock>
        </Card.Body>
      )}
      {canAnswer && (
        <Card.Footer className="flex-row items-center justify-between gap-2">
          {choices.includes("deny") ? (
            <Button size="sm" variant="secondary" isDisabled={answer.isPending} onPress={withTap(() => answer.mutate("deny"))}>
              {label("deny")}
            </Button>
          ) : (
            <View />
          )}
          {choices.includes("once") ? (
            <View className="flex-row items-center gap-1">
              <Button size="sm" isDisabled={answer.isPending} onPress={withTap(() => answer.mutate("once"))}>
                {label("once")}
              </Button>
              {broader.length > 0 && (
                <TapMenu accessibilityLabel={t.more} actions={broader.map((c) => ({ label: t.choices[c], icon: CHOICE_ICON[c], onPress: () => answer.mutate(c) }))}>
                  <Button isIconOnly size="sm" isDisabled={answer.isPending} accessibilityLabel={t.more}>
                    <ChevronDownIcon size={16} className="text-accent-foreground" />
                  </Button>
                </TapMenu>
              )}
            </View>
          ) : (
            <View className="flex-row flex-wrap justify-end gap-2">
              {broader.map((c) => (
                <Button key={c} size="sm" variant="secondary" isDisabled={answer.isPending} onPress={withTap(() => answer.mutate(c))}>
                  {label(c)}
                </Button>
              ))}
            </View>
          )}
        </Card.Footer>
      )}
    </Card>
  );
}
