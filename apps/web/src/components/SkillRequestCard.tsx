import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BookOpenIcon, CheckIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { SkillCreateDialog } from "@/components/SkillCreateDialog";
import { api, type SkillRequest } from "@/lib/api";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";

const messages = defineMessages({
  en: {
    status: { pending: "Awaiting approval", installing: "Installing…", installed: "Installed", rejected: "Rejected" } as Record<SkillRequest["status"], string>,
    skill: (name: string) => `Skill ${name}`,
    approve: "Approve",
    reject: "Reject",
    adminMust: "An admin must approve this skill before it's installed.",
    written: "Written by the bot, for every bot",
    review: "Review",
  },
  fr: {
    status: { pending: "En attente de validation", installing: "Installation…", installed: "Installé", rejected: "Refusé" },
    skill: (name: string) => `Skill ${name}`,
    approve: "Valider",
    reject: "Refuser",
    adminMust: "Un administrateur doit valider ce skill avant son installation.",
    written: "Écrit par le bot, pour tous les bots",
    review: "Relire",
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
  const decide = useMutation({
    mutationFn: (approve: boolean) => api<SkillRequest>(`/skill-requests/${id}/${approve ? "approve" : "reject"}`, { method: "POST" }),
    onSuccess: (next) => qc.setQueryData(["skill-request", id], next),
    meta: { error: false },
  });

  if (error || !req) return null;
  const sourceUrl = req.identifier.startsWith("skills-sh/") ? `https://skills.sh/${req.identifier.slice("skills-sh/".length)}` : null;

  return (
    <div className="w-full max-w-[min(680px,88%)] rounded-2xl bg-secondary p-3.5">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent">
          <BookOpenIcon className="size-4 text-foreground/80" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[15px] font-medium leading-snug">{t.skill(req.name)}</p>
            <Badge variant="secondary" className="bg-accent font-normal text-muted-foreground">
              {req.status === "installed" && <CheckIcon data-icon="inline-start" />}
              {req.status === "installing" && <Spinner data-icon="inline-start" />}
              {t.status[req.status]}
            </Badge>
          </div>
          {req.kind === "create" && req.description && <p className="mt-0.5 text-[15px] leading-snug">{req.description}</p>}
          {req.reason && <p className="mt-0.5 text-[15px] leading-snug text-muted-foreground">{req.reason}</p>}
          {req.kind === "create" ? (
            <p className="mt-1.5 text-xs text-muted-foreground">{t.written}</p>
          ) : sourceUrl ? (
            <a href={sourceUrl} target="_blank" rel="noreferrer" className="mt-1.5 block break-all font-mono text-xs text-muted-foreground hover:text-foreground">
              {req.identifier}
            </a>
          ) : (
            <p className="mt-1.5 break-all font-mono text-xs text-muted-foreground">{req.identifier}</p>
          )}
        </div>
      </div>
      {(req.status === "pending" || req.error || decide.error) && (
        <div className="mt-3 flex flex-col gap-2 pl-12">
          {req.status === "pending" &&
            (req.canDecide ? (
              <div className="flex gap-2">
                {req.kind === "create" ? (
                  <Button size="sm" disabled={decide.isPending} onClick={() => setReviewing(true)}>
                    {req.error ? c.retry : t.review}
                  </Button>
                ) : (
                  <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate(true)}>
                    {decide.isPending && decide.variables ? c.inProgress : req.error ? c.retry : t.approve}
                  </Button>
                )}
                <Button size="sm" variant="ghost" disabled={decide.isPending} onClick={() => decide.mutate(false)}>
                  {t.reject}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t.adminMust}</p>
            ))}
          {(decide.error || req.error) && <p className="text-sm text-destructive">{decide.error?.message ?? req.error}</p>}
        </div>
      )}
      <SkillCreateDialog request={reviewing ? req : null} onClose={() => setReviewing(false)} />
    </div>
  );
}
