import { defaultMergeMethod, mergeBlock, pullRequestLinks, type CodeMergeMethod, type GitHubMergeRequestDto, type GitHubMergeRequestStatus, type GitHubPullRequest, type StatusTone } from "@agora/core";
import { common, pullRequests } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Button, Card, SkeletonGroup, Surface, Typography, useToast } from "heroui-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { useCodeSessions } from "@/components/code-session";
import { confirmAction } from "@/components/confirm-action";
import { BranchIcon } from "@/components/icons";
import { PullRequestStatus } from "@/components/pull-request";
import { useMe } from "@/components/server-scope";
import { BlockHeader, blockCard, StatusLine } from "@/components/views/block";
import { api } from "@/lib/api";
import { withTap } from "@/lib/haptics";
import { defineMessages, tr } from "@/lib/i18n";
import { usersQuery } from "@/lib/queries";
import { githubMergeRequestQuery, githubPullQuery, invalidateSessions, mergeGithubPull } from "@/lib/requests";
import { cn } from "@/lib/utils";

/*
 * apps/web/src/components/github/GitHubMergeCard.tsx and PullRequestLinks.tsx: a bot asking to merge a
 * pull request (only the person who started the turn answers), and the pull requests a message links to,
 * each as a compact line under it with its merge for those who may.
 */

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
    failed: "Merge failed",
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
    failed: "Échec du merge",
  },
});

/** A pull request on one line (web: PullRequestItem): GitHub's logo, its number, title, state and CI; `action` on its right. */
function PullRequestLine({ pr, action, className }: { pr: Parameters<typeof PullRequestStatus>[0]["pr"]; action?: ReactNode; className?: string }) {
  return (
    <Surface className={cn("flex-row items-center gap-2 rounded-[14px] px-3 py-2.5 shadow-none", className)}>
      <View className="min-w-0 flex-1">
        <PullRequestStatus pr={pr} />
      </View>
      {action}
    </Surface>
  );
}

export function GitHubMergeCard({ id, bot, repo, number }: { id: string; bot: string; repo: string; number: number }) {
  const qc = useQueryClient();
  const t = messages;
  const tp = tr(pullRequests);
  const c = tr(common);
  const me = useMe();
  const { toast } = useToast();
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
      Haptics.notificationAsync(next.status === "failed" ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success);
      toast.show({
        variant: next.status === "approved" ? "success" : next.status === "failed" ? "danger" : "default",
        label: next.status === "approved" ? t.approved : next.status === "denied" ? t.denied : t.status[next.status],
      });
    },
    // Already answered or expired: show where it stands.
    onError: () => qc.invalidateQueries({ queryKey: githubMergeRequestQuery(id).queryKey }),
  });

  if (error)
    return (
      <Card className={blockCard}>
        <Card.Description>{t.unreachable}</Card.Description>
      </Card>
    );
  if (!req)
    return (
      <Card className={blockCard}>
        <SkeletonGroup isLoading isSkeletonOnly className="gap-2">
          <SkeletonGroup.Item className="h-4 w-3/4 rounded-md" />
          <SkeletonGroup.Item className="h-3 w-1/2 rounded-md" />
        </SkeletonGroup>
      </Card>
    );

  const mine = req.requestedBy === me.id;
  const person = people?.find((p) => p.id === req.requestedBy)?.name ?? t.someone;
  const pending = req.status === "pending";
  // Before GitHub answers (or without a token): what the bot said when it asked.
  const shown = pr ?? { number: req.number, url: req.url, title: req.title, state: "open" as const, draft: false, base: "" };

  return (
    <Card className={blockCard}>
      <BlockHeader
        icon={<BranchIcon size={16} className="text-muted" />}
        title={t.title(req.agentName || bot, req.number)}
        description={t.method(tp.methods[req.method as CodeMergeMethod] ?? req.method)}
        status={(!pending || !mine) && <StatusLine tone={STATUS_TONE[req.status]} label={t.status[req.status]} />}
      />
      <Card.Body className="gap-3">
        <PullRequestLine pr={shown} />
        {!!req.reason && <Typography type="body-sm">{req.reason}</Typography>}
        {pending && !mine && (
          <Typography type="body-sm" color="muted">
            {t.waiting(person)}
          </Typography>
        )}
        {req.status === "failed" && !!req.error && (
          <Typography type="body-sm" className="text-danger">
            {req.error}
          </Typography>
        )}
        {!!decide.error && pending && (
          <Typography type="body-sm" className="text-danger">
            {decide.error.message}
          </Typography>
        )}
      </Card.Body>
      {pending && mine && (
        <Card.Footer className="flex-row justify-end gap-2">
          <Button size="sm" variant="secondary" isDisabled={decide.isPending} onPress={withTap(() => decide.mutate(false))}>
            {decide.isPending && decide.variables === false ? c.inProgress : t.deny}
          </Button>
          <Button size="sm" isDisabled={decide.isPending} onPress={withTap(() => decide.mutate(true))}>
            {decide.isPending && decide.variables ? c.inProgress : t.approve}
          </Button>
        </Card.Footer>
      )}
    </Card>
  );
}

/**
 * The pull requests a message links to (a bot's or a person's), each as a compact line under it: state,
 * CI, and a merge for those who may. Hidden when GitHub doesn't answer (no token, unknown PR).
 */
export function PullRequestLinks({ text, conversationId, align = "start", className }: { text: string; conversationId: string; align?: "start" | "end"; className?: string }) {
  const links = pullRequestLinks(text);
  // Most messages link to none: no query for them.
  if (!links.length) return null;
  return <LinkedPullRequests links={links} conversationId={conversationId} align={align} className={className} />;
}

function LinkedPullRequests({ links, conversationId, align, className }: { links: { repo: string; number: number }[]; conversationId: string; align: "start" | "end"; className?: string }) {
  // A pull request already on a code session's card of the conversation isn't shown twice.
  const sessions = useCodeSessions(conversationId);
  const onCards = new Set((sessions ?? []).flatMap((cs) => (cs.git?.repo && cs.git.pr ? [`${cs.git.repo.toLowerCase()}#${cs.git.pr.number}`] : [])));
  const shown = links.filter((l) => !onCards.has(`${l.repo.toLowerCase()}#${l.number}`));
  if (!shown.length) return null;
  return (
    <View className={cn("w-full gap-1.5", align === "end" ? "items-end" : "items-start", className)}>
      {shown.map((l) => (
        <PullRequestLink key={`${l.repo}#${l.number}`} repo={l.repo} number={l.number} />
      ))}
    </View>
  );
}

function PullRequestLink({ repo, number }: { repo: string; number: number }) {
  const { data: pr } = useQuery(githubPullQuery(repo, number));
  if (!pr) return null;
  return <PullRequestLine pr={pr} className="w-full" action={pr.canMerge && pr.state === "open" && <MergeButton pr={pr} />} />;
}

/** Merges with the repository's default method, once confirmed; failing or running CI is said in the dialog. */
function MergeButton({ pr }: { pr: GitHubPullRequest }) {
  const t = tr(pullRequests);
  const m = messages;
  const c = tr(common);
  const qc = useQueryClient();
  const { toast } = useToast();
  const method = defaultMergeMethod(pr);
  const merge = useMutation({
    mutationFn: () => mergeGithubPull(pr.repo, pr.number, method),
    onSuccess: (next) => {
      qc.setQueryData(githubPullQuery(pr.repo, pr.number).queryKey, next);
      invalidateSessions(qc);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show({ variant: "success", label: m.approved });
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ variant: "danger", label: m.failed });
    },
  });
  const block = mergeBlock(pr);
  const run = async () => {
    const warning = pr.checks?.state === "failure" ? t.failingWarning : pr.checks?.state === "pending" ? t.pendingWarning : null;
    const ok = await confirmAction({
      title: t.mergeTitle(pr.number, pr.base),
      description: [t.methodHelp[method], warning].filter(Boolean).join(" "),
      action: t.methods[method],
      destructive: !!warning,
    });
    if (ok) merge.mutate();
  };
  // Blocked (draft, conflicts, GitHub's rules): no merge offered here; the reason is on GitHub.
  if (block) return null;
  return (
    <Button size="sm" variant="secondary" isDisabled={merge.isPending} onPress={withTap(() => void run())}>
      {merge.isPending ? c.inProgress : t.merge}
    </Button>
  );
}
