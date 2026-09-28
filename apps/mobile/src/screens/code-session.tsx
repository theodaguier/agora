import type { CodeApproval, CodeGit, CodeSession, CodeStep } from "@agora/core";
import { codeSessions, common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { Stack, router, useFocusEffect, type Href } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { Accordion, Alert, Avatar, Button, Card, Chip, Input, Menu, Popover, PressableFeedback, Spinner, Surface, Typography, useThemeColor } from "heroui-native";
import { useCallback, useRef, useState, type ComponentRef } from "react";
import { AppState, ScrollView, View } from "react-native";
import { KeyboardChatScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAdminToast } from "@/components/admin/ui";
import { UserBubble } from "@/components/bubbles";
import { isActive, StatusIcon } from "@/components/code-session";
import { confirmAction } from "@/components/confirm-action";
import { ArrowUpIcon, BranchIcon, CloseCircleIcon, FolderIcon, ShieldAlertIcon, StopIcon, ToolIcon, UserIcon } from "@/components/icons";
import { MenuButton, MenuContent } from "@/components/menus";
import { MessageText } from "@/components/message-text";
import { ModelLogo } from "@/components/model-logo";
import { format } from "@/components/profile/usage-format";
import { useMe } from "@/components/server-scope";
import {
  answerCodeApproval,
  applyCodeSession,
  codeAccountsQuery,
  codeModelsQuery,
  codeSessionQuery,
  refreshCodeSessionGit,
  runCodeGit,
  sendToCodeSession,
  setCodeSessionModel,
  stopCodeSession,
  switchCodeSessionAccount,
  writeCommitMessage,
  type CodeGitRequest,
} from "@/lib/code-sessions";
import { withTap } from "@/lib/haptics";
import { locale, tr } from "@/lib/i18n";
import { dateFormat } from "@/lib/intl";
import { usePopoverInsets } from "@/lib/popover-insets";
import { cn } from "@/lib/utils";

/*
 * apps/web/src/components/CodeSession.tsx's panel as a screen pushed over the conversation: every
 * step of the session, live; its pending approval, its branch and the owner's field ride on the
 * keyboard at the bottom. The pull request's form is a sheet (app/(app)/code/…/pull-request.tsx).
 */

export function CodeSessionScreen({ conversationId, sessionId }: { conversationId: string; sessionId: string }) {
  const t = tr(codeSessions);
  const me = useMe();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const keyboardOffset = Math.max(0, insets.bottom - 8);
  const { data: session, error } = useQuery(codeSessionQuery(conversationId, sessionId));
  const scroller = useRef<ComponentRef<typeof KeyboardChatScrollView>>(null);
  const follow = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const [barHeight, setBarHeight] = useState(0);
  const owner = !!session && session.requestedBy === me.id;
  useGitRefresh(conversationId, sessionId, !!session?.git);

  const toEnd = (animated: boolean) => {
    follow.current = true;
    scroller.current?.scrollToEnd({ animated });
  };

  return (
    <>
      <Stack.Screen options={{ title: session?.title ?? t.claudeCode, headerTransparent: true, headerBlurEffect: "systemChromeMaterial" }} />
      {session && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.View>
            <MenuButton
              icon="ellipsis"
              label={t.claudeCode}
              actions={[
                { label: t.copyPath, icon: "doc.on.doc", onPress: () => void Clipboard.setStringAsync(session.cwd) },
                !!session.git?.pr && { label: t.git.pr(session.git.pr.number), icon: "link", onPress: () => void Linking.openURL(session.git!.pr!.url) },
              ]}
            />
          </Stack.Toolbar.View>
        </Stack.Toolbar>
      )}
      <Surface className="flex-1 p-0">
        {!session ? (
          <View className="flex-1 items-center justify-center px-4">
            {error ? (
              <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>{error.message}</Alert.Title>
                </Alert.Content>
              </Alert>
            ) : (
              <Spinner />
            )}
          </View>
        ) : (
          <>
            {/* Follows the work while the reader stays at the bottom. */}
            <KeyboardChatScrollView
              ref={scroller}
              keyboardLiftBehavior="whenAtEnd"
              offset={keyboardOffset}
              className="flex-1"
              contentContainerClassName="gap-4 px-4"
              contentContainerStyle={{ paddingTop: headerHeight + 12, paddingBottom: barHeight + 16 }}
              scrollIndicatorInsets={{ top: headerHeight, bottom: barHeight }}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              scrollEventThrottle={64}
              onContentSizeChange={() => follow.current && scroller.current?.scrollToEnd({ animated: false })}
              onScrollBeginDrag={() => (follow.current = false)}
              onScroll={(e) => {
                const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                const bottom = contentSize.height - contentOffset.y - layoutMeasurement.height < barHeight + 56;
                if (bottom) follow.current = true;
                setAtBottom(bottom);
              }}
            >
              <View className="flex-row items-start gap-2.5">
                <StatusIcon status={session.status} className="mt-0.5" />
                <View className="min-w-0 flex-1 gap-1.5">
                  <Typography type="body-sm" color="muted">
                    {t.status[session.status]}
                    {session.activity && isActive(session.status) ? ` · ${session.activity}` : ""}
                  </Typography>
                  <Meta session={session} showModel={!owner} showAccount={owner} />
                </View>
              </View>
              {session.limit && <LimitAlert conversationId={conversationId} session={session} limit={session.limit} owner={owner} />}
              {session.steps.length === 0 ? (
                <Typography color="muted">{t.empty}</Typography>
              ) : (
                <Timeline steps={session.steps} running={session.status === "running"} />
              )}
            </KeyboardChatScrollView>

            <KeyboardStickyView
              pointerEvents="box-none"
              offset={{ opened: keyboardOffset }}
              className="absolute inset-x-0 bottom-0"
              onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}
            >
              {!atBottom && (
                <View pointerEvents="box-none" className="absolute inset-x-0 bottom-full mb-2 items-center">
                  <Button size="sm" variant="secondary" onPress={() => toEnd(true)}>
                    {t.latest}
                  </Button>
                </View>
              )}
              <Surface className="gap-2 px-3 pt-2" style={{ paddingBottom: Math.max(8, insets.bottom) }}>
                {session.approval && <ApprovalBlock conversationId={conversationId} session={session} approval={session.approval} canAnswer={owner} />}
                {session.git && <ChangesBar conversationId={conversationId} session={session} git={session.git} owner={owner} />}
                {owner ? (
                  <SessionComposer conversationId={conversationId} session={session} onSent={() => toEnd(true)} />
                ) : (
                  <Typography type="body-sm" color="muted" className="px-1 pb-1">
                    {t.readOnly}
                  </Typography>
                )}
              </Surface>
            </KeyboardStickyView>
          </>
        )}
      </Surface>
    </>
  );
}

const GIT_REFRESH_MS = 30_000;

/**
 * While the screen is shown, the branch and its pull request follow GitHub: read again when it
 * opens, when the app comes back, and every 30 s (a PR merged or closed there, a push from
 * elsewhere). During a run the server rereads them itself after each push.
 */
function useGitRefresh(conversationId: string, sessionId: string, enabled: boolean) {
  const qc = useQueryClient();
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      const refresh = () => {
        if (AppState.currentState !== "active") return;
        refreshCodeSessionGit(conversationId, sessionId).then(
          (s) => applyCodeSession(qc, s),
          () => {},
        );
      };
      refresh();
      const timer = setInterval(refresh, GIT_REFRESH_MS);
      const sub = AppState.addEventListener("change", (state) => state === "active" && refresh());
      return () => {
        clearInterval(timer);
        sub.remove();
      };
    }, [conversationId, sessionId, enabled, qc]),
  );
}

/** Directory and what the session consumed; the detail in a popover. The model too, for those who cannot change it. */
function Meta({ session, showModel, showAccount }: { session: CodeSession; showModel: boolean; showAccount: boolean }) {
  const t = tr(codeSessions);
  const c = tr(common);
  const toast = useAdminToast();
  const insets = usePopoverInsets();
  const u = session.usage;
  const folder = session.cwd.split("/").filter(Boolean).at(-1) ?? session.cwd;
  const minutes = u ? u.durationMs / 60_000 : 0;
  const time = !u ? "" : minutes < 1 ? `${Math.max(1, Math.round(u.durationMs / 1000))} s` : `${Math.round(minutes)} min`;
  return (
    <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
      {showModel && !!session.model && (
        <View className="flex-row items-center gap-1">
          <ModelLogo provider="anthropic" model={session.model} size={14} />
          <Typography type="body-xs" color="muted">
            {session.model}
          </Typography>
        </View>
      )}
      {showAccount && !!session.account && (
        <View className="min-w-0 flex-row items-center gap-1" accessibilityLabel={t.account}>
          <UserIcon size={14} className="text-muted" />
          <Typography type="body-xs" color="muted" numberOfLines={1} className="shrink">
            {session.account.email ?? t.serverAccount}
            {session.account.plan ? ` · ${session.account.plan}` : ""}
          </Typography>
        </View>
      )}
      <PressableFeedback
        accessibilityRole="button"
        accessibilityLabel={t.copyPath}
        onPress={withTap(async () => {
          await Clipboard.setStringAsync(session.cwd);
          toast.success(c.copied, session.cwd);
        })}
        className="min-w-0 flex-row items-center gap-1"
      >
        <FolderIcon size={14} className="text-muted" />
        <Typography type="body-xs" color="muted" numberOfLines={1} className="shrink font-mono">
          {folder}
        </Typography>
      </PressableFeedback>
      {u && (
        <Popover>
          <Popover.Trigger asChild>
            <PressableFeedback accessibilityRole="button">
              <Typography type="body-xs" color="muted" className="tabular-nums">
                {t.tokens(format.compact(u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheWriteTokens))} · {format.cost(u.costUsd)} · {t.runs(u.runs)} · {time}
              </Typography>
            </PressableFeedback>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Overlay />
            <Popover.Content presentation="popover" width={300} placement="bottom" insets={insets} className="gap-2">
              <Popover.Description>
                {t.usageDetail(format.compact(u.inputTokens), format.compact(u.outputTokens), format.compact(u.cacheReadTokens + u.cacheWriteTokens), u.turns)}
              </Popover.Description>
              <Popover.Description>{t.costNote}</Popover.Description>
            </Popover.Content>
          </Popover.Portal>
        </Popover>
      )}
    </View>
  );
}

/** Usage warning; once the limit is hit, its owner can move the session to another of their Claude accounts. */
function LimitAlert({ conversationId, session, limit, owner }: { conversationId: string; session: CodeSession; limit: NonNullable<CodeSession["limit"]>; owner: boolean }) {
  const t = tr(codeSessions);
  const c = tr(common);
  const qc = useQueryClient();
  const toast = useAdminToast();
  const rejected = limit.status === "rejected";
  const { data: accounts = [] } = useQuery({ ...codeAccountsQuery(conversationId), enabled: owner && rejected });
  const others = accounts.filter((a) => a.id !== (session.account?.id ?? null));
  const change = useMutation({
    mutationFn: (id: string | null) => switchCodeSessionAccount(conversationId, session.id, id),
    onSuccess: (s) => {
      applyCodeSession(qc, s);
      void qc.invalidateQueries({ queryKey: codeAccountsQuery(conversationId).queryKey });
      toast.success(t.switched);
    },
    onError: (e) => toast.failed(e),
  });
  const window = t.windows[limit.window] ?? limit.window;
  const at = limit.resetsAt ? dateFormat(locale, { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(limit.resetsAt)) : "";
  return (
    <Alert status="warning">
      <Alert.Indicator />
      <Alert.Content className="gap-2">
        <Alert.Title>{rejected ? t.limited(window, at) : t.limit(`${Math.round((limit.utilization ?? 0) * 100)} %`, window)}</Alert.Title>
        {rejected && owner && others.length > 0 && (
          <View className="flex-row flex-wrap gap-2">
            {others.map((a) => (
              <Button key={a.id ?? "server"} size="sm" variant="secondary" isDisabled={change.isPending} onPress={withTap(() => change.mutate(a.id))}>
                {change.isPending && change.variables === a.id ? c.inProgress : t.switchTo(a.email ?? t.serverAccount)}
              </Button>
            ))}
          </View>
        )}
      </Alert.Content>
    </Alert>
  );
}

/* ---------- git ---------- */

const FILE_STATE = { added: "A", modified: "M", deleted: "D", renamed: "R" } as const;
const FILE_TONE = { added: "text-success", modified: "text-warning", deleted: "text-danger", renamed: "text-muted" } as const;

export const pullRequestHref = (conversationId: string, sessionId: string) => `/code/${conversationId}/${sessionId}/pull-request` as Href;

/**
 * Where the clone stands, above the field as in an IDE's agent panel: the branch, the files changed
 * with their lines, the pull request, and for the owner the next git action (commit, push, PR,
 * merge). A commit without a message gets one written by Claude Code from the diff.
 */
function ChangesBar({ conversationId, session, git, owner }: { conversationId: string; session: CodeSession; git: CodeGit; owner: boolean }) {
  const t = tr(codeSessions).git;
  const c = tr(common);
  const qc = useQueryClient();
  const toast = useAdminToast();
  const [open, setOpen] = useState<string | undefined>(undefined);
  const [message, setMessage] = useState("");
  const run = useMutation({
    // One after the other: "commit and push" is two actions, each its own step.
    mutationFn: async (reqs: CodeGitRequest[]) => {
      let s: CodeSession | undefined;
      for (const req of reqs) s = await runCodeGit(conversationId, session.id, req);
      return s!;
    },
    onSuccess: (s, reqs) => {
      applyCodeSession(qc, s);
      if (reqs[0]?.action === "commit") setMessage("");
      toast.success(({ commit: t.committed, push: t.pushed, pull: t.pulled, pr: t.opened, merge: t.merged } as const)[reqs.at(-1)!.action]);
    },
    onError: (e) => toast.failed(e, t.failed),
  });
  const generate = useMutation({
    mutationFn: () => writeCommitMessage(conversationId, session.id),
    onSuccess: (m) => {
      setMessage(m);
      setOpen("files");
    },
    onError: (e) => toast.failed(e, t.failed),
  });

  const files = git.files ?? [];
  const added = files.reduce((n, f) => n + (f.added ?? 0), 0);
  const removed = files.reduce((n, f) => n + (f.removed ?? 0), 0);
  const onBase = !!git.branch && git.branch === git.base;
  const pr = git.pr;
  const openPr = pr?.state === "open" ? pr : null;
  const working = isActive(session.status);
  const busy = working || run.isPending || generate.isPending;
  const commitReq = (): CodeGitRequest => ({ action: "commit", message: message.trim() });
  const merge = async () => {
    if (openPr && (await confirmAction({ title: t.mergeTitle(openPr.number, openPr.base), description: t.mergeHelp, action: t.merge, destructive: false }))) {
      run.mutate([{ action: "merge", method: "squash" }]);
    }
  };

  // The next thing to do with the branch, and what else can be done with it.
  type Action = { label: string; onPress: () => void };
  const canPush = git.github && !onBase && git.ahead > 0;
  const canOpenPr = git.github && !onBase && !openPr && (git.ahead > 0 || git.pushed);
  const actions: Action[] = !owner
    ? []
    : git.changes > 0
      ? [
          { label: t.commit, onPress: () => run.mutate([commitReq()]) },
          ...(git.github && !onBase ? [{ label: openPr ? t.commitPushPr(openPr.number) : t.commitPush, onPress: () => run.mutate([commitReq(), { action: "push" }]) }] : []),
        ]
      : [
          ...(canOpenPr ? [{ label: t.openPr, onPress: () => router.push(pullRequestHref(conversationId, session.id)) }] : []),
          ...(canPush ? [{ label: openPr ? t.pushPr(openPr.number) : t.push, onPress: () => run.mutate([{ action: "push" }]) }] : []),
          ...(git.pushed && git.behind > 0 ? [{ label: t.pull, onPress: () => run.mutate([{ action: "pull" }]) }] : []),
          ...(git.github && openPr && !canPush ? [{ label: t.merge, onPress: () => void merge() }] : []),
        ];
  const [primary, ...more] = actions;

  const summary = [git.changes ? t.changes(git.changes) : null, git.ahead ? t.ahead(git.ahead, git.pushed) : null, git.behind ? t.behind(git.behind) : null].filter(Boolean);
  const expandable = files.length > 0 || (owner && git.changes > 0);

  const head = (
    <View className="min-w-0 flex-1 gap-0.5">
      <View className="min-w-0 flex-row items-center gap-1.5">
        <BranchIcon size={14} className="text-muted" />
        <Typography type="body-sm" numberOfLines={1} className="shrink font-mono">
          {git.branch ?? "?"}
        </Typography>
      </View>
      <Typography type="body-xs" color="muted" numberOfLines={1}>
        {summary.length ? summary.join(" · ") : t.clean}
        {added > 0 || removed > 0 ? "  " : ""}
        {added > 0 && <Typography type="body-xs" className="font-mono text-success">{`+${added} `}</Typography>}
        {removed > 0 && <Typography type="body-xs" className="font-mono text-danger">{`−${removed}`}</Typography>}
      </Typography>
    </View>
  );

  return (
    <Card variant="secondary" className="gap-2">
      {expandable ? (
        <Accordion value={open} onValueChange={setOpen} hideSeparator>
          <Accordion.Item value="files">
            <Accordion.Trigger className="gap-2 px-0 py-0">
              {head}
              <Accordion.Indicator />
            </Accordion.Trigger>
            <Accordion.Content className="gap-2 px-0 pt-2">
              {files.length > 0 && (
                <ScrollView nestedScrollEnabled style={{ maxHeight: 192 }} contentContainerClassName="gap-1">
                  {files.map((f) => {
                    const slash = f.path.lastIndexOf("/");
                    return (
                      <View key={f.path} className="flex-row items-center gap-2">
                        <Typography type="body-xs" weight="medium" className={cn("w-3 text-center font-mono", FILE_TONE[f.state])}>
                          {FILE_STATE[f.state]}
                        </Typography>
                        <Typography type="body-xs" numberOfLines={1} className="flex-1 font-mono">
                          {f.path.slice(slash + 1)}
                          {slash > 0 && <Typography type="body-xs" color="muted">{`  ${f.path.slice(0, slash)}`}</Typography>}
                        </Typography>
                        {f.added !== null && (
                          <Typography type="body-xs" className="font-mono">
                            {f.added > 0 && <Typography type="body-xs" className="text-success">{`+${f.added}`}</Typography>}
                            {!!f.removed && <Typography type="body-xs" className="text-danger">{` −${f.removed}`}</Typography>}
                          </Typography>
                        )}
                      </View>
                    );
                  })}
                  {git.changes > files.length && (
                    <Typography type="body-xs" color="muted">
                      {t.moreFiles(git.changes - files.length)}
                    </Typography>
                  )}
                </ScrollView>
              )}
              {owner && git.changes > 0 && (
                <View className="gap-2">
                  <Input multiline value={message} onChangeText={setMessage} accessibilityLabel={t.message} placeholder={t.messagePlaceholder} className="max-h-32 font-mono" />
                  <Button size="sm" variant="ghost" className="self-start" isDisabled={busy} onPress={withTap(() => generate.mutate())}>
                    {generate.isPending ? t.writing : t.generate}
                  </Button>
                </View>
              )}
            </Accordion.Content>
          </Accordion.Item>
        </Accordion>
      ) : (
        head
      )}

      {(!!pr || !!primary) && (
        <View className="flex-row flex-wrap items-center gap-2">
          {pr && (
            <Chip size="sm" variant="soft" color={pr.state === "open" ? "success" : "default"} accessibilityRole="link" onPress={withTap(() => Linking.openURL(pr.url))}>
              <Chip.Label>
                {t.pr(pr.number)} · {t.prState[pr.state]}
              </Chip.Label>
            </Chip>
          )}
          <View className="flex-1" />
          {primary && (
            <Button size="sm" isDisabled={busy} onPress={withTap(primary.onPress)}>
              {run.isPending ? c.inProgress : primary.label}
            </Button>
          )}
          {more.length > 0 && <MenuButton icon="ellipsis" label={t.more} disabled={busy} placement="top" actions={more} />}
        </View>
      )}
      {owner && working && !!primary && (
        <Typography type="body-xs" color="muted">
          {t.busy}
        </Typography>
      )}
      {owner && !git.github && (
        <Typography type="body-xs" color="muted">
          {t.noGithub}
        </Typography>
      )}
    </Card>
  );
}

/* ---------- steps ---------- */

type ToolStepT = Extract<CodeStep, { kind: "tool" }>;
type Block = { kind: "step"; step: Exclude<CodeStep, ToolStepT> } | { kind: "tools"; steps: ToolStepT[] };

/** Consecutive tool calls read as one block; a subagent's steps go under its Task call. */
function blocks(steps: CodeStep[]): Block[] {
  const out: Block[] = [];
  for (const step of steps) {
    const last = out.at(-1);
    if (step.kind === "tool" && last?.kind === "tools") last.steps.push(step);
    else if (step.kind === "tool") out.push({ kind: "tools", steps: [step] });
    else out.push({ kind: "step", step });
  }
  return out;
}

const parentOf = (s: CodeStep) => ("parentId" in s ? s.parentId : undefined);

/** The steps of one level (the session's, or a subagent's), each Task call holding its own. */
function Timeline({ steps, running, parentId }: { steps: CodeStep[]; running: boolean; parentId?: string }) {
  const own = steps.filter((s) => parentOf(s) === parentId);
  const last = own.at(-1);
  return (
    <View className="gap-3">
      {blocks(own).map((b) =>
        b.kind === "tools" ? (
          <Accordion key={b.steps[0]!.id} selectionMode="multiple" hideSeparator>
            {b.steps.map((s) => (
              <ToolRow key={s.id} step={s} all={steps} />
            ))}
          </Accordion>
        ) : (
          <StepView key={b.step.id} step={b.step} streaming={running && b.step === last} />
        ),
      )}
    </View>
  );
}

function StepView({ step, streaming }: { step: Exclude<CodeStep, ToolStepT>; streaming: boolean }) {
  const t = tr(codeSessions);
  switch (step.kind) {
    case "user":
      return (
        <View className="items-end gap-1">
          {!!step.by && (
            <Typography type="body-xs" color="muted" className="px-1">
              {step.by}
            </Typography>
          )}
          <UserBubble text={step.text} className="max-w-[88%]" />
        </View>
      );
    case "text":
      return <MessageText text={step.text} streaming={streaming} />;
    case "git":
      return (
        <View className="flex-row items-start gap-2">
          {step.ok ? <BranchIcon size={14} className="mt-0.5 text-muted" /> : <CloseCircleIcon size={14} className="mt-0.5 text-danger" />}
          <Typography type="body-sm" color={step.ok ? "muted" : "default"} className={cn("min-w-0 flex-1", !step.ok && "text-danger")}>
            {step.text}
            {step.by ? ` · ${step.by}` : ""}
          </Typography>
        </View>
      );
    case "notice":
      return (
        <View className="gap-1.5">
          <Typography type="body-sm" color={step.code === "error" ? "default" : "muted"} align="center" className={cn(step.code === "error" && "text-danger")}>
            {t.notices[step.code]}
          </Typography>
          {!!step.text && <Detail text={step.text} />}
        </View>
      );
  }
}

/** A finished call shows nothing, as in an IDE: only work in progress and failures stand out. */
function ToolStatus({ status }: { status: ToolStepT["status"] }) {
  if (status === "running") return <Spinner size="sm" />;
  if (status === "done") return null;
  return <CloseCircleIcon size={14} className="text-danger" />;
}

/** One tool call; unfolds to its input and result, and to its subagent's steps for a Task call. */
function ToolRow({ step, all }: { step: ToolStepT; all: CodeStep[] }) {
  const t = tr(codeSessions);
  const nested = all.some((s) => parentOf(s) === step.id);
  const expandable = !!(step.input || step.output || nested);
  const row = (
    <View className="min-w-0 flex-1 flex-row items-center gap-2">
      <ToolIcon name={step.name} className="size-3.5 text-muted" />
      <Typography type="body-sm" color="muted">
        {step.name}
      </Typography>
      <Typography type="body-xs" numberOfLines={1} className="min-w-0 flex-1 font-mono">
        {step.title !== step.name ? step.title : ""}
      </Typography>
      <ToolStatus status={step.status} />
    </View>
  );
  return (
    <Accordion.Item value={step.id} isDisabled={!expandable}>
      <Accordion.Trigger className="gap-2 px-0 py-1.5">
        {row}
        {expandable && <Accordion.Indicator />}
      </Accordion.Trigger>
      <Accordion.Content className="gap-2 px-0 pb-2">
        {!!step.input && <Detail label={t.input} text={step.input} />}
        {nested && (
          <View className="pl-3">
            <Timeline steps={all} running={false} parentId={step.id} />
          </View>
        )}
        {!!step.output && <Detail label={t.output} text={step.output} />}
      </Accordion.Content>
    </Accordion.Item>
  );
}

function Detail({ label, text }: { label?: string; text: string }) {
  return (
    <View className="gap-1">
      {!!label && (
        <Typography type="body-xs" color="muted">
          {label}
        </Typography>
      )}
      <Surface variant="secondary" className="p-0">
        <ScrollView nestedScrollEnabled style={{ maxHeight: 288 }} contentContainerClassName="px-3 py-2">
          <Typography type="code" selectable>
            {text}
          </Typography>
        </ScrollView>
      </Surface>
    </View>
  );
}

/* ---------- approval and writing ---------- */

function ApprovalBlock({ conversationId, session, approval, canAnswer }: { conversationId: string; session: CodeSession; approval: CodeApproval; canAnswer: boolean }) {
  const t = tr(codeSessions);
  const c = tr(common);
  const qc = useQueryClient();
  const toast = useAdminToast();
  const warning = useThemeColor("warning-soft-foreground");
  const answer = useMutation({
    mutationFn: (choice: CodeApproval["choices"][number]) => answerCodeApproval(conversationId, session.id, approval.id, choice),
    onSuccess: (s) => applyCodeSession(qc, s),
    onError: (e) => toast.failed(e),
  });
  return (
    <Card role="alert" accessibilityLabel={t.asks} className="gap-3">
      <Card.Header className="flex-row items-start gap-3">
        <Avatar alt="" size="sm" variant="soft" color="warning">
          <Avatar.Fallback>
            <ShieldAlertIcon size={16} color={warning} />
          </Avatar.Fallback>
        </Avatar>
        <View className="min-w-0 flex-1 gap-0.5">
          <Card.Title>
            {t.asks} <Typography className="font-mono">{approval.tool}</Typography>
          </Card.Title>
          <Card.Description numberOfLines={2}>{approval.title}</Card.Description>
        </View>
      </Card.Header>
      {!!approval.detail && <Detail text={approval.detail} />}
      <Card.Footer className="flex-row flex-wrap gap-2">
        {canAnswer ? (
          approval.choices.map((choice, i) => (
            <Button
              key={choice}
              size="sm"
              variant={choice === "deny" ? "danger-soft" : i === 0 ? "primary" : "secondary"}
              isDisabled={answer.isPending}
              onPress={withTap(() => answer.mutate(choice))}
            >
              {answer.isPending && answer.variables === choice ? c.inProgress : t.choices[choice]}
            </Button>
          ))
        ) : (
          <Typography type="body-sm" color="muted">
            {t.waitingOwner}
          </Typography>
        )}
      </Card.Footer>
    </Card>
  );
}

/** Same field as the conversation's: the instruction, the session's model, send (stop while it works). */
function SessionComposer({ conversationId, session, onSent }: { conversationId: string; session: CodeSession; onSent: () => void }) {
  const t = tr(codeSessions);
  const qc = useQueryClient();
  const toast = useAdminToast();
  const [text, setText] = useState("");
  const send = useMutation({
    mutationFn: (value: string) => sendToCodeSession(conversationId, session.id, value),
    onSuccess: (s) => {
      applyCodeSession(qc, s);
      setText("");
      onSent();
    },
    onError: (e) => toast.failed(e),
  });
  const stop = useMutation({
    mutationFn: () => stopCodeSession(conversationId, session.id),
    onSuccess: (s) => {
      applyCodeSession(qc, s);
      toast.success(t.stopped);
    },
    onError: (e) => toast.failed(e),
  });
  // While Claude Code works, the send button stops it; typing turns it back into send (an instruction mid-run).
  const stoppable = isActive(session.status) && !text.trim();
  const submit = () => {
    const value = text.trim();
    if (value && !send.isPending) send.mutate(value);
  };
  return (
    <Surface variant="secondary" className="gap-1 p-2">
      <Input
        multiline
        value={text}
        onChangeText={setText}
        placeholder={isActive(session.status) ? t.placeholderRunning : t.placeholderIdle}
        className="max-h-[152px] bg-transparent px-2 pt-2.5 pb-1.5 text-body shadow-none ios:focus:outline-transparent android:focus:border-transparent"
      />
      <View className="flex-row items-center gap-2">
        <SessionModelPicker conversationId={conversationId} session={session} />
        <View className="flex-1" />
        {stoppable ? (
          <Button isIconOnly size="sm" variant="primary" accessibilityLabel={stop.isPending ? t.stopping : t.stop} isDisabled={stop.isPending} onPress={withTap(() => stop.mutate())}>
            {stop.isPending ? <Spinner size="sm" /> : <StopIcon className="size-[18px] text-accent-foreground" />}
          </Button>
        ) : (
          <Button isIconOnly size="sm" variant="primary" accessibilityLabel={t.send} isDisabled={!text.trim() || send.isPending} onPress={withTap(submit)}>
            <ArrowUpIcon className="size-[18px] text-accent-foreground" strokeWidth={2.25} />
          </Button>
        )}
      </View>
    </Surface>
  );
}

/** The session's model, among the ones its owner may use (the Claude Code engine's list). */
function SessionModelPicker({ conversationId, session }: { conversationId: string; session: CodeSession }) {
  const t = tr(codeSessions);
  const qc = useQueryClient();
  const toast = useAdminToast();
  const { data: models = [] } = useQuery(codeModelsQuery(conversationId));
  const change = useMutation({
    mutationFn: (model: string) => setCodeSessionModel(conversationId, session.id, model),
    onSuccess: (s) => {
      applyCodeSession(qc, s);
      toast.success(t.modelChanged);
    },
    onError: (e) => toast.failed(e),
  });
  if (!models.length && !session.model) return null;
  const current = models.find((m) => m.id === session.model);
  // Claude Code's default, as it resolved it: listed even when it is not among the models offered.
  const list: { id: string; label?: string }[] = session.model && !current ? [{ id: session.model }, ...models] : models;
  return (
    <Menu>
      <Menu.Trigger asChild>
        <Button variant="outline" size="sm" accessibilityLabel={`${t.model}: ${current?.label ?? session.model ?? ""}`} className="max-w-[200px]">
          <Button.Label numberOfLines={1}>{current?.label ?? session.model ?? t.model}</Button.Label>
        </Button>
      </Menu.Trigger>
      <MenuContent
        placement="top"
        entries={[
          {
            title: t.claudeCode,
            actions: list.map((m) => ({
              label: m.label ?? m.id,
              checked: m.id === session.model,
              onPress: () => m.id !== session.model && change.mutate(m.id),
            })),
          },
        ]}
      />
    </Menu>
  );
}
