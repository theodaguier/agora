import { defaultMergeMethod, mergeBlock, mergeMethods, pullRequestState, type CodeCheck, type CodeChecks, type CodeMergeMethod, type CodePullRequest, type PullRequestState, type StatusTone } from "@agora/core";
import { common, pullRequests } from "@agora/core/i18n";
import * as Linking from "expo-linking";
import { Button, Card, LinkButton, PressableFeedback, Spinner, Typography } from "heroui-native";
import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { BrandLogo } from "@/components/brand-logo";
import { CodeStateIcon } from "@/components/code-session-marks";
import { confirmAction } from "@/components/confirm-action";
import { BranchIcon, CheckCircleIcon, ChevronDownIcon, ClockIcon, CloseCircleIcon, ExternalLinkIcon, MinusIcon } from "@/components/icons";
import { TapMenu } from "@/components/menus";
import { StatusLine } from "@/components/views/block";
import { withTap } from "@/lib/haptics";
import { tr } from "@/lib/i18n";

/*
 * apps/web/src/components/github/PullRequestCard.tsx: a session's pull request on GitHub. Its line in
 * the session's card (PR #, title, state, CI), and its card at the top of the session (state, CI with
 * the checks behind a toggle, review, size, and its merge with the repository's allowed methods).
 */

const CHECKS_TONE: Record<Exclude<CodeChecks["state"], "none">, StatusTone> = { success: "success", failure: "danger", pending: "warning" };
type Review = NonNullable<CodePullRequest["review"]>;
const REVIEW_TONE: Record<Exclude<Review, "none">, StatusTone> = { approved: "success", changes_requested: "danger", review_required: "warning" };
const STATE_TONE: Record<Exclude<PullRequestState, "merged">, StatusTone> = { open: "success", draft: "neutral", closed: "danger" };
/** What each merge method does, as an SF Symbol in its menu. */
const METHOD_ICONS: Record<CodeMergeMethod, string> = { squash: "arrow.triangle.merge", merge: "arrow.triangle.branch", rebase: "arrow.up.arrow.down" };

/** `owner/name` → `name`: what reads in a line. */
const repoName = (repo: string) => repo.split("/")[1] ?? repo;

function GithubLogo({ size = 16 }: { size?: number }) {
  return <BrandLogo domain="github.com" fallback={<BranchIcon size={size} className="text-muted" />} className={size >= 20 ? "size-5" : "size-4"} />;
}

/** Its state: open, draft, closed as a status in its tone; merged with GitHub's merge mark, in its violet. */
export function PullRequestStateBadge({ pr }: { pr: CodePullRequest }) {
  const t = tr(pullRequests);
  const state = pullRequestState(pr);
  if (state === "merged")
    return (
      <View className="flex-row items-center gap-1">
        <CodeStateIcon state="merged" size={12} />
        <Typography type="body-xs" className="text-state-merged">
          {t.state.merged}
        </Typography>
      </View>
    );
  return <StatusLine tone={STATE_TONE[state]} label={t.state[state]} />;
}

const checksLabel = (t: (typeof pullRequests)["en"], checks: CodeChecks) =>
  checks.state === "failure" ? t.checks.failure(checks.failed) : checks.state === "pending" ? t.checks.pending(checks.pending) : t.checks.success(checks.passed);

/** The CI summed up (« 5 checks réussis », « 1 check en échec »); nothing without any check. */
export function ChecksBadge({ checks }: { checks?: CodeChecks }) {
  const t = tr(pullRequests);
  if (!checks || checks.state === "none") return null;
  return <StatusLine tone={CHECKS_TONE[checks.state]} label={checksLabel(t, checks)} />;
}

function CheckStateIcon({ state }: { state: CodeCheck["state"] }) {
  if (state === "success") return <CheckCircleIcon size={14} className="text-success" />;
  if (state === "failure") return <CloseCircleIcon size={14} className="text-danger" />;
  if (state === "pending") return <ClockIcon size={14} className="text-warning" />;
  return <MinusIcon size={14} className="text-muted" />;
}

/** « PR #41 », its title, its state and its CI, on one line (web PullRequestStatus): a tap opens it on GitHub. */
export function PullRequestStatus({ pr }: { pr: CodePullRequest }) {
  const t = tr(pullRequests);
  return (
    <PressableFeedback accessibilityRole="link" accessibilityLabel={t.openOnGithub} onPress={withTap(() => void Linking.openURL(pr.url))} className="min-w-0 flex-row items-center gap-2">
      <GithubLogo />
      <Typography type="body-sm" weight="medium" className="shrink-0">
        PR #{pr.number}
      </Typography>
      <Typography type="body-sm" color="muted" numberOfLines={1} className="min-w-0 shrink">
        {pr.title}
      </Typography>
      <PullRequestStateBadge pr={pr} />
      <ChecksBadge checks={pr.state === "open" ? pr.checks : undefined} />
    </PressableFeedback>
  );
}

/**
 * A pull request on GitHub (web PullRequestCard): its state, its CI (summed up, the checks behind a
 * toggle), its review and its size; with `onMerge`, its merge, the method picked from the repository's
 * allowed ones. Failing or running checks ask before merging; a draft, conflicts or GitHub's rules
 * disable it, with the reason. `blocked`: unavailable for a reason of the caller's. `actions`: the
 * caller's other actions, before the merge.
 */
export function PullRequestCard({
  pr,
  repo,
  onMerge,
  merging,
  blocked,
  actions,
}: {
  pr: CodePullRequest;
  repo?: string | null;
  onMerge?: (method: CodeMergeMethod) => void;
  merging?: boolean;
  blocked?: string | null;
  actions?: ReactNode;
}) {
  const t = tr(pullRequests);
  const c = tr(common);
  const methods = mergeMethods(pr);
  const [picked, setPicked] = useState<CodeMergeMethod | null>(null);
  const method = picked && methods.includes(picked) ? picked : defaultMergeMethod(pr);
  const open = pr.state === "open";
  const checks = open ? pr.checks : undefined;
  const review = open && pr.review && pr.review !== "none" ? pr.review : null;
  const block = mergeBlock(pr);
  const reason = blocked || (block && t.blocked[block]);
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
  const hasChecks = !!checks && checks.state !== "none";
  return (
    <Card>
      <View className="gap-3">
        <Card.Header className="flex-row items-start gap-2">
          <View className="pt-0.5">
            <GithubLogo size={20} />
          </View>
          <View className="min-w-0 flex-1 gap-0.5">
            <Card.Title numberOfLines={2}>{pr.title}</Card.Title>
            <View className="min-w-0 flex-row flex-wrap items-center gap-x-2">
              <Card.Description>{repo ? `${repoName(repo)} ${t.number(pr.number)}` : t.number(pr.number)}</Card.Description>
              <Typography type="body-xs" color="muted" numberOfLines={1} className="min-w-0 shrink font-mono">
                {pr.head ? `${pr.head} → ${pr.base}` : `→ ${pr.base}`}
              </Typography>
            </View>
          </View>
          <View className="flex-row items-center gap-1">
            <PullRequestStateBadge pr={pr} />
            <Button isIconOnly size="sm" variant="ghost" accessibilityLabel={t.openOnGithub} onPress={withTap(() => void Linking.openURL(pr.url))}>
              <ExternalLinkIcon size={16} className="text-muted" />
            </Button>
          </View>
        </Card.Header>
        {(hasChecks || !!review || hasSize) && (
          <Card.Body className="gap-2">
            <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
              <ChecksBadge checks={checks} />
              {review && <StatusLine tone={REVIEW_TONE[review]} label={t.review[review]} />}
              {hasSize && (
                <View className="flex-row items-center gap-2">
                  {pr.additions !== undefined && <Typography type="body-xs" className="font-mono text-success">{`+${pr.additions}`}</Typography>}
                  {pr.deletions !== undefined && <Typography type="body-xs" className="font-mono text-danger">{`−${pr.deletions}`}</Typography>}
                  {pr.changedFiles !== undefined && (
                    <Typography type="body-xs" color="muted">
                      {t.files(pr.changedFiles)}
                    </Typography>
                  )}
                </View>
              )}
            </View>
            {checks && checks.checks.length > 0 && <ChecksList checks={checks.checks} />}
          </Card.Body>
        )}
        {(canMerge || !!actions) && (
          <Card.Footer className="gap-2">
            {canMerge && !!reason && (
              <Typography type="body-sm" color="muted">
                {reason}
              </Typography>
            )}
            <View className="flex-row flex-wrap items-center justify-end gap-2">
              {actions}
              {canMerge && (
                <View className="flex-row items-center gap-1">
                  <Button size="sm" variant="primary" isDisabled={!!reason || merging} onPress={withTap(() => void merge())}>
                    {merging ? c.inProgress : t.merge}
                  </Button>
                  {methods.length > 1 && !reason && !merging && (
                    <TapMenu
                      accessibilityLabel={t.method}
                      actions={[{ title: t.method, actions: methods.map((m) => ({ label: t.methods[m], icon: METHOD_ICONS[m], checked: m === method, onPress: () => setPicked(m) })) }]}
                    >
                      <Button isIconOnly size="sm" variant="primary" accessibilityLabel={t.method}>
                        <ChevronDownIcon size={16} className="text-accent-foreground" />
                      </Button>
                    </TapMenu>
                  )}
                </View>
              )}
            </View>
          </Card.Footer>
        )}
      </View>
    </Card>
  );
}

/** The checks one by one behind a toggle: its state, its name, its page on GitHub. Failing ones first. */
function ChecksList({ checks }: { checks: CodeCheck[] }) {
  const t = tr(pullRequests);
  const [open, setOpen] = useState(false);
  const order: Record<CodeCheck["state"], number> = { failure: 0, pending: 1, success: 2, skipped: 3 };
  const sorted = [...checks].sort((a, b) => order[a.state] - order[b.state]);
  return (
    <View className="gap-1">
      <LinkButton size="sm" className="self-start" onPress={withTap(() => setOpen((o) => !o))}>
        <LinkButton.Label>{open ? t.hideChecks : t.showChecks}</LinkButton.Label>
      </LinkButton>
      {open && (
        <View>
          {sorted.map((check, i) => (
            <PressableFeedback
              key={`${check.name}-${i}`}
              isDisabled={!check.url}
              accessibilityRole={check.url ? "link" : undefined}
              onPress={withTap(() => check.url && void Linking.openURL(check.url))}
              className="min-w-0 flex-row items-center gap-2 py-1.5"
            >
              {check.state === "pending" ? <Spinner size="sm" color="warning" /> : <CheckStateIcon state={check.state} />}
              <Typography type="body-sm" numberOfLines={1} className="min-w-0 flex-1">
                {check.name}
              </Typography>
              <Typography type="body-xs" color="muted">
                {t.checkState[check.state]}
              </Typography>
            </PressableFeedback>
          ))}
        </View>
      )}
    </View>
  );
}
