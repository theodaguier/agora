import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Alert, Button, Card, ListGroup, Typography, useToast } from "heroui-native";
import { AgentAvatar } from "@/components/agent-avatar";
import { BlockGroup, BlockHeader, blockCard, StatusLine } from "@/components/views/block";
import { api } from "@/lib/api";
import { withTap } from "@/lib/haptics";
import { defineMessages, tr } from "@/lib/i18n";
import type { BotRequest } from "@/lib/types";
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
  const qc = useQueryClient();
  const t = messages;
  const c = tr(common);
  const { data: req, error } = useQuery({
    ...botRequestQuery(id),
    refetchInterval: (q) => (q.state.data && (q.state.data.status === "pending" || q.state.data.status === "creating") ? 4_000 : false),
  });
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

  const tone = req.status === "created" ? "success" : req.status === "rejected" ? "danger" : req.status === "creating" ? "info" : "warning";

  return (
    <Card className={blockCard}>
      <BlockHeader
        title={t.title(req.bots.length)}
        description={req.reason}
        status={<StatusLine tone={tone} label={t.status[req.status]} help={t.statusHelp[req.status]} />}
      />
      <Card.Body>
        <BlockGroup inset="ml-[58px]">
          {req.bots.map((bot, i) => (
            <ListGroup.Item key={i} className="gap-3 px-3.5 py-2.5">
              <ListGroup.ItemPrefix>
                <AgentAvatar agent={bot} size={32} />
              </ListGroup.ItemPrefix>
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle>{bot.name}</ListGroup.ItemTitle>
                {!!(bot.role || bot.mission) && <ListGroup.ItemDescription>{bot.role ?? bot.mission}</ListGroup.ItemDescription>}
              </ListGroup.ItemContent>
            </ListGroup.Item>
          ))}
        </BlockGroup>
      </Card.Body>
      {(req.status === "pending" || !!req.error) && (
        <Card.Footer className="gap-2">
          {req.status === "pending" &&
            (req.canDecide ? (
              <>
                <Button isDisabled={decide.isPending} onPress={withTap(() => decide.mutate(true))}>
                  {decide.isPending && decide.variables ? c.inProgress : req.error ? c.retry : t.approve}
                </Button>
                <Button variant="ghost" isDisabled={decide.isPending} onPress={withTap(() => decide.mutate(false))}>
                  <Button.Label className="text-danger">{t.reject}</Button.Label>
                </Button>
              </>
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
