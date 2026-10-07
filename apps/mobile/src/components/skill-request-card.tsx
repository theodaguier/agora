import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Alert, Button, Card, Typography, useToast } from "heroui-native";
import { useState } from "react";
import { Linking } from "react-native";
import { BlockGroup, BlockHeader, blockCard, MetaRow, StatusLine } from "@/components/views/block";
import { api } from "@/lib/api";
import { withTap } from "@/lib/haptics";
import { defineMessages, tr } from "@/lib/i18n";
import type { SkillRequest } from "@/lib/types";
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
    source: "Source",
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
    source: "Source",
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
  const [reviewing, setReviewing] = useState(false);
  const qc = useQueryClient();
  const t = messages;
  const c = tr(common);
  const { data: req, error } = useQuery({
    ...skillRequestQuery(id),
    refetchInterval: (q) => (q.state.data && (q.state.data.status === "pending" || q.state.data.status === "installing") ? 4_000 : false),
  });
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

  const tone = req.status === "installed" ? "success" : req.status === "rejected" ? "danger" : req.status === "installing" ? "info" : "warning";
  const description = req.kind === "create" ? [req.description, req.reason].filter(Boolean).join("\n\n") : req.reason;

  return (
    <Card className={blockCard}>
      <BlockHeader
        title={t.skill(req.name)}
        description={description}
        status={<StatusLine tone={tone} label={t.status[req.status]} help={t.statusHelp[req.status]} />}
      />
      <Card.Body>
        {req.kind === "create" ? (
          <Typography.Paragraph type="body-sm" color="muted">
            {t.written}
          </Typography.Paragraph>
        ) : (
          <BlockGroup>
            <MetaRow label={t.source} mono onPress={sourceUrl ? () => Linking.openURL(sourceUrl) : undefined}>
              {req.identifier}
            </MetaRow>
          </BlockGroup>
        )}
      </Card.Body>
      {(req.status === "pending" || !!req.error) && (
        <Card.Footer className="gap-2">
          {req.status === "pending" &&
            (req.canDecide ? (
              req.kind === "create" ? (
                <Button isDisabled={decide.isPending} onPress={withTap(() => setReviewing(true))}>
                  {req.error ? c.retry : t.review}
                </Button>
              ) : (
                <Button isDisabled={decide.isPending} onPress={withTap(() => decide.mutate(true))}>
                  {decide.isPending && decide.variables ? c.inProgress : req.error ? c.retry : t.approve}
                </Button>
              )
            ) : (
              <Typography.Paragraph type="body-sm" color="muted">
                {t.adminMust}
              </Typography.Paragraph>
            ))}
          {req.status === "pending" && req.canDecide && (
            <Button variant="ghost" isDisabled={decide.isPending} onPress={withTap(() => decide.mutate(false))}>
              <Button.Label className="text-danger">{t.reject}</Button.Label>
            </Button>
          )}
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
