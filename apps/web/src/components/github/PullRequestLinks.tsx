import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { GitHubPullRequest } from "@agora/core";
import { common } from "@agora/core/i18n";
import { blockedReason, defaultMergeMethod, PullRequestItem, pullRequestMessages } from "@/components/github/PullRequestCard";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { confirmAction } from "@/lib/confirm";
import { githubPullQuery, mergeGithubPull } from "@/lib/queries";
import { defineMessages, useT } from "@/i18n";
import { cn } from "@/lib/utils";

const PULL_URL = /https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/gi;

/** The pull requests a text links to, once each, in order (three at most). */
export function pullRequestLinks(text: string): { repo: string; number: number }[] {
  const seen = new Set<string>();
  const out: { repo: string; number: number }[] = [];
  for (const m of text.matchAll(PULL_URL)) {
    const repo = `${m[1]}/${m[2]}`;
    const number = Number(m[3]);
    const key = `${repo.toLowerCase()}#${number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ repo, number });
    if (out.length === 3) break;
  }
  return out;
}

/** After a merge: the code sessions (one may work on that pull request) are read again. */
export const invalidateSessions = (qc: QueryClient) => void qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("code-session") });

const messages = defineMessages({
  en: { merged: "Pull request merged.", failed: "Merge failed" },
  fr: { merged: "Pull request mergée.", failed: "Échec du merge" },
});

/**
 * The pull requests a message links to (a bot's or a person's), each as a compact card under it:
 * state, CI, and a merge for those who may. Hidden when GitHub doesn't answer (no token, unknown PR).
 */
export function PullRequestLinks({ text, align = "start", className, shown }: { text: string; align?: "start" | "end"; className?: string; shown?: Set<string> }) {
  // A pull request already on a session card of the conversation isn't shown twice.
  const links = pullRequestLinks(text).filter((l) => !shown?.has(`${l.repo.toLowerCase()}#${l.number}`));
  if (!links.length) return null;
  return (
    <div className={cn("flex w-full flex-col gap-1.5", align === "end" ? "items-end" : "items-start", className)}>
      {links.map((l) => (
        <PullRequestLink key={`${l.repo}#${l.number}`} repo={l.repo} number={l.number} />
      ))}
    </div>
  );
}

function PullRequestLink({ repo, number }: { repo: string; number: number }) {
  const { data: pr } = useQuery(githubPullQuery(repo, number));
  if (!pr) return null;
  return <PullRequestItem pr={pr} repo={pr.repo} action={pr.canMerge && pr.state === "open" && <MergeButton pr={pr} />} className="max-w-lg" />;
}

/** Merges with the repository's default method, once confirmed; failing or running CI is said in the dialog. */
function MergeButton({ pr }: { pr: GitHubPullRequest }) {
  const t = useT(pullRequestMessages);
  const m = useT(messages);
  const c = useT(common);
  const qc = useQueryClient();
  const method = defaultMergeMethod(pr);
  const merge = useMutation({
    mutationFn: () => mergeGithubPull(pr.repo, pr.number, method),
    onSuccess: (next) => {
      qc.setQueryData(githubPullQuery(pr.repo, pr.number).queryKey, next);
      invalidateSessions(qc);
    },
    meta: { loading: c.inProgress, success: m.merged, error: m.failed },
  });
  const reason = blockedReason(t, pr);
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
  const button = (
    <Button variant="secondary" size="sm" disabled={!!reason || merge.isPending} onClick={() => void run()}>
      {merge.isPending ? c.inProgress : t.merge}
    </Button>
  );
  if (!reason) return button;
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>{button}</TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}
