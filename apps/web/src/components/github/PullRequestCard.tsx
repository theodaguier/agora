import { useState, type ReactNode } from "react";
import { defaultMergeMethod, mergeBlock, mergeMethods, pullRequestState, type CodeCheck, type CodeChecks, type CodeMergeMethod, type CodePullRequest, type PullRequestState, type StatusTone } from "@agora/core";
import { common, pullRequests } from "@agora/core/i18n";
import { BranchIcon, CheckCircleIcon, ChevronDownIcon, ClockIcon, CloseCircleIcon, ExternalLinkIcon, MergeIcon, MinusIcon, RebaseIcon, SquashIcon } from "@/components/icons";
import { BrandLogo } from "@/components/BrandLogo";
import { CodeStateIcon } from "@/components/CodeSessionMarks";
import { StatusLine } from "@/components/views/block";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { confirmAction } from "@/lib/confirm";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

type Review = NonNullable<CodePullRequest["review"]>;
type Strings = (typeof pullRequestMessages)["en"];

export const pullRequestMessages = pullRequests;

const METHOD_ICONS: Record<CodeMergeMethod, ReactNode> = { squash: <SquashIcon />, merge: <MergeIcon />, rebase: <RebaseIcon /> };

export { defaultMergeMethod };


const CHECKS_TONE: Record<Exclude<CodeChecks["state"], "none">, StatusTone> = { success: "success", failure: "danger", pending: "warning" };
const REVIEW_TONE: Record<Exclude<Review, "none">, StatusTone> = { approved: "success", changes_requested: "danger", review_required: "warning" };

type PrState = PullRequestState;
const prState = pullRequestState;
const STATE_TONE: Record<Exclude<PrState, "merged">, StatusTone> = { open: "success", draft: "neutral", closed: "danger" };

/** `owner/name` → `name`: what reads in a line. */
const repoName = (repo: string) => repo.split("/")[1] ?? repo;

function GithubLogo({ className }: { className?: string }) {
  return <BrandLogo domain="github.com" fallback={<BranchIcon className={cn("text-muted-foreground", className)} />} className={cn("dark:invert", className)} />;
}

/** Its state as a badge: open, draft, merged (GitHub's merge mark, in its violet), closed. */
export function PullRequestStateBadge({ pr }: { pr: CodePullRequest }) {
  const t = useT(pullRequestMessages);
  const state = prState(pr);
  if (state === "merged")
    return (
      <Badge variant="outline">
        <CodeStateIcon state="merged" />
        {t.state.merged}
      </Badge>
    );
  return <StatusLine tone={STATE_TONE[state]}>{t.state[state]}</StatusLine>;
}

const checksLabel = (t: Strings, checks: CodeChecks) =>
  checks.state === "failure" ? t.checks.failure(checks.failed) : checks.state === "pending" ? t.checks.pending(checks.pending) : t.checks.success(checks.passed);

/** The CI summed up as a badge (« 5 checks réussis », « 1 check en échec »); nothing without any check. */
export function ChecksBadge({ checks }: { checks?: CodeChecks }) {
  const t = useT(pullRequestMessages);
  if (!checks || checks.state === "none") return null;
  return <StatusLine tone={CHECKS_TONE[checks.state]}>{checksLabel(t, checks)}</StatusLine>;
}

/** The CI as a mark only, its summary on hover: for the dense rows (Sessions, the sessions popover). */
export function ChecksMark({ checks, className }: { checks?: CodeChecks; className?: string }) {
  const t = useT(pullRequestMessages);
  if (!checks || checks.state === "none") return null;
  const label = checksLabel(t, checks);
  return (
    <span role="img" aria-label={label} title={label} className={cn("inline-flex shrink-0", className)}>
      <CheckStateIcon state={checks.state} className="size-3.5" />
    </span>
  );
}

function CheckStateIcon({ state, className }: { state: CodeCheck["state"]; className?: string }) {
  if (state === "success") return <CheckCircleIcon className={cn("shrink-0 text-success", className)} />;
  if (state === "failure") return <CloseCircleIcon className={cn("shrink-0 text-destructive", className)} />;
  if (state === "pending") return <ClockIcon className={cn("shrink-0 text-warning", className)} />;
  return <MinusIcon className={cn("shrink-0 text-muted-foreground", className)} />;
}

/** « PR #41 », its state and its CI, on one line: inside a session's card in the thread. */
export function PullRequestStatus({ pr, className }: { pr: CodePullRequest; className?: string }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <GithubLogo className="size-4 shrink-0" />
      <span className="shrink-0 font-medium">PR #{pr.number}</span>
      <span className="min-w-0 truncate text-muted-foreground">{pr.title}</span>
      <PullRequestStateBadge pr={pr} />
      <ChecksBadge checks={pr.state === "open" ? pr.checks : undefined} />
    </span>
  );
}

function OpenOnGithub({ url }: { url: string }) {
  const t = useT(pullRequestMessages);
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t.openOnGithub} nativeButton={false} render={<a href={url} target="_blank" rel="noreferrer" />} />}>
        <ExternalLinkIcon />
      </TooltipTrigger>
      <TooltipContent>{t.openOnGithub}</TooltipContent>
    </Tooltip>
  );
}

/**
 * A pull request in one block, without its checks nor its merge: a link pasted in a message, the PR a
 * bot asks to merge. `variant="muted"` inside another card.
 */
export function PullRequestItem({
  pr,
  repo,
  variant = "outline",
  action,
  className,
}: {
  pr: CodePullRequest;
  repo?: string | null;
  variant?: "outline" | "muted";
  /** An action before the link to GitHub (the merge of a pasted link). */
  action?: ReactNode;
  className?: string;
}) {
  const t = useT(pullRequestMessages);
  return (
    <Item variant={variant} size="sm" className={cn("flex-nowrap", className)}>
      <ItemMedia variant="image">
        <GithubLogo className="size-6" />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full">
          <span className="truncate">{pr.title}</span>
        </ItemTitle>
        <ItemDescription className="flex min-w-0 items-center gap-2">
          {repo && <span className="min-w-0 truncate">{repoName(repo)}</span>}
          <span className="shrink-0">{t.number(pr.number)}</span>
          <PullRequestStateBadge pr={pr} />
          <ChecksBadge checks={pr.state === "open" ? pr.checks : undefined} />
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        {action}
        <OpenOnGithub url={pr.url} />
      </ItemActions>
    </Item>
  );
}

/** Why merging is not possible right now, or null. Failing CI does not block: it asks before. */
export function blockedReason(t: Strings, pr: CodePullRequest) {
  const block = mergeBlock(pr);
  return block && t.blocked[block];
}

/**
 * A pull request on GitHub: its state, its CI (summed up, the checks behind a toggle), its review and
 * its size; with `onMerge`, its merge, the method picked from the repository's allowed ones. Failing or
 * running checks ask before merging; a draft, conflicts or GitHub's rules disable it, with the reason.
 * `blocked`: merging unavailable for a reason of the caller's (the session still works). `actions`:
 * the caller's other actions, before the merge.
 */
export function PullRequestCard({
  pr,
  repo,
  onMerge,
  merging,
  blocked,
  actions,
  className,
}: {
  pr: CodePullRequest;
  repo?: string | null;
  onMerge?: (method: CodeMergeMethod) => void;
  merging?: boolean;
  blocked?: string | null;
  actions?: ReactNode;
  className?: string;
}) {
  const t = useT(pullRequestMessages);
  const c = useT(common);
  const methods = mergeMethods(pr);
  const [picked, setPicked] = useState<CodeMergeMethod | null>(null);
  const method = picked && methods.includes(picked) ? picked : methods.includes("squash") ? "squash" : methods[0]!;
  const open = pr.state === "open";
  const checks = open ? pr.checks : undefined;
  const review = open && pr.review && pr.review !== "none" ? pr.review : null;
  const reason = blocked || blockedReason(t, pr);
  const canMerge = open && !!onMerge;

  const merge = async () => {
    const warnings = [
      checks?.state === "failure" ? t.failingWarning : checks?.state === "pending" ? t.pendingWarning : null,
      review === "changes_requested" ? t.changesWarning : null,
    ].filter(Boolean);
    const ok = await confirmAction({
      title: t.mergeTitle(pr.number, pr.base),
      description: [t.methodHelp[method], ...warnings].join(" "),
      action: t.methods[method],
      destructive: warnings.length > 0,
    });
    if (ok) onMerge?.(method);
  };

  const hasSize = open && (pr.additions !== undefined || pr.changedFiles !== undefined);
  const hasContent = (!!checks && checks.state !== "none") || !!review || hasSize;

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <CardTitle className="flex min-w-0 items-center gap-2">
          <GithubLogo className="size-5 shrink-0" />
          <span className="truncate">{pr.title}</span>
        </CardTitle>
        <CardDescription className="flex min-w-0 flex-wrap items-center gap-x-2">
          <span className="shrink-0">{repo ? `${repoName(repo)} ${t.number(pr.number)}` : t.number(pr.number)}</span>
          <span className="min-w-0 truncate font-mono text-xs">{pr.head ? `${pr.head} → ${pr.base}` : `→ ${pr.base}`}</span>
        </CardDescription>
        <CardAction className="flex items-center gap-1">
          <PullRequestStateBadge pr={pr} />
          <OpenOnGithub url={pr.url} />
        </CardAction>
      </CardHeader>
      {hasContent && (
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <ChecksBadge checks={checks} />
            {review && <StatusLine tone={REVIEW_TONE[review]}>{t.review[review]}</StatusLine>}
            {hasSize && (
              <span className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
                {pr.additions !== undefined && <span className="font-mono text-success">+{pr.additions}</span>}
                {pr.deletions !== undefined && <span className="font-mono text-destructive">−{pr.deletions}</span>}
                {pr.changedFiles !== undefined && <span>{t.files(pr.changedFiles)}</span>}
              </span>
            )}
          </div>
          {checks && checks.checks.length > 0 && <ChecksList checks={checks.checks} />}
        </CardContent>
      )}
      {(canMerge || actions) && (
        <CardFooter className="flex-wrap justify-end gap-2">
          {canMerge && reason && <p className="mr-auto min-w-0 flex-1 text-sm text-muted-foreground">{reason}</p>}
          {actions}
          {canMerge && (
            <ButtonGroup>
              <Button disabled={!!reason || merging} onClick={() => void merge()}>
                {merging ? c.inProgress : t.merge}
              </Button>
              {methods.length > 1 && (
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button size="icon" aria-label={t.method} disabled={!!reason || merging} />}>
                    <ChevronDownIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-72">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>{t.method}</DropdownMenuLabel>
                      <DropdownMenuRadioGroup value={method} onValueChange={(v) => setPicked(v as CodeMergeMethod)}>
                        {methods.map((m) => (
                          <DropdownMenuRadioItem key={m} value={m} className="items-start">
                            {METHOD_ICONS[m]}
                            <span className="flex min-w-0 flex-col gap-0.5">
                              <span>{t.methods[m]}</span>
                              <span className="text-xs text-muted-foreground">{t.methodHelp[m]}</span>
                            </span>
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </ButtonGroup>
          )}
        </CardFooter>
      )}
    </Card>
  );
}

/** The checks one by one behind a toggle: its state, its name, its page on GitHub. Failing ones first. */
function ChecksList({ checks }: { checks: CodeCheck[] }) {
  const t = useT(pullRequestMessages);
  const [open, setOpen] = useState(false);
  const order: Record<CodeCheck["state"], number> = { failure: 0, pending: 1, success: 2, skipped: 3 };
  const sorted = [...checks].sort((a, b) => order[a.state] - order[b.state]);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger render={<Button variant="link" size="xs" className="px-0" />}>{open ? t.hideChecks : t.showChecks}</CollapsibleTrigger>
      <CollapsibleContent>
        <ItemGroup className="max-h-64 overflow-y-auto">
          {sorted.map((check, i) => (
            <Item
              key={`${check.name}-${i}`}
              size="xs"
              render={check.url ? <a href={check.url} target="_blank" rel="noreferrer" /> : undefined}
              className={cn("flex-nowrap", check.url && "hover:bg-muted/50")}
            >
              <ItemMedia>{check.state === "pending" ? <Spinner className="text-warning" /> : <CheckStateIcon state={check.state} />}</ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle className="w-full">
                  <span className="truncate">{check.name}</span>
                </ItemTitle>
              </ItemContent>
              <ItemActions className="text-xs text-muted-foreground">{t.checkState[check.state]}</ItemActions>
            </Item>
          ))}
        </ItemGroup>
      </CollapsibleContent>
    </Collapsible>
  );
}
