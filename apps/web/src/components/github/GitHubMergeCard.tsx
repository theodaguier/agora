import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import type { CodeMergeMethod, GitHubMergeRequestDto, GitHubMergeRequestStatus, StatusTone } from "@agora/core";
import { common } from "@agora/core/i18n";
import { invalidateSessions } from "@/components/github/PullRequestLinks";
import { PullRequestItem, pullRequestMessages } from "@/components/github/PullRequestCard";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockCard, BlockFooter, BlockHeader, StatusLine } from "@/components/views/block";
import { MergeIcon } from "@/components/icons";
import { api } from "@/lib/api";
import { githubMergeRequestQuery, githubPullQuery, usersQuery } from "@/lib/queries";
import { defineMessages, useT } from "@/i18n";

const STATUS_TONE: Record<GitHubMergeRequestStatus, StatusTone> = { pending: "warning", approved: "success", denied: "danger", expired: "neutral", failed: "danger" };

const messages = defineMessages({
  en: {
    status: { pending: "Awaiting an answer", approved: "Merged", denied: "Declined", expired: "Expired", failed: "Merge failed" } as Record<GitHubMergeRequestStatus, string>,
    title: (bot: string, n: number) => `${bot} wants to merge PR #${n}`,
    method: (method: string) => `Method: ${method}`,
    someone: "someone",
    approve: "Allow",
    deny: "Decline",
    waiting: (person: string) => `It's up to ${person} to answer.`,
    approved: "Pull request merged.",
    denied: "Declined.",
    unreachable: "This request is unreachable for now.",
  },
  fr: {
    status: { pending: "En attente de réponse", approved: "Mergée", denied: "Refusé", expired: "Expiré", failed: "Échec du merge" },
    title: (bot: string, n: number) => `${bot} veut merger la PR #${n}`,
    method: (method: string) => `Méthode : ${method}`,
    someone: "quelqu'un",
    approve: "Autoriser",
    deny: "Refuser",
    waiting: (person: string) => `C'est à ${person} de répondre.`,
    approved: "Pull request mergée.",
    denied: "Refusé.",
    unreachable: "Cette demande est injoignable pour le moment.",
  },
});

/**
 * A bot asking to merge a pull request during a turn (event github.merge). Only the person who started
 * the turn answers; on « Autoriser » the server merges it and the bot gets the merged PR.
 */
export function GitHubMergeCard({ id, bot, repo, number }: { id: string; bot: string; repo: string; number: number }) {
  const qc = useQueryClient();
  const t = useT(messages);
  const tp = useT(pullRequestMessages);
  const c = useT(common);
  const { user } = useRouteContext({ from: "/app" });
  const { data: req, error } = useQuery(githubMergeRequestQuery(id));
  // The pull request as it stands now (state, CI); followed while the request waits.
  const { data: pr } = useQuery({ ...githubPullQuery(repo, number), refetchInterval: req?.status === "pending" ? 15_000 : false });
  const { data: people } = useQuery(usersQuery);
  const decide = useMutation({
    mutationFn: (approve: boolean) => api<GitHubMergeRequestDto>(`/github/merge-requests/${encodeURIComponent(id)}/${approve ? "approve" : "deny"}`, { method: "POST" }),
    onSuccess: (next) => {
      qc.setQueryData(githubMergeRequestQuery(id).queryKey, next);
      if (next.status === "approved") {
        void qc.invalidateQueries({ queryKey: githubPullQuery(repo, number).queryKey });
        invalidateSessions(qc);
      }
    },
    // Already answered or expired: show where it stands.
    onError: () => qc.invalidateQueries({ queryKey: githubMergeRequestQuery(id).queryKey }),
    meta: { success: (next: GitHubMergeRequestDto) => (next.status === "approved" ? t.approved : next.status === "denied" ? t.denied : t.status[next.status]), error: false },
  });

  if (error)
    return (
      <BlockCard>
        <CardHeader>
          <CardDescription title={error.message}>{t.unreachable}</CardDescription>
        </CardHeader>
      </BlockCard>
    );
  if (!req)
    return (
      <BlockCard>
        <CardHeader>
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-3 w-40" />
        </CardHeader>
      </BlockCard>
    );

  const mine = req.requestedBy === user.id;
  const person = people?.find((p) => p.id === req.requestedBy)?.name ?? t.someone;
  const pending = req.status === "pending";
  // Before GitHub answers (or without a token): what the bot said when it asked.
  const shown = pr ?? { number: req.number, url: req.url, title: req.title, state: "open" as const, draft: false, base: "" };

  return (
    <BlockCard>
      <BlockHeader
        icon={<MergeIcon className="size-4" />}
        title={t.title(req.agentName || bot, req.number)}
        description={t.method(tp.methods[req.method as CodeMergeMethod] ?? req.method)}
        action={(!pending || !mine) && <StatusLine tone={STATUS_TONE[req.status]}>{t.status[req.status]}</StatusLine>}
      />
      <CardContent className="flex flex-col gap-3">
        <PullRequestItem pr={shown} repo={req.repo} variant="muted" />
        {req.reason && <p className="text-sm">{req.reason}</p>}
        {pending && !mine && <p className="text-sm text-muted-foreground">{t.waiting(person)}</p>}
        {req.status === "failed" && req.error && <p className="text-sm text-destructive">{req.error}</p>}
        {decide.error && pending && <p className="text-sm text-destructive">{decide.error.message}</p>}
      </CardContent>
      {pending && mine && (
        <BlockFooter>
          <Button variant="secondary" disabled={decide.isPending} onClick={() => decide.mutate(false)}>
            {decide.isPending && decide.variables === false ? c.inProgress : t.deny}
          </Button>
          <Button disabled={decide.isPending} onClick={() => decide.mutate(true)}>
            {decide.isPending && decide.variables ? c.inProgress : t.approve}
          </Button>
        </BlockFooter>
      )}
    </BlockCard>
  );
}
