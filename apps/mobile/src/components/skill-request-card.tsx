import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Alert, Avatar, Button, Card, Chip, LinkButton, Popover, Spinner, Typography, useThemeColor, useToast } from "heroui-native";
import { useState } from "react";
import { Linking, View } from "react-native";
import { BookOpenIcon, CheckIcon } from "@/components/icons";
import { api } from "@/lib/api";
import { withTap } from "@/lib/haptics";
import { defineMessages, tr } from "@/lib/i18n";
import type { SkillRequest } from "@/lib/types";
import { usePopoverInsets } from "@/lib/popover-insets";
import { skillRequestQuery } from "@/lib/requests";
import { SkillCreateSheet } from "@/components/skill-create-sheet";

/* apps/web/src/components/SkillRequestCard.tsx */

const messages = defineMessages({
  en: {
    status: { pending: "Awaiting approval", installing: "Installing…", installed: "Installed", rejected: "Rejected" } as Record<SkillRequest["status"], string>,
    skill: (name: string) => `Skill ${name}`,
    approve: "Approve",
    reject: "Reject",
    adminMust: "An admin must approve this skill before it's installed.",
    written: "Written by the bot, for every bot",
    review: "Review",
    statusHelp: {
      pending: "An admin reviews the skill before the agent can install it.",
      installing: "The skill is approved; the app is installing it for the agent.",
      installed: "The skill is installed; the agent can use it.",
      rejected: "An admin refused this skill; it won't be installed.",
    } as Record<SkillRequest["status"], string>,
  },
  fr: {
    status: { pending: "En attente de validation", installing: "Installation…", installed: "Installé", rejected: "Refusé" },
    skill: (name: string) => `Skill ${name}`,
    approve: "Valider",
    reject: "Refuser",
    adminMust: "Un administrateur doit valider ce skill avant son installation.",
    written: "Écrit par le bot, pour tous les bots",
    review: "Relire",
    statusHelp: {
      pending: "Un administrateur examine le skill avant que l'agent puisse l'installer.",
      installing: "Le skill est validé ; l'app l'installe pour l'agent.",
      installed: "Le skill est installé ; l'agent peut s'en servir.",
      rejected: "Un administrateur a refusé ce skill ; il ne sera pas installé.",
    },
  },
});

/** Skill requested by a bot, from the hub or written by it: an admin approves, the app installs it. */
export function SkillRequestCard({ id }: { id: string }) {
  const insets = usePopoverInsets();
  const [reviewing, setReviewing] = useState(false);
  const qc = useQueryClient();
  const t = messages;
  const c = tr(common);
  const { data: req, error } = useQuery({
    ...skillRequestQuery(id),
    refetchInterval: (q) => (q.state.data && (q.state.data.status === "pending" || q.state.data.status === "installing") ? 4_000 : false),
  });
  const [ink, success] = useThemeColor(["default-soft-foreground", "success-soft-foreground"]);
  const { toast } = useToast();
  const decide = useMutation({
    mutationFn: (approve: boolean) => api<SkillRequest>(`/skill-requests/${id}/${approve ? "approve" : "reject"}`, { method: "POST" }),
    onSuccess: (next, approve) => {
      qc.setQueryData(["skill-request", id], next);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(approve ? { variant: "success", label: t.status[next.status] } : { variant: "default", label: t.status.rejected });
    },
    onError: (error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ variant: "danger", label: error.message });
    },
  });

  if (error || !req) return null;
  const sourceUrl = req.identifier.startsWith("skills-sh/") ? `https://skills.sh/${req.identifier.slice("skills-sh/".length)}` : null;

  return (
    <Card className="w-full max-w-[92%] gap-4">
      <Card.Header className="flex-row items-start gap-3">
        <Avatar alt="" size="md" variant="soft" color="default">
          <Avatar.Fallback>
            <BookOpenIcon size={20} color={ink} />
          </Avatar.Fallback>
        </Avatar>
        <View className="min-w-0 flex-1 items-start gap-1">
          <Card.Title>{t.skill(req.name)}</Card.Title>
          <Popover>
            <Popover.Trigger asChild>
              <Chip size="sm" variant="soft" color={req.status === "installed" ? "success" : req.status === "rejected" ? "danger" : "default"} accessibilityRole="button">
                {req.status === "installed" && <CheckIcon size={14} color={success} />}
                {req.status === "installing" && <Spinner size="sm" />}
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
        </View>
      </Card.Header>
      <Card.Body className="items-start gap-2">
        {req.kind === "create" && !!req.description && <Typography.Paragraph type="body-sm">{req.description}</Typography.Paragraph>}
        {!!req.reason && <Card.Description>{req.reason}</Card.Description>}
        {req.kind === "create" ? (
          <Typography.Paragraph type="body-xs" color="muted">
            {t.written}
          </Typography.Paragraph>
        ) : sourceUrl ? (
          <LinkButton size="sm" accessibilityRole="link" onPress={withTap(() => Linking.openURL(sourceUrl))}>
            {req.identifier}
          </LinkButton>
        ) : (
          <Typography.Code selectable>{req.identifier}</Typography.Code>
        )}
      </Card.Body>
      {(req.status === "pending" || !!req.error) && (
        <Card.Footer className="gap-3">
          {req.status === "pending" &&
            (req.canDecide ? (
              <View className="flex-row gap-2">
                {req.kind === "create" ? (
                  <Button className="flex-1" isDisabled={decide.isPending} onPress={withTap(() => setReviewing(true))}>
                    {req.error ? c.retry : t.review}
                  </Button>
                ) : (
                  <Button className="flex-1" isDisabled={decide.isPending} onPress={withTap(() => decide.mutate(true))}>
                    {decide.isPending && decide.variables ? c.inProgress : req.error ? c.retry : t.approve}
                  </Button>
                )}
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
      <SkillCreateSheet request={reviewing ? req : null} onClose={() => setReviewing(false)} />
    </Card>
  );
}
