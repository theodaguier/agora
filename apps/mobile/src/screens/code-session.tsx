import {
  CODE_ENGINE_NAMES,
  codeEngineModes,
  codeSessionState,
  codeStatusText,
  modelName,
  rankByQuery,
  toolLabel,
  type CodeCommand,
  type CodeGit,
  type CodeIssue,
  type CodePermissionMode,
  type CodeSession,
  type CodeSessionDetail,
  type CodeStep,
} from "@agora/core";
import { codeSessions, common, pullRequests } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { Stack, router, useFocusEffect, type Href } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { Accordion, Alert, Button, Card, Description, Input, LinkButton, ListGroup, Separator, Spinner, Surface, TextArea, TextField, Typography } from "heroui-native";
import { Fragment, useCallback, useLayoutEffect, useRef, useState, type ComponentRef } from "react";
import { AppState, View } from "react-native";
import { KeyboardChatScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAdminToast } from "@/components/admin/ui";
import { SentAttachments } from "@/components/attachments";
import { BrandLogo } from "@/components/brand-logo";
import { AttachMenu } from "@/components/composer/attach-menu";
import { PendingFiles, usePendingFiles } from "@/components/composer/pending-files";
import { UserBubble } from "@/components/bubbles";
import { ENGINE_PROVIDER, isActive, PRIORITY_ICONS, priorityEntries, useSetCodePriority } from "@/components/code-session";
import { CodeBlock, SessionDecision } from "@/components/code-session-decision";
import { CodeStateIcon, codeStateTone, IssueIcon, ProgressMark, TaskStatusIcon } from "@/components/code-session-marks";
import { Shimmer } from "@/components/shimmer";
import { confirmAction } from "@/components/confirm-action";
import { ArrowUpIcon, BranchIcon, CheckCircleIcon, ChevronDownIcon, CloseCircleIcon, BanIcon, SparklesIcon, StopIcon, ToolIcon } from "@/components/icons";
import { MenuButton, TapMenu, type MenuEntry } from "@/components/menus";
import { MessageText } from "@/components/message-text";
import { SlashMenu, type SlashItem } from "@/components/slash-menu";
import { ModelLogo } from "@/components/model-logo";
import { PullRequestCard } from "@/components/pull-request";
import { QueueList } from "@/components/queue-list";
import { format } from "@/components/profile/usage-format";
import { useMe } from "@/components/server-scope";
import {
  applyCodeSession,
  codeAccountsQuery,
  codeCommandsQuery,
  codeModelsQuery,
  codeSessionQuery,
  detachCodeSessionIssue,
  editQueued,
  refreshCodeSessionGit,
  removeCodeSessionWorktree,
  removeQueued,
  runCodeGit,
  sendQueuedNow,
  sendToCodeSession,
  setCodeSessionMode,
  setCodeSessionModel,
  setCodeSessionParked,
  stopCodeSession,
  switchCodeSessionAccount,
  writeCommitMessage,
  type CodeGitRequest,
} from "@/lib/code-sessions";
import { useHeaderTitleWidth } from "@/components/header-button";
import { withTap } from "@/lib/haptics";
import { defineMessages, locale, tr } from "@/lib/i18n";
import { dateFormat } from "@/lib/intl";
import { cn } from "@/lib/utils";

/*
 * apps/web/src/components/CodeSessionView as a screen pushed over the conversation. Its header is
 * its title over its state and its issue; its « … » holds the details (the engine first), the
 * priority and the project's secrets. Its stream is the web's Avancement: the branch and its pull
 * request, its tasks, every step live, what waits for an answer, the worktree once done. Only the field
 * (with what waits in its queue) rides on the keyboard. The pull request's form is a form sheet
 * (app/(app)/code/…/pull-request.tsx), the secrets another.
 */

/** What a session says when it can't be reached (web CodeSession's stateMessages). */
const messages = defineMessages({
  en: { unreachableTitle: "Session unreachable", unreachable: "This session couldn't be loaded for now. Try again in a moment." },
  fr: { unreachableTitle: "Session injoignable", unreachable: "Cette session n'a pas pu être chargée pour le moment. Réessaie dans un instant." },
});

export function CodeSessionScreen({ conversationId, sessionId }: { conversationId: string; sessionId: string }) {
  const t = tr(codeSessions);
  const me = useMe();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const keyboardOffset = Math.max(0, insets.bottom - 8);
  const { data: session, error, refetch } = useQuery(codeSessionQuery(conversationId, sessionId));
  const scroller = useRef<ComponentRef<typeof KeyboardChatScrollView>>(null);
  const follow = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const [barHeight, setBarHeight] = useState(0);
  const owner = !!session && session.requestedBy === me.id;
  useGitRefresh(conversationId, sessionId, !!session?.git && !session.worktree?.removedAt);

  const toEnd = (animated: boolean) => {
    follow.current = true;
    scroller.current?.scrollToEnd({ animated });
  };
  // A new decision comes into view: the stream shows it, at its end.
  const waitingFor = session?.approval?.id ?? session?.question?.text;
  useLayoutEffect(() => {
    if (waitingFor) toEnd(true);
  }, [waitingFor]);
  const waiting = !!(session?.approval || session?.question);

  return (
    <>
      <Stack.Screen
        options={{
          title: session?.title ?? t.codeSession,
          headerTransparent: true,
          headerBlurEffect: "systemChromeMaterial",
          headerTitle: () => <SessionTitle conversationId={conversationId} session={session} owner={owner} />,
        }}
      />
      {session && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.View>
            <DetailsMenu conversationId={conversationId} session={session} owner={owner} />
          </Stack.Toolbar.View>
        </Stack.Toolbar>
      )}
      <Surface className="flex-1 p-0">
        {!session ? (
          <View className="flex-1 items-center justify-center gap-3 px-4">
            {error ? (
              <>
                <Alert status="danger">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>{messages.unreachableTitle}</Alert.Title>
                    <Alert.Description>{messages.unreachable}</Alert.Description>
                  </Alert.Content>
                </Alert>
                <Button variant="secondary" onPress={withTap(() => void refetch())}>
                  {tr(common).retry}
                </Button>
              </>
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
              contentContainerClassName="gap-6 px-4"
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
              {session.limit && <LimitAlert conversationId={conversationId} session={session} limit={session.limit} owner={owner} />}
              <Overview conversationId={conversationId} session={session} owner={owner} waiting={waiting} />
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

/* ---------- header ---------- */

/**
 * The header's title, as iOS draws a title with its subtitle: the title on its line, centred; under it,
 * its state (a menu for its owner) and its issue. Held to the room between the glass buttons. The
 * engine is in the « … », the branch heads the stream.
 */
function SessionTitle({ conversationId, session, owner }: { conversationId: string; session?: CodeSession; owner: boolean }) {
  const t = tr(codeSessions);
  const width = useHeaderTitleWidth(1);
  return (
    <View style={{ maxWidth: width }} className="items-center">
      <Typography type="body-sm" weight="semibold" numberOfLines={1} className="text-center">
        {session?.title ?? t.codeSession}
      </Typography>
      {session && (
        <View className="flex-row items-center gap-3">
          <StatusMenu session={session} owner={owner} />
          {session.issue && <IssueMenu conversationId={conversationId} session={session} issue={session.issue} owner={owner} />}
        </View>
      )}
    </View>
  );
}

/** Its state, as a mark and its words, coloured for what waits for you and a failure. */
function StatusText({ session }: { session: CodeSession }) {
  const t = tr(codeSessions);
  const state = codeSessionState(session);
  const tone = codeStateTone(state);
  return (
    <View className="shrink-0 flex-row items-center gap-1">
      <CodeStateIcon state={state} size={12} />
      <Typography type="body-xs" color={tone ? "default" : "muted"} className={tone}>
        {codeStatusText(t, session)}
      </Typography>
    </View>
  );
}

/**
 * The session's state, changed right there (web StatusMenu): set it aside or bring it back, stop it
 * while it works. Its owner only; others read it.
 */
function StatusMenu({ session, owner }: { session: CodeSession; owner: boolean }) {
  const t = tr(codeSessions);
  const qc = useQueryClient();
  const toast = useAdminToast();
  const park = useMutation({
    mutationFn: (parked: boolean) => setCodeSessionParked(session.conversationId, session.id, parked),
    onSuccess: (s) => {
      applyCodeSession(qc, s);
      toast.success(s.parked ? t.parkedNotice : t.unparkedNotice);
    },
    onError: (e) => toast.failed(e),
  });
  const stop = useMutation({
    mutationFn: () => stopCodeSession(session.conversationId, session.id),
    onSuccess: (s) => applyCodeSession(qc, s),
    onError: (e) => toast.failed(e),
  });
  if (!owner) return <StatusText session={session} />;
  const state = codeSessionState(session);
  const working = state === "running" || state === "waiting";
  return (
    <TapMenu
      accessibilityLabel={codeStatusText(t, session)}
      actions={[
        session.parked
          ? { label: t.unpark, icon: "circle", onPress: () => park.mutate(false) }
          : { label: t.park, icon: "circle.dashed", disabled: working, onPress: () => park.mutate(true) },
        working && { label: stop.isPending ? t.stopping : t.stop, icon: "stop.circle", disabled: stop.isPending, onPress: () => stop.mutate() },
      ]}
    >
      <StatusText session={session} />
    </TapMenu>
  );
}

/** Its issue in the header: open it on GitHub; its owner detaches it when the session linked the wrong one. */
function IssueMenu({ conversationId, session, issue, owner }: { conversationId: string; session: CodeSession; issue: CodeIssue; owner: boolean }) {
  const t = tr(codeSessions);
  const qc = useQueryClient();
  const toast = useAdminToast();
  const detach = useMutation({
    mutationFn: () => detachCodeSessionIssue(conversationId, session.id),
    onSuccess: (s) => {
      applyCodeSession(qc, s);
      toast.success(t.issue.detached);
    },
    onError: (e) => toast.failed(e),
  });
  return (
    <TapMenu
      accessibilityLabel={t.issue.label(issue.number)}
      actions={[
        {
          title: issue.title,
          actions: [
            { label: t.issue.open, icon: "link", onPress: () => void Linking.openURL(issue.url) },
            owner && {
              label: t.issue.detach,
              icon: "xmark",
              destructive: true,
              disabled: detach.isPending,
              onPress: () => void confirmAction({ title: t.issue.detachTitle(issue.number), description: t.issue.detachHelp, action: t.issue.detach }).then((ok) => ok && detach.mutate()),
            },
          ],
        },
      ]}
    >
      <View className="shrink-0 flex-row items-center gap-1">
        <IssueIcon size={12} />
        <Typography type="body-xs" color="muted">
          #{issue.number}
        </Typography>
      </View>
    </TapMenu>
  );
}

const credentialsHref = (conversationId: string, sessionId: string) => `/code/${conversationId}/${sessionId}/credentials` as Href;
export const pullRequestHref = (conversationId: string, sessionId: string) => `/code/${conversationId}/${sessionId}/pull-request` as Href;

const usageTime = (u: NonNullable<CodeSession["usage"]>) => {
  const minutes = u.durationMs / 60_000;
  return minutes < 1 ? `${Math.max(1, Math.round(u.durationMs / 1000))} s` : `${Math.round(minutes)} min`;
};

/**
 * The session's « … » (web SessionDetails): its details as plain lines (the model for those who cannot
 * change it, the account, what it consumed), then its owner's priority and the repository's secrets.
 * Nothing to show: no button.
 */
function DetailsMenu({ conversationId, session, owner }: { conversationId: string; session: CodeSession; owner: boolean }) {
  const t = tr(codeSessions);
  const set = useSetCodePriority();
  const u = session.usage;
  type Line = { label: string; value: string; icon: string; note?: string };
  const lines = ([
    { label: t.engine, value: CODE_ENGINE_NAMES[session.engine], icon: "terminal" },
    !owner && session.model ? { label: t.model, value: modelName(session.model), icon: "cpu" } : null,
    owner && session.account?.email ? { label: t.account, value: session.account.email, icon: "person" } : null,
    u ? { label: t.usage, value: `${t.estimated(format.cost(u.costUsd))}, ${usageTime(u)}`, icon: "chart.bar", note: t.costNote } : null,
  ] as (Line | null)[]).filter((x): x is Line => x !== null);
  const canSecrets = owner && !!session.repo;
  if (!lines.length && !owner) return null;
  const actions: MenuEntry[] = [
    // Read, not chosen: each line its label over its value.
    ...lines.map((l): MenuEntry => ({ title: l.label, actions: [{ label: l.value, icon: l.icon, description: l.note, disabled: true, onPress: () => {} }] })),
    lines.length > 0 && owner && "divider",
    owner && { submenu: `${t.priority} : ${t.priorities[session.priority]}`, icon: PRIORITY_ICONS[session.priority], actions: priorityEntries(session, (priority) => set.mutate({ conversationId, id: session.id, priority })) },
    canSecrets && "divider",
    canSecrets && { label: t.credentials.open, icon: "key", onPress: () => router.push(credentialsHref(conversationId, session.id)) },
  ];
  return <MenuButton icon="ellipsis" label={t.details} actions={actions} />;
}

/* ---------- stream ---------- */

/** Avancement: its branch and pull request, its tasks, its steps live, what waits for an answer, its worktree once done. */
function Overview({ conversationId, session, owner, waiting }: { conversationId: string; session: CodeSessionDetail; owner: boolean; waiting: boolean }) {
  const t = tr(codeSessions);
  const running = session.status === "running";
  return (
    <>
      <ChangesView conversationId={conversationId} session={session} owner={owner && !session.worktree?.removedAt} />
      {session.todos.length > 0 && <SessionTodos session={session} />}
      {session.steps.length === 0 && !waiting ? (
        <View className="items-center gap-3 py-12">
          <Spinner />
          <Typography type="body-sm" color="muted">
            {t.empty}
          </Typography>
        </View>
      ) : (
        <View className="gap-4">
          <Timeline steps={session.steps} running={running} />
          {/* While it works and waits for nobody: what it does now, a light passing over the words. */}
          {running && !waiting && <Shimmer>{session.activity || t.status.running}</Shimmer>}
        </View>
      )}
      {/* What waits for an answer ends the stream, right above the field. */}
      <SessionDecision conversationId={conversationId} session={session} canAnswer={owner} />
      {owner && session.worktree && <WorktreeBanner conversationId={conversationId} session={session} worktree={session.worktree} />}
    </>
  );
}

/**
 * Its tasks, as Linear's sub-issues (web SessionTodos): « Tâches 2/3 » over a thin bar, then one tight
 * line each with the app's task mark; the one under way shimmers while the session works.
 */
function SessionTodos({ session }: { session: CodeSession }) {
  const v = tr(codeSessions).view;
  const running = session.status === "running";
  const done = session.todos.filter((x) => x.status === "completed").length;
  const total = session.todos.length;
  return (
    <View className="gap-2.5">
      <View className="gap-2">
        <View className="flex-row items-baseline gap-2">
          <Typography type="body-xs" weight="medium" color="muted">
            {v.tasks}
          </Typography>
          <Typography type="body-xs" className="text-subtle">
            {`${done}/${total}`}
          </Typography>
        </View>
        <ProgressMark value={done} total={total} />
      </View>
      <View>
        {session.todos.map((todo) => {
          const now = todo.status === "in_progress" && running;
          const text = now && todo.activeForm ? todo.activeForm : todo.content;
          return (
            <View key={todo.id} className="flex-row items-start gap-2.5 py-1.5">
              <View className="pt-0.5">
                <TaskStatusIcon status={todo.status === "completed" ? "done" : todo.status === "in_progress" ? "in_progress" : "todo"} />
              </View>
              <View className="min-w-0 flex-1">
                {now ? (
                  <Shimmer>{text}</Shimmer>
                ) : (
                  <Typography type="body-sm" color={todo.status === "completed" ? "muted" : "default"}>
                    {text}
                  </Typography>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
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

/** Usage warning; once the limit is hit, its owner can move the session to another of their Claude accounts. */
function LimitAlert({ conversationId, session, limit, owner }: { conversationId: string; session: CodeSession; limit: NonNullable<CodeSession["limit"]>; owner: boolean }) {
  const t = tr(codeSessions);
  const c = tr(common);
  const qc = useQueryClient();
  const toast = useAdminToast();
  const rejected = limit.status === "rejected";
  // Only Claude Code's accounts are switched from here.
  const { data: accounts = [] } = useQuery({ ...codeAccountsQuery(conversationId), enabled: owner && rejected && session.engine === "claude" });
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
              <Button key={a.id ?? "server"} size="sm" variant="outline" isDisabled={change.isPending} onPress={withTap(() => change.mutate(a.id))}>
                {change.isPending && change.variables === a.id ? c.inProgress : t.switchTo(a.email ?? t.serverAccount)}
              </Button>
            ))}
          </View>
        )}
      </Alert.Content>
    </Alert>
  );
}

/**
 * Once its owner is done with a session started on a repository: the way to delete its worktree
 * (the branch stays in the clone). Deleted, what a new instruction does.
 */
function WorktreeBanner({ conversationId, session, worktree }: { conversationId: string; session: CodeSession; worktree: NonNullable<CodeSession["worktree"]> }) {
  const t = tr(codeSessions).worktree;
  const qc = useQueryClient();
  const toast = useAdminToast();
  const remove = useMutation({
    mutationFn: () => removeCodeSessionWorktree(conversationId, session.id),
    onSuccess: (s) => {
      applyCodeSession(qc, s);
      toast.success(t.removed);
    },
    onError: (e) => toast.failed(e),
  });
  if (worktree.removedAt) {
    if (isActive(session.status)) return null;
    return (
      <Typography type="body-xs" color="muted" className="px-1">
        {t.gone(worktree.branch)}
      </Typography>
    );
  }
  // Its task is over: its PR merged, or closed without being merged.
  const closed = session.status === "idle" && session.git?.pr?.state === "closed";
  if (session.status !== "done" && !closed) return null;
  const confirm = async () => {
    const branch = session.git?.branch ?? worktree.branch;
    if (await confirmAction({ title: t.confirmTitle(session.title), description: t.confirmHelp(branch, session.git?.changes ?? 0), action: t.remove })) remove.mutate();
  };
  return (
    <Alert>
      <Alert.Content className="gap-2">
        <Alert.Description>{closed ? t.closed : t.done}</Alert.Description>
        <Button size="sm" variant="danger" className="self-start" isDisabled={remove.isPending} onPress={withTap(() => void confirm())}>
          {remove.isPending ? t.removing : t.remove}
        </Button>
      </Alert.Content>
    </Alert>
  );
}

/* ---------- git ---------- */

const FILE_STATE = { added: "A", modified: "M", deleted: "D", renamed: "R" } as const;
const FILE_TONE = { added: "text-success", modified: "text-warning", deleted: "text-danger", renamed: "text-muted" } as const;

type GitAction = { label: string; icon: string; onPress: () => void };

/**
 * Its branch and its pull request, at the top of the stream (web ChangesView): the pull request's card
 * (its merge, its CI) or the branch's line, where it stands, the next git action, and « N fichiers
 * modifiés », which unfolds the files changed and not committed with, for the owner, the commit message
 * (written from the diff when left empty) and the commit.
 */
function ChangesView({ conversationId, session, owner }: { conversationId: string; session: CodeSession; owner: boolean }) {
  const all = tr(codeSessions);
  const t = all.git;
  const v = all.view;
  const qc = useQueryClient();
  const toast = useAdminToast();
  const [message, setMessage] = useState("");
  const [filesOpen, setFilesOpen] = useState(false);
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
    onSuccess: setMessage,
    onError: (e) => toast.failed(e, t.failed),
  });

  const git: CodeGit | null | undefined = session.git;
  // Not a GitHub clone, or not read yet: nothing to show above its stream.
  if (!git) return null;
  const files = git.files ?? [];
  const onBase = !!git.branch && git.branch === git.base;
  const pr = git.pr;
  const openPr = pr?.state === "open" ? pr : null;
  const working = isActive(session.status);
  const busy = working || run.isPending || generate.isPending;
  const commitReq = (): CodeGitRequest => ({ action: "commit", message: message.trim() });

  const commitActions: GitAction[] =
    owner && git.changes > 0
      ? [
          { label: t.commit, icon: "checkmark", onPress: () => run.mutate([commitReq()]) },
          ...(git.github && !onBase ? [{ label: openPr ? t.commitPushPr(openPr.number) : t.commitPush, icon: "arrow.up", onPress: () => run.mutate([commitReq(), { action: "push" }]) }] : []),
        ]
      : [];
  const canPush = git.github && !onBase && git.ahead > 0;
  const canOpenPr = git.github && !onBase && !openPr && (git.ahead > 0 || git.pushed);
  const branchActions: GitAction[] = !owner
    ? []
    : [
        ...(canPush ? [{ label: t.push, icon: "arrow.up", onPress: () => run.mutate([{ action: "push" }]) }] : []),
        ...(canOpenPr ? [{ label: t.openPr, icon: "arrow.triangle.branch", onPress: () => router.push(pullRequestHref(conversationId, session.id)) }] : []),
        ...(git.pushed && git.behind > 0 ? [{ label: t.pull, icon: "arrow.down", onPress: () => run.mutate([{ action: "pull" }]) }] : []),
      ];
  // Merged from its card once the session has finished and what is committed is on GitHub.
  const mergeBlocked = working ? t.busy : canPush ? tr(pullRequests).unpushed : null;

  const where = [
    pr ? `${t.pr(pr.number)} ${t.prState[pr.state]}` : git.branch,
    git.ahead ? (git.pushed ? v.commits(git.ahead) : t.ahead(git.ahead, false)) : null,
    git.behind ? t.behind(git.behind) : null,
    !pr && !git.ahead && !git.behind && !git.changes ? t.clean : null,
  ].filter((w): w is string => !!w);
  // With a pull request: its card, then where the branch stands beside it.
  const branchLine = pr ? where.slice(1) : where;
  const filesLink = git.changes > 0 && (
    <LinkButton size="sm" onPress={withTap(() => setFilesOpen((o) => !o))}>
      <LinkButton.Label>{t.changes(git.changes)}</LinkButton.Label>
    </LinkButton>
  );
  const line = (
    <View className="min-w-0 flex-row flex-wrap items-center gap-x-2.5 gap-y-1">
      {branchLine.map((w) => (
        <Typography key={w} type="body-sm" color="muted">
          {w}
        </Typography>
      ))}
      {filesLink}
    </View>
  );

  return (
    <View className="gap-4">
      {pr ? (
        <View className="gap-2">
          <PullRequestCard
            pr={pr}
            repo={git.repo}
            onMerge={owner && git.github && openPr ? (method) => run.mutate([{ action: "merge", method }]) : undefined}
            merging={run.isPending && run.variables?.at(-1)?.action === "merge"}
            blocked={mergeBlocked}
            actions={branchActions.length > 0 && <GitActions actions={branchActions} busy={busy} pending={run.isPending && run.variables?.at(-1)?.action !== "merge"} />}
          />
          {(branchLine.length > 0 || git.changes > 0) && line}
        </View>
      ) : (
        <Card>
          <View className="gap-3">
            <View className="flex-row items-center gap-3">
              <BrandLogo domain="github.com" fallback={<BranchIcon size={20} className="text-muted" />} className="size-6" />
              <View className="min-w-0 flex-1 gap-0.5">
                <Typography type="code" numberOfLines={1}>
                  {git.branch ?? "?"}
                </Typography>
                {line}
              </View>
            </View>
            {branchActions.length > 0 && (
              <View className="flex-row justify-end">
                <GitActions actions={branchActions} busy={busy} pending={run.isPending} />
              </View>
            )}
          </View>
        </Card>
      )}
      {working && (branchActions.length > 0 || commitActions.length > 0) && <Description className="px-1">{t.busy}</Description>}
      {owner && !git.github && <Description className="px-1">{t.noGithub}</Description>}

      {filesOpen && (git.changes > 0 || files.length > 0) && (
        <View className="gap-2">
          <Typography type="body-xs" weight="medium" color="muted" className="px-1">
            {v.uncommitted(git.changes)}
          </Typography>
          {files.length > 0 && (
            <ListGroup>
              {files.map((f, i) => (
                <Fragment key={f.path}>
                  {i > 0 && <Separator className="mx-4" />}
                  <ListGroup.Item accessibilityLabel={f.path}>
                    <ListGroup.ItemPrefix>
                      <Typography type="code" className={FILE_TONE[f.state]}>
                        {FILE_STATE[f.state]}
                      </Typography>
                    </ListGroup.ItemPrefix>
                    <ListGroup.ItemContent>
                      {/* The end of the path, where the file's name is. */}
                      <Typography type="code" numberOfLines={1} ellipsizeMode="head">
                        {f.path}
                      </Typography>
                    </ListGroup.ItemContent>
                    {f.added !== null && (
                      <ListGroup.ItemSuffix className="flex-row gap-1.5">
                        {f.added > 0 && <Typography type="body-xs" className="font-mono text-success">{`+${f.added}`}</Typography>}
                        {!!f.removed && <Typography type="body-xs" className="font-mono text-danger">{`−${f.removed}`}</Typography>}
                      </ListGroup.ItemSuffix>
                    )}
                  </ListGroup.Item>
                </Fragment>
              ))}
            </ListGroup>
          )}
          {git.changes > files.length && <Description className="px-1">{t.moreFiles(git.changes - files.length)}</Description>}
          {commitActions.length > 0 && (
            <View className="flex-row items-end gap-2">
              <TextField className="flex-1">
                <TextArea value={message} onChangeText={setMessage} accessibilityLabel={t.message} placeholder={t.messagePlaceholder} />
              </TextField>
              <Button isIconOnly size="sm" variant="ghost" accessibilityLabel={t.generate} isDisabled={busy} onPress={withTap(() => generate.mutate())}>
                {generate.isPending ? <Spinner size="sm" /> : <SparklesIcon size={18} className="text-muted" />}
              </Button>
            </View>
          )}
          {commitActions.length > 0 && (
            <View className="flex-row justify-end">
              <GitActions actions={commitActions} busy={busy} pending={run.isPending} />
            </View>
          )}
        </View>
      )}
    </View>
  );
}

/** The next git action as a button, the others behind its arrow; unavailable while the session works. */
function GitActions({ actions, busy, pending }: { actions: GitAction[]; busy: boolean; pending: boolean }) {
  const t = tr(codeSessions).git;
  const c = tr(common);
  const [primary, ...more] = actions;
  if (!primary) return null;
  return (
    <View className="flex-row items-center gap-1">
      <Button size="sm" variant="secondary" isDisabled={busy} onPress={withTap(primary.onPress)}>
        {pending ? c.inProgress : primary.label}
      </Button>
      {more.length > 0 && !busy && (
        <TapMenu accessibilityLabel={t.more} actions={more.map((a) => ({ label: a.label, icon: a.icon, onPress: a.onPress }))}>
          <Button isIconOnly size="sm" variant="secondary" accessibilityLabel={t.more}>
            <ChevronDownIcon size={16} className="text-foreground" />
          </Button>
        </TapMenu>
      )}
    </View>
  );
}

/* ---------- steps ---------- */

type ToolStepT = Extract<CodeStep, { kind: "tool" }>;
type Block = { kind: "step"; step: Exclude<CodeStep, ToolStepT> } | { kind: "tools"; steps: ToolStepT[] } | { kind: "agents"; steps: ToolStepT[] };
const parentOf = (s: CodeStep) => ("parentId" in s ? s.parentId : undefined);
const isSubagent = (s: CodeStep): boolean => s.kind === "tool" && (s.name === "Agent" || s.name === "Task");

/** Consecutive actions read as one block; subagents started together, as another, never folded. */
function blocks(steps: CodeStep[]): Block[] {
  const out: Block[] = [];
  for (const step of steps) {
    const last = out.at(-1);
    const kind = isSubagent(step) ? "agents" : step.kind === "tool" ? "tools" : null;
    if (kind && last?.kind === kind) last.steps.push(step as ToolStepT);
    else if (kind) out.push({ kind, steps: [step as ToolStepT] });
    else out.push({ kind: "step", step: step as Exclude<CodeStep, ToolStepT> });
  }
  return out;
}

/** The steps of one level (the session's, or a subagent's), each subagent call holding its own. */
function Timeline({ steps, running, parentId }: { steps: CodeStep[]; running: boolean; parentId?: string }) {
  const own = steps.filter((s) => parentOf(s) === parentId);
  const last = own.at(-1);
  return (
    <View className="gap-3">
      {blocks(own).map((b) =>
        b.kind === "agents" ? (
          <SubagentBlock key={b.steps[0]!.id} steps={b.steps} all={steps} running={running} />
        ) : b.kind === "tools" ? (
          <ToolBlock key={b.steps[0]!.id} steps={b.steps} all={steps} />
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
          {!!step.files?.length && <SentAttachments items={step.files} className="max-w-[88%]" />}
          {!!step.text && <UserBubble text={step.text} className="max-w-[88%]" />}
        </View>
      );
    case "text":
      return <MessageText text={step.text} streaming={streaming} />;
    case "git":
      return (
        <View className="flex-row items-start gap-2">
          {step.ok ? <BranchIcon size={14} className="mt-0.5 text-muted" /> : <CloseCircleIcon size={14} className="mt-0.5 text-danger" />}
          <Typography type="body-xs" color={step.ok ? "muted" : "default"} className={cn("min-w-0 flex-1", !step.ok && "text-danger")}>
            {step.text}
            {!!step.by && <Typography type="body-xs" color="muted">{`  ${step.by}`}</Typography>}
          </Typography>
        </View>
      );
    case "notice":
      if (step.code === "error") {
        return (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content className="gap-1">
              <Alert.Title>{t.notices.error}</Alert.Title>
              {!!step.text && (
                <Typography type="code" selectable className="text-danger">
                  {step.text}
                </Typography>
              )}
            </Alert.Content>
          </Alert>
        );
      }
      // A note on the run (interrupted, resumed…): one grey line in the flow, not a centred caption.
      return (
        <View className="gap-1.5 px-2">
          <Typography type="body-xs" className="text-subtle">
            {t.notices[step.code]}
          </Typography>
          {!!step.text && <CodeBlock text={step.text} />}
        </View>
      );
  }
}

/** A run of actions: the latest few in view, the earlier ones folded behind one line. */
const SHOWN = 3;
function ToolBlock({ steps, all }: { steps: ToolStepT[]; all: CodeStep[] }) {
  const t = tr(codeSessions);
  const [open, setOpen] = useState(false);
  const hidden = open ? 0 : Math.max(0, steps.length - SHOWN);
  return (
    <View>
      {hidden > 0 && (
        <Button size="sm" variant="ghost" className="self-start px-0" onPress={withTap(() => setOpen(true))}>
          <Button.Label className="text-muted">{t.earlierActions(hidden)}</Button.Label>
        </Button>
      )}
      <Accordion selectionMode="multiple" hideSeparator>
        {steps.slice(hidden).map((s) => (
          <ToolRow key={s.id} step={s} all={all} />
        ))}
      </Accordion>
    </View>
  );
}

type SubagentState = "running" | "done" | "error" | "stopped";

/** Where a subagent stands: its own events when it runs in the background, else its call's. */
function subagentState(step: ToolStepT, running: boolean): SubagentState {
  const state: SubagentState = step.agent?.state ?? (step.status === "running" ? "running" : step.status === "done" ? "done" : "error");
  // The session no longer runs: neither does its subagent.
  return state === "running" && !running ? "stopped" : state;
}

/** Subagents started together: one row each, what it does, how far it got and how it ended. */
function SubagentBlock({ steps, all, running }: { steps: ToolStepT[]; all: CodeStep[]; running: boolean }) {
  const t = tr(codeSessions);
  return (
    <View className="gap-2">
      <Typography type="body-sm" weight="medium">
        {t.subagents(steps.length)}
      </Typography>
      <Accordion selectionMode="multiple" variant="surface">
        {steps.map((s) => (
          <SubagentRow key={s.id} step={s} all={all} running={running} />
        ))}
      </Accordion>
    </View>
  );
}

function SubagentRow({ step, all, running }: { step: ToolStepT; all: CodeStep[]; running: boolean }) {
  const t = tr(codeSessions);
  const state = subagentState(step, running);
  const own = all.filter((s) => parentOf(s) === step.id);
  const tools = step.agent?.tools ?? own.filter((s) => s.kind === "tool").length;
  const lastTool = step.agent?.last ?? own.findLast((s): s is ToolStepT => s.kind === "tool")?.name;
  const progress = [tools ? t.subagentActions(tools) : null, state === "running" && lastTool ? t.subagentLast(toolLabel(lastTool, t.toolNames).name) : null].filter(Boolean).join(", ");
  const description = state === "running" ? progress || t.subagentWaiting : step.agent?.summary || progress || t.subagentState[state];
  return (
    <Accordion.Item value={step.id}>
      <Accordion.Trigger className="gap-3">
        {state === "running" ? (
          <Spinner size="sm" />
        ) : state === "done" ? (
          <CheckCircleIcon size={16} className="text-success" />
        ) : state === "error" ? (
          <CloseCircleIcon size={16} className="text-danger" />
        ) : (
          <BanIcon size={16} className="text-muted" />
        )}
        <View className="min-w-0 flex-1 gap-0.5">
          <Typography type="body-sm" weight="medium" numberOfLines={1}>
            {step.title}
          </Typography>
          {state === "running" ? (
            <Shimmer type="body-xs" numberOfLines={1}>
              {description}
            </Shimmer>
          ) : (
            <Typography type="body-xs" color="muted" numberOfLines={1}>
              {description}
            </Typography>
          )}
        </View>
        <Accordion.Indicator />
      </Accordion.Trigger>
      <Accordion.Content className="gap-3">
        {!!step.input && <Detail label={t.input} text={step.input} />}
        {own.length > 0 && <Timeline steps={all} running={false} parentId={step.id} />}
        {!!step.output && <Detail label={t.output} text={step.output} />}
      </Accordion.Content>
    </Accordion.Item>
  );
}

/** A path reads as its file name; the folders it sits in on the server say nothing. */
const shortTitle = (title: string) => title.replace(/\S*\/([^\s/]+)/g, "$1");

/** Tools whose target is code (a command, a file, a pattern): it reads in code type; the others' in words. */
const CODE_ARGS = new Set(["Bash", "BashOutput", "Grep", "Glob", "Read", "Edit", "MultiEdit", "Write", "NotebookEdit"]);

/** One action, named in words; unfolds to its input and result, and to a subagent's own steps. */
function ToolRow({ step, all }: { step: ToolStepT; all: CodeStep[] }) {
  const t = tr(codeSessions);
  const nested = all.some((s) => parentOf(s) === step.id);
  const expandable = !!(step.input || step.output || nested);
  // Its name as people read it (the connector of an MCP tool, what a built-in one does), never mcp__x__y.
  const label = toolLabel(step.name, t.toolNames);
  const detail = step.title && step.title !== step.name ? shortTitle(step.title) : (label.action ?? "");
  // One quiet line: the tool's mark, what it does (shimmering while it does it), on what, in code type
  // for a command or a file; a finished call shows nothing more, a failed one its cross.
  const row = (
    <View className="min-w-0 flex-1 flex-row items-center gap-2">
      <ToolIcon name={step.name} size={14} className="text-subtle" />
      {step.status === "running" ? (
        <Shimmer>{label.name}</Shimmer>
      ) : (
        <Typography type="body-sm" color="muted">
          {label.name}
        </Typography>
      )}
      {!!detail && (
        <Typography type={CODE_ARGS.has(step.name) ? "body-xs" : "body-sm"} numberOfLines={1} className={cn("min-w-0 flex-1 text-subtle", CODE_ARGS.has(step.name) && "font-mono")}>
          {detail}
        </Typography>
      )}
      {step.status !== "running" && step.status !== "done" && <CloseCircleIcon size={14} className="ml-auto text-danger" />}
    </View>
  );
  return (
    <Accordion.Item value={step.id} isDisabled={!expandable}>
      <Accordion.Trigger className="gap-2 px-0 py-1.5">{row}</Accordion.Trigger>
      <Accordion.Content className="ml-1.5 gap-2 border-l border-border pr-0 pb-2 pl-3">
        {!!step.input && (step.name === "ExitPlanMode" ? <MessageText text={step.input} /> : <Detail label={t.input} text={step.input} />)}
        {nested && <Timeline steps={all} running={false} parentId={step.id} />}
        {!!step.output && <Detail label={t.output} text={step.output} />}
      </Accordion.Content>
    </Accordion.Item>
  );
}

function Detail({ label, text }: { label: string; text: string }) {
  return (
    <View className="gap-1">
      <Typography type="body-xs" color="muted">
        {label}
      </Typography>
      <CodeBlock text={text} />
    </View>
  );
}

/* ---------- composer ---------- */

/** What each permission mode lets the engine do, as an SF Symbol in its menu: ask first, edit freely, only plan, everything. */
const MODE_ICONS: Record<CodePermissionMode, string> = {
  default: "checkmark.shield",
  acceptEdits: "pencil",
  plan: "checklist",
  bypassPermissions: "exclamationmark.shield",
};

/** Its commands, then its skills, each group's best matches of the query first. */
function commandItems(commands: CodeCommand[], query: string): SlashItem[] {
  const items = (skill: boolean) =>
    rankByQuery(
      commands
        .filter((c) => c.skill === skill)
        .map((c): SlashItem => ({
          key: `${skill ? "skill" : "command"}:${c.name}`,
          kind: skill ? "skill" : "command",
          name: c.name,
          description: c.argumentHint ? `${c.argumentHint}  ${c.description}` : c.description,
        })),
      query.toLowerCase(),
    );
  return [...items(false), ...items(true)];
}

/**
 * Same field as the conversation's: what waits in its queue above it, the instruction, the session's
 * mode and model, send (stop while it works). "/" at its start lists the engine's commands and the
 * team's skills, as in its terminal.
 */
function SessionComposer({ conversationId, session, onSent }: { conversationId: string; session: CodeSession; onSent: () => void }) {
  const t = tr(codeSessions);
  const qc = useQueryClient();
  const toast = useAdminToast();
  const [text, setText] = useState("");
  const [attachOpen, setAttachOpen] = useState(false);
  const { files, setFiles, addFiles, removeFile } = usePendingFiles(conversationId, t);
  const ids = files.flatMap((f) => (f.status === "ready" && f.attachment ? [f.attachment.id] : []));
  const send = useMutation({
    mutationFn: ({ value, attachmentIds }: { value: string; attachmentIds: string[] }) => sendToCodeSession(conversationId, session.id, value, attachmentIds),
    onSuccess: (s) => {
      applyCodeSession(qc, s);
      setText("");
      setFiles([]);
      onSent();
    },
    onError: (e) => toast.failed(e),
  });
  const stop = useMutation({
    mutationFn: () => stopCodeSession(conversationId, session.id),
    onSuccess: (s) => applyCodeSession(qc, s),
    onError: (e) => toast.failed(e),
  });
  const mode = useMutation({
    mutationFn: (value: CodePermissionMode) => setCodeSessionMode(conversationId, session.id, value),
    onSuccess: (s) => {
      applyCodeSession(qc, s);
      toast.success(t.modeChanged(t.modes[s.mode]));
    },
    onError: (e) => toast.failed(e),
  });
  // What a session of this engine has before it runs, and its own once it ran: its own win on a name.
  const { data: base = [] } = useQuery({ ...codeCommandsQuery(conversationId, session.engine), retry: false });
  const names = new Set(session.commands.map((c) => c.name));
  const commands = [...session.commands, ...base.filter((c) => !names.has(c.name))];
  // "/name" alone in the field: a skill or a command being picked.
  const query = /^\/([\w:.-]*)$/.exec(text)?.[1] ?? null;
  const items = query === null ? [] : commandItems(commands, query);
  // While it works, the send button stops it; typing turns it back into send (an instruction mid-run).
  const stoppable = isActive(session.status) && !text.trim() && !files.length;
  const canSend = !send.isPending && !files.some((f) => f.status === "uploading") && (!!text.trim() || ids.length > 0);
  const submit = () => {
    if (canSend) send.mutate({ value: text.trim(), attachmentIds: ids });
  };
  const queueDone = (s: CodeSession) => applyCodeSession(qc, s);
  const placeholder = session.question
    ? session.question.options?.length
      ? t.placeholderAnswerOther
      : t.placeholderAnswer
    : isActive(session.status)
      ? t.placeholderRunning
      : commands.length
        ? t.placeholderIdleCommands
        : t.placeholderIdle;
  return (
    <View className="gap-2">
      <QueueList
        items={session.queued ?? []}
        onEdit={(id, value) => editQueued(conversationId, session.id, id, value).then(queueDone)}
        onSendNow={(id) => sendQueuedNow(conversationId, session.id, id).then(queueDone)}
        onRemove={(id) => removeQueued(conversationId, session.id, id).then(queueDone)}
      />
      <View>
        {items.length > 0 && (
          <View pointerEvents="box-none" className="absolute inset-x-0 bottom-full mb-2">
            <SlashMenu items={items} onPick={(item) => setText(`/${item.name} `)} />
          </View>
        )}
        <Surface variant="secondary" className="gap-1 p-2">
          <PendingFiles items={files} onRemove={removeFile} />
          <Input
            multiline
            value={text}
            onChangeText={setText}
            placeholder={placeholder}
            accessibilityLabel={t.instruction}
            className="max-h-[152px] bg-transparent px-2 pt-2.5 pb-1.5 text-body shadow-none ios:focus:outline-transparent android:focus:border-transparent"
          />
          <View className="flex-row items-center gap-2">
            <AttachMenu open={attachOpen} onOpenChange={setAttachOpen} onFiles={addFiles} />
            <TapMenu
              accessibilityLabel={`${t.mode}: ${t.modes[session.mode]}`}
              actions={[
                {
                  title: t.mode,
                  actions: codeEngineModes(session.engine).map((m) => ({ label: t.modes[m], icon: MODE_ICONS[m], description: t.modeHelp[m], checked: m === session.mode, onPress: () => m !== session.mode && mode.mutate(m) })),
                },
              ]}
            >
              <Button variant="ghost" size="sm" isDisabled={mode.isPending} className="max-w-[150px]">
                <Button.Label numberOfLines={1}>{t.modes[session.mode]}</Button.Label>
              </Button>
            </TapMenu>
            <View className="flex-1" />
            <SessionModelPicker conversationId={conversationId} session={session} />
            {stoppable ? (
              <Button isIconOnly size="sm" variant="primary" accessibilityLabel={stop.isPending ? t.stopping : t.stop} isDisabled={stop.isPending} onPress={withTap(() => stop.mutate())}>
                {stop.isPending ? <Spinner size="sm" /> : <StopIcon className="size-[18px] text-accent-foreground" />}
              </Button>
            ) : (
              <Button isIconOnly size="sm" variant="primary" accessibilityLabel={t.send} isDisabled={!canSend} onPress={withTap(submit)}>
                <ArrowUpIcon className="size-[18px] text-accent-foreground" strokeWidth={2.25} />
              </Button>
            )}
          </View>
        </Surface>
      </View>
    </View>
  );
}

/** The session's model, among the ones its owner may use with its engine; named as people read it. */
function SessionModelPicker({ conversationId, session }: { conversationId: string; session: CodeSession }) {
  const t = tr(codeSessions);
  const qc = useQueryClient();
  const toast = useAdminToast();
  const { data: models = [] } = useQuery(codeModelsQuery(conversationId, session.engine));
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
  // Its engine's default, as it resolved it: listed even when it is not among the models offered.
  const list: { id: string; label?: string }[] = session.model && !current ? [{ id: session.model }, ...models] : models;
  const name = (m: { id: string; label?: string }) => m.label ?? modelName(m.id);
  const shown = current ? name(current) : session.model ? modelName(session.model) : t.model;
  return (
    <TapMenu
      accessibilityLabel={`${t.model}: ${shown}`}
      actions={list.map((m) => ({ label: name(m), checked: m.id === session.model, onPress: () => m.id !== session.model && change.mutate(m.id) }))}
    >
      <Button variant="ghost" size="sm" className="max-w-[180px]">
        <ModelLogo provider={ENGINE_PROVIDER[session.engine]} model={session.model ?? undefined} size={14} />
        <Button.Label numberOfLines={1}>{shown}</Button.Label>
      </Button>
    </TapMenu>
  );
}
