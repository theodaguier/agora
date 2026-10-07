import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { StatusTone } from "@agora/core";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BlockCard, BlockFooter, MetaList, MetaRow, StatusLine } from "@/components/views/block";
import { SkillCreateDialog } from "@/components/SkillCreateDialog";
import { api, type SkillRequest } from "@/lib/api";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";
import { agentsQuery } from "@/lib/queries";

const STATUS_TONE: Record<SkillRequest["status"], StatusTone> = { pending: "warning", installing: "info", installed: "success", rejected: "danger" };

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
    for: "For",
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
    for: "Pour",
  },
});

/** Skill requested by a bot, from the hub or written by it: an admin approves, the app installs it. */
export function SkillRequestCard({ id }: { id: string }) {
  const qc = useQueryClient();
  const [reviewing, setReviewing] = useState(false);
  const t = useT(messages);
  const c = useT(common);
  const { data: req, error } = useQuery({
    queryKey: ["skill-request", id],
    queryFn: () => api<SkillRequest>(`/skill-requests/${id}`),
    refetchInterval: (q) => (q.state.data && (q.state.data.status === "pending" || q.state.data.status === "installing") ? 4_000 : false),
  });
  const { data: agents } = useQuery(agentsQuery);
  const decide = useMutation({
    mutationFn: (approve: boolean) => api<SkillRequest>(`/skill-requests/${id}/${approve ? "approve" : "reject"}`, { method: "POST" }),
    onSuccess: (next) => qc.setQueryData(["skill-request", id], next),
    meta: { error: false },
  });

  if (error || !req) return null;
  const sourceUrl = req.identifier.startsWith("skills-sh/") ? `https://skills.sh/${req.identifier.slice("skills-sh/".length)}` : null;

  const bot = req.agentId ? agents?.find((a) => a.id === req.agentId) : undefined;
  const decides = req.status === "pending" && req.canDecide;

  return (
    <BlockCard>
      <CardHeader>
        <CardTitle className="font-semibold">{t.skill(req.name)}</CardTitle>
        {req.kind === "create" && req.description && <CardDescription>{req.description}</CardDescription>}
        {req.reason && <CardDescription>{req.reason}</CardDescription>}
        <StatusLine tone={STATUS_TONE[req.status]} className="mt-1">
          {t.status[req.status]}
        </StatusLine>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <MetaList>
          {req.kind === "create" ? (
            <MetaRow label={t.source}>{t.written}</MetaRow>
          ) : (
            <MetaRow label={t.source} mono>
              {sourceUrl ? (
                <a href={sourceUrl} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
                  {req.identifier}
                </a>
              ) : (
                req.identifier
              )}
            </MetaRow>
          )}
          {bot && <MetaRow label={t.for}>{bot.name}</MetaRow>}
        </MetaList>
        {req.status === "pending" && !req.canDecide && <p className="text-sm text-muted-foreground">{t.adminMust}</p>}
        {(decide.error || req.error) && <p className="text-sm text-destructive">{decide.error?.message ?? req.error}</p>}
      </CardContent>
      {decides && (
        <BlockFooter>
          <Button size="sm" variant="ghost" disabled={decide.isPending} onClick={() => decide.mutate(false)}>
            {t.reject}
          </Button>
          {req.kind === "create" ? (
            <Button size="sm" disabled={decide.isPending} onClick={() => setReviewing(true)}>
              {req.error ? c.retry : t.review}
            </Button>
          ) : (
            <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate(true)}>
              {decide.isPending && decide.variables ? c.inProgress : req.error ? c.retry : t.approve}
            </Button>
          )}
        </BlockFooter>
      )}
      <SkillCreateDialog request={reviewing ? req : null} onClose={() => setReviewing(false)} />
    </BlockCard>
  );
}
