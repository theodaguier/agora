import { common } from "@agora/core/i18n";
import { useMutation } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Accordion, Avatar, Button, Card, Chip, LinkButton, Popover, Typography, useThemeColor, useToast } from "heroui-native";
import { View } from "react-native";
import { ShieldAlertIcon } from "@/components/icons";
import { api, conversationPath } from "@/lib/api";
import { withTap } from "@/lib/haptics";
import { defineMessages, tr } from "@/lib/i18n";
import type { PendingApproval } from "@/lib/types";
import { usePopoverInsets } from "@/lib/popover-insets";
import { clearApproval } from "@/lib/realtime";

/* apps/web/src/components/ApprovalCard.tsx */

type Choice = PendingApproval["choices"][number];

const messages = defineMessages({
  en: {
    choices: { once: "Allow", session: "Allow for this conversation", always: "Always allow", deny: "Deny" } as Record<Choice, string>,
    requestedBy: (bot: string) => `Approval requested by ${bot}`,
    asks: (bot: string) => `${bot} is asking for your approval`,
    waiting: "Waiting for the person who started the request.",
    denied: "Denied",
    allowed: "Allowed",
    command: "Command",
    helpLink: "What do these choices mean?",
    helpTitle: "Your choices",
    help: {
      once: "Runs this action this time only; the agent will ask again next time.",
      session: "Allows this kind of action until the end of this conversation.",
      always: "Allows this kind of action from now on, without asking again.",
      deny: "The action is not run; the agent is told and carries on without it.",
    } as Record<Choice, string>,
  },
  fr: {
    choices: { once: "Autoriser", session: "Autoriser pour la conversation", always: "Toujours autoriser", deny: "Refuser" },
    requestedBy: (bot: string) => `Autorisation demandée par ${bot}`,
    asks: (bot: string) => `${bot} demande ton autorisation`,
    waiting: "En attente de la personne qui a lancé la demande.",
    denied: "Refusé",
    allowed: "Autorisé",
    command: "Commande",
    helpLink: "Que signifient ces choix ?",
    helpTitle: "Tes choix",
    help: {
      once: "Exécute cette action cette fois seulement ; l'agent redemandera la prochaine fois.",
      session: "Autorise ce type d'action jusqu'à la fin de cette conversation.",
      always: "Autorise ce type d'action désormais, sans redemander.",
      deny: "L'action n'est pas exécutée ; l'agent en est informé et continue sans elle.",
    },
  },
});

/** The agent is waiting for approval before running a sensitive action. */
export function ApprovalCard(props: { conversationId: string; turnId: string; botName: string; approval: PendingApproval; canAnswer: boolean }) {
  const insets = usePopoverInsets();
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
  const allow = approval.choices.filter((c) => c !== "deny");
  const warning = useThemeColor("warning-soft-foreground");

  return (
    <Card role="alert" accessibilityLabel={t.requestedBy(botName)} className="w-full max-w-[92%] gap-4">
      <Card.Header className="flex-row items-start gap-3">
        <Avatar alt="" size="md" variant="soft" color="warning">
          <Avatar.Fallback>
            <ShieldAlertIcon size={20} color={warning} />
          </Avatar.Fallback>
        </Avatar>
        <View className="min-w-0 flex-1 gap-0.5">
          <Card.Title>{t.asks(botName)}</Card.Title>
          {!!approval.description && <Card.Description>{approval.description}</Card.Description>}
        </View>
      </Card.Header>

      <Card.Body className="gap-2">
        {!!approval.command && (
          <Accordion variant="surface" defaultValue="command">
            <Accordion.Item value="command">
              <Accordion.Trigger>
                <Typography className="flex-1">{t.command}</Typography>
                <Accordion.Indicator />
              </Accordion.Trigger>
              <Accordion.Content>
                <Typography type="code" selectable>
                  {approval.command}
                </Typography>
              </Accordion.Content>
            </Accordion.Item>
          </Accordion>
        )}
        {canAnswer && (
          <Popover>
            <Popover.Trigger asChild>
              <LinkButton size="sm" className="self-start">
                {t.helpLink}
              </LinkButton>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Overlay />
              <Popover.Content presentation="popover" width={320} placement="top" insets={insets} className="gap-3">
                <Popover.Close className="absolute right-2 top-2 z-50" />
                <Popover.Title>{t.helpTitle}</Popover.Title>
                {approval.choices.map((c) => (
                  <View key={c} className="gap-0.5">
                    <Typography type="body-sm" weight="medium">
                      {labels[c]}
                    </Typography>
                    <Popover.Description>{t.help[c]}</Popover.Description>
                  </View>
                ))}
              </Popover.Content>
            </Popover.Portal>
          </Popover>
        )}
      </Card.Body>

      <Card.Footer className="gap-2">
        {canAnswer ? (
          <>
            {allow.map((c, i) => (
              <Button key={c} variant={i === 0 ? "primary" : "secondary"} isDisabled={answer.isPending} onPress={withTap(() => answer.mutate(c))}>
                {answer.isPending && answer.variables === c ? co.inProgress : labels[c]}
              </Button>
            ))}
            {approval.choices.includes("deny") && (
              <Button variant="danger-soft" isDisabled={answer.isPending} onPress={withTap(() => answer.mutate("deny"))}>
                {labels.deny}
              </Button>
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

/** Reminder, in the history, of the approvals given during the reply. */
export function ApprovalLog({ approvals }: { approvals: { command: string; choice: string }[] }) {
  const t = messages;
  return (
    <View className="my-1 flex-col gap-1.5">
      {approvals.map((a, i) => (
        <View key={i} className="min-w-0 flex-row items-center gap-2">
          <Chip size="sm" variant="soft" color={a.choice === "deny" ? "danger" : "success"} className="shrink-0">
            <Chip.Label>{a.choice === "deny" ? t.denied : t.allowed}</Chip.Label>
          </Chip>
          <Typography.Code numberOfLines={1} className="shrink">
            {a.command}
          </Typography.Code>
        </View>
      ))}
    </View>
  );
}
