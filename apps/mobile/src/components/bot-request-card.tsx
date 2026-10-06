import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Alert, Button, Card, Chip, ListGroup, Popover, Separator, Spinner, Typography, useThemeColor, useToast } from "heroui-native";
import { Fragment } from "react";
import { View } from "react-native";
import { AgentAvatar } from "@/components/agent-avatar";
import { CheckIcon } from "@/components/icons";
import { api } from "@/lib/api";
import { withTap } from "@/lib/haptics";
import { defineMessages, tr } from "@/lib/i18n";
import type { BotRequest } from "@/lib/types";
import { usePopoverInsets } from "@/lib/popover-insets";
import { botRequestQuery } from "@/lib/requests";

/* apps/web/src/components/BotRequestCard.tsx */

const messages = defineMessages({
  en: {
    status: { pending: "Awaiting approval", creating: "Creating…", created: "Done", rejected: "Rejected" } as Record<BotRequest["status"], string>,
    title: (n: number) => (n === 1 ? "New bot" : `${n} new bots`),
    approve: "Create",
    reject: "Reject",
    adminMust: "An admin must approve these bots before they're created.",
    statusHelp: {
      pending: "An admin reviews these bots before the app creates them.",
      creating: "The bots are approved; the app is creating them.",
      created: "The bots exist; mention them to hand them the work.",
      rejected: "An admin refused these bots; they won't be created.",
    } as Record<BotRequest["status"], string>,
  },
  fr: {
    status: { pending: "En attente de validation", creating: "Création…", created: "Création terminée", rejected: "Refusé" },
    title: (n: number) => (n === 1 ? "Nouveau bot" : `${n} nouveaux bots`),
    approve: "Créer",
    reject: "Refuser",
    adminMust: "Un administrateur doit valider ces bots avant leur création.",
    statusHelp: {
      pending: "Un administrateur examine ces bots avant que l'app les crée.",
      creating: "Les bots sont validés ; l'app les crée.",
      created: "Les bots existent ; mentionne-les pour leur passer la main.",
      rejected: "Un administrateur a refusé ces bots ; ils ne seront pas créés.",
    },
  },
});

/** Bots a bot asks to create (one per role to test, say): an admin approves, the app creates them. */
export function BotRequestCard({ id }: { id: string }) {
  const insets = usePopoverInsets();
  const qc = useQueryClient();
  const t = messages;
  const c = tr(common);
  const { data: req, error } = useQuery({
    ...botRequestQuery(id),
    refetchInterval: (q) => (q.state.data && (q.state.data.status === "pending" || q.state.data.status === "creating") ? 4_000 : false),
  });
  const [success] = useThemeColor(["success-soft-foreground"]);
  const { toast } = useToast();
  const decide = useMutation({
    mutationFn: (approve: boolean) => api<BotRequest>(`/bot-requests/${id}/${approve ? "approve" : "reject"}`, { method: "POST" }),
    onSuccess: (next, approve) => {
      qc.setQueryData(["bot-request", id], next);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(approve ? { variant: "success", label: t.status[next.status] } : { variant: "default", label: t.status.rejected });
    },
    onError: (error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ variant: "danger", label: error.message });
    },
  });

  if (error || !req) return null;

  return (
    <Card className="w-full max-w-[92%] gap-4">
      <Card.Header className="items-start gap-1">
        <Card.Title>{t.title(req.bots.length)}</Card.Title>
        <Popover>
          <Popover.Trigger asChild>
            <Chip size="sm" variant="soft" color={req.status === "created" ? "success" : req.status === "rejected" ? "danger" : "default"} accessibilityRole="button">
              {req.status === "created" && <CheckIcon size={14} color={success} />}
              {req.status === "creating" && <Spinner size="sm" />}
              <Chip.Label>{t.status[req.status]}</Chip.Label>
            </Chip>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Overlay />
            <Popover.Content presentation="popover" width={300} placement="bottom" align="start" insets={insets} className="gap-1">
              <Popover.Title>{t.status[req.status]}</Popover.Title>
              <Popover.Description>{t.statusHelp[req.status]}</Popover.Description>
            </Popover.Content>
          </Popover.Portal>
        </Popover>
        {!!req.reason && <Card.Description>{req.reason}</Card.Description>}
      </Card.Header>
      <Card.Body>
        <ListGroup variant="transparent">
          {req.bots.map((bot, i) => (
            <Fragment key={i}>
              {i > 0 && <Separator className="ml-12" />}
              <ListGroup.Item>
                <ListGroup.ItemPrefix>
                  <AgentAvatar agent={bot} size={32} />
                </ListGroup.ItemPrefix>
                <ListGroup.ItemContent>
                  <ListGroup.ItemTitle>{bot.name}</ListGroup.ItemTitle>
                  {!!(bot.role || bot.mission) && <ListGroup.ItemDescription>{bot.role ?? bot.mission}</ListGroup.ItemDescription>}
                </ListGroup.ItemContent>
              </ListGroup.Item>
            </Fragment>
          ))}
        </ListGroup>
      </Card.Body>
      {(req.status === "pending" || !!req.error) && (
        <Card.Footer className="gap-3">
          {req.status === "pending" &&
            (req.canDecide ? (
              <View className="flex-row gap-2">
                <Button className="flex-1" isDisabled={decide.isPending} onPress={withTap(() => decide.mutate(true))}>
                  {decide.isPending && decide.variables ? c.inProgress : req.error ? c.retry : t.approve}
                </Button>
                <Button className="flex-1" variant="danger-soft" isDisabled={decide.isPending} onPress={withTap(() => decide.mutate(false))}>
                  {t.reject}
                </Button>
              </View>
            ) : (
              <Typography.Paragraph type="body-sm" color="muted">
                {t.adminMust}
              </Typography.Paragraph>
            ))}
          {!!req.error && (
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>{req.error}</Alert.Description>
              </Alert.Content>
            </Alert>
          )}
        </Card.Footer>
      )}
    </Card>
  );
}
