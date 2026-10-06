import {
  CODE_PERMISSION_MODES,
  codeStatusText,
  OTHER_ANSWER,
  questionAnswer,
  rankByQuery,
  type CodeApproval,
  type CodeBotQuestion,
  type CodeGit,
  type CodeQuestion,
  type CodeSession,
  type CodeStep,
  type CodeTodo,
} from "@agora/core";
import { codeSessions, common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { Stack, router, useFocusEffect, type Href } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import {
  Accordion,
  Alert,
  BottomSheet,
  Button,
  Card,
  Chip,
  ControlField,
  Description,
  Input,
  Label,
  ListGroup,
  Menu,
  Radio,
  RadioGroup,
  Separator,
  Spinner,
  Surface,
  TextArea,
  TextField,
  Typography,
  useBottomSheetAwareHandlers,
} from "heroui-native";
import { Fragment, useCallback, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { AppState, ScrollView, View } from "react-native";
import { KeyboardChatScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAdminToast } from "@/components/admin/ui";
import { SentAttachments } from "@/components/attachments";
import { AttachMenu } from "@/components/composer/attach-menu";
import { PendingFiles, usePendingFiles } from "@/components/composer/pending-files";
import { UserBubble } from "@/components/bubbles";
import { isActive, StatusIcon } from "@/components/code-session";
import { confirmAction } from "@/components/confirm-action";
import { ArrowUpIcon, BranchIcon, ChartIcon, CheckCircleIcon, CircleIcon, CloseCircleIcon, CopyIcon, ExternalLinkIcon, FolderIcon, KeyIcon, StopIcon, TaskListIcon, ToolIcon, UserIcon } from "@/components/icons";
import { MenuButton, MenuContent } from "@/components/menus";
import { MessageText } from "@/components/message-text";
import { SlashMenu, type SlashItem } from "@/components/slash-menu";
import { ModelLogo } from "@/components/model-logo";
import { format } from "@/components/profile/usage-format";
import { useMe } from "@/components/server-scope";
import {
  answerCodeApproval,
  applyCodeSession,
  codeAccountsQuery,
  codeModelsQuery,
  codeSessionQuery,
  deleteCodeSession,
  dropCodeSession,
  refreshCodeSessionGit,
  removeCodeSessionWorktree,
  runCodeGit,
  sendToCodeSession,
  setCodeSessionMode,
  setCodeSessionModel,
  stopCodeSession,
  switchCodeSessionAccount,
  writeCommitMessage,
  type CodeGitRequest,
} from "@/lib/code-sessions";
import { withTap } from "@/lib/haptics";
import { locale, tr } from "@/lib/i18n";
import { dateFormat } from "@/lib/intl";
import { cn } from "@/lib/utils";

/*
 * apps/web/src/components/CodeSession.tsx's panel as a screen pushed over the conversation. The thread
 * holds every step, live, and ends on what waits for an answer (an approval, questions, a plan). Only
 * the field rides on the keyboard, with a chip for the task list and one for the branch: each opens
 * its sheet. The session's details are in the header's menu. The pull request's form is a form sheet
 * (app/(app)/code/…/pull-request.tsx).
 */

type SheetKind = "info" | "todos" | "git";

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
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const owner = !!session && session.requestedBy === me.id;
  useGitRefresh(conversationId, sessionId, !!session?.git && !session.worktree?.removedAt);
  const qc = useQueryClient();
  const toast = useAdminToast();
  // Deleted by its owner: its run stops, and the screen gives way to the conversation.
  const remove = useMutation({
    mutationFn: () => deleteCodeSession(conversationId, sessionId),
    onSuccess: () => {
      router.back();
      dropCodeSession(qc, conversationId, sessionId);
      toast.success(t.deleted);
    },
    onError: (e) => toast.failed(e),
  });
  const confirmDelete = async () => {
    if (session && (await confirmAction({ title: t.deleteTitle(session.title), description: t.deleteHelp, action: t.deleteSession }))) remove.mutate();
  };

  const toEnd = (animated: boolean) => {
    follow.current = true;
    scroller.current?.scrollToEnd({ animated });
  };
  const todos = session && showTodos(session.todos, session.status === "running") ? session.todos : null;

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
                { label: t.details, icon: "info.circle", onPress: () => setSheet("info") },
                !!session.git?.pr && { label: t.git.pr(session.git.pr.number), icon: "link", onPress: () => void Linking.openURL(session.git!.pr!.url) },
                owner && !!session.repo && { label: t.credentials.open, icon: "key", onPress: () => router.push(credentialsHref(conversationId, session.id)) },
                owner && "divider",
                owner && { label: t.deleteSession, icon: "trash", destructive: true, disabled: remove.isPending, onPress: () => void confirmDelete() },
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
              <View className="flex-row items-center gap-2">
                <StatusIcon status={session.status} asking={!!session.question} />
                <Typography type="body-sm" color="muted" className="min-w-0 flex-1">
                  {codeStatusText(t, session)}
                  {session.mode !== "bypassPermissions" ? ` · ${t.modes[session.mode]}` : ""}
                  {session.activity && isActive(session.status) ? ` · ${session.activity}` : ""}
                </Typography>
              </View>
              {session.limit && <LimitAlert conversationId={conversationId} session={session} limit={session.limit} owner={owner} />}
              {session.steps.length === 0 ? (
                <View className="items-center py-12">
                  <Spinner />
                </View>
              ) : (
                <Timeline steps={session.steps} running={session.status === "running"} />
              )}
              {/* What waits for an answer ends the thread, where the run stopped. */}
              {session.approval?.kind === "question" && session.approval.questions ? (
                <QuestionBlock conversationId={conversationId} session={session} approval={session.approval} questions={session.approval.questions} canAnswer={owner} />
              ) : session.approval?.kind === "plan" ? (
                <PlanBlock conversationId={conversationId} session={session} approval={session.approval} canAnswer={owner} />
              ) : (
                session.approval && <ApprovalBlock conversationId={conversationId} session={session} approval={session.approval} canAnswer={owner} />
              )}
              {session.question && <BotQuestionBlock conversationId={conversationId} session={session} question={session.question} canAnswer={owner} />}
              {owner && session.worktree && <WorktreeBanner conversationId={conversationId} session={session} worktree={session.worktree} />}
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
                {(todos || session.git) && (
                  <View className="flex-row gap-2">
                    {todos && <TodosChip todos={todos} running={session.status === "running"} onPress={() => setSheet("todos")} />}
                    {session.git && <BranchChip git={session.git} onPress={() => setSheet("git")} />}
                  </View>
                )}
                {owner ? (
                  <SessionComposer conversationId={conversationId} session={session} onSent={() => toEnd(true)} />
                ) : (
                  <Typography type="body-sm" color="muted" className="px-1 pb-1">
                    {t.readOnly}
                  </Typography>
                )}
              </Surface>
            </KeyboardStickyView>

            <SessionSheet open={sheet === "info"} onClose={() => setSheet(null)} title={t.details}>
              <InfoList conversationId={conversationId} session={session} owner={owner} onLeave={() => setSheet(null)} />
            </SessionSheet>
            <SessionSheet open={sheet === "todos"} onClose={() => setSheet(null)} title={t.todos.title}>
              <TodoList todos={session.todos} running={session.status === "running"} />
            </SessionSheet>
            {session.git && (
              <SessionSheet open={sheet === "git"} onClose={() => setSheet(null)} title={t.git.changesTitle} snapPoints={["70%", "92%"]}>
                <ChangesPanel conversationId={conversationId} session={session} git={session.git} owner={owner && !session.worktree?.removedAt} onLeave={() => setSheet(null)} />
              </SessionSheet>
            )}
          </>
        )}
      </Surface>
    </>
  );
}

/** A sheet over the session: its details, its task list or its branch. */
function SessionSheet({ open, onClose, title, snapPoints = ["50%", "92%"], children }: { open: boolean; onClose: () => void; title: string; snapPoints?: string[]; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <BottomSheet isOpen={open} onOpenChange={(next) => !next && onClose()}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content snapPoints={snapPoints} enableDynamicSizing={false} enableOverDrag={false} keyboardBehavior="extend" contentContainerClassName="h-full">
          <View className="flex-row items-center justify-between pb-3">
            <BottomSheet.Title>{title}</BottomSheet.Title>
            <BottomSheet.Close />
          </View>
          <View className="min-h-0 flex-1">
            <BottomSheetScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerClassName="gap-4 pt-1" contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}>
              {children}
            </BottomSheetScrollView>
          </View>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
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

/**
 * The session's details, in the sheet of the header's menu: the model, the Claude account, the folder
 * (a tap copies its path), what it consumed, and the repository's credentials for its owner.
 */
function InfoList({ conversationId, session, owner, onLeave }: { conversationId: string; session: CodeSession; owner: boolean; onLeave: () => void }) {
  const t = tr(codeSessions);
  const c = tr(common);
  const toast = useAdminToast();
  const u = session.usage;
  const minutes = u ? u.durationMs / 60_000 : 0;
  const time = !u ? "" : minutes < 1 ? `${Math.max(1, Math.round(u.durationMs / 1000))} s` : `${Math.round(minutes)} min`;
  const rows: ReactNode[] = [
    !!session.model && (
      <ListGroup.Item key="model">
        <ListGroup.ItemPrefix>
          <ModelLogo provider="anthropic" model={session.model} size={20} />
        </ListGroup.ItemPrefix>
        <ListGroup.ItemContent>
          <ListGroup.ItemTitle>{t.model}</ListGroup.ItemTitle>
          <ListGroup.ItemDescription>{session.model}</ListGroup.ItemDescription>
        </ListGroup.ItemContent>
      </ListGroup.Item>
    ),
    owner && !!session.account && (
      <ListGroup.Item key="account">
        <ListGroup.ItemPrefix>
          <UserIcon size={20} className="text-muted" />
        </ListGroup.ItemPrefix>
        <ListGroup.ItemContent>
          <ListGroup.ItemTitle>{t.account}</ListGroup.ItemTitle>
          <ListGroup.ItemDescription>
            {session.account.email ?? t.serverAccount}
            {session.account.plan ? ` · ${session.account.plan}` : ""}
          </ListGroup.ItemDescription>
        </ListGroup.ItemContent>
      </ListGroup.Item>
    ),
    <ListGroup.Item
      key="folder"
      accessibilityLabel={t.copyPath}
      onPress={withTap(async () => {
        await Clipboard.setStringAsync(session.cwd);
        toast.success(c.copied, session.cwd);
      })}
    >
      <ListGroup.ItemPrefix>
        <FolderIcon size={20} className="text-muted" />
      </ListGroup.ItemPrefix>
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle>{t.folder}</ListGroup.ItemTitle>
        <ListGroup.ItemDescription numberOfLines={2}>{session.cwd}</ListGroup.ItemDescription>
      </ListGroup.ItemContent>
      <ListGroup.ItemSuffix>
        <CopyIcon size={16} className="text-muted" />
      </ListGroup.ItemSuffix>
    </ListGroup.Item>,
    !!u && (
      <ListGroup.Item key="usage">
        <ListGroup.ItemPrefix>
          <ChartIcon size={20} className="text-muted" />
        </ListGroup.ItemPrefix>
        <ListGroup.ItemContent>
          <ListGroup.ItemTitle>{t.usage}</ListGroup.ItemTitle>
          <ListGroup.ItemDescription>
            {t.tokens(format.compact(u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheWriteTokens))} · {format.cost(u.costUsd)} · {t.runs(u.runs)} · {time}
          </ListGroup.ItemDescription>
          <ListGroup.ItemDescription>
            {t.usageDetail(format.compact(u.inputTokens), format.compact(u.outputTokens), format.compact(u.cacheReadTokens + u.cacheWriteTokens), u.turns)}
          </ListGroup.ItemDescription>
        </ListGroup.ItemContent>
      </ListGroup.Item>
    ),
    owner && !!session.repo && (
      <ListGroup.Item
        key="credentials"
        onPress={withTap(() => {
          onLeave();
          router.push(credentialsHref(conversationId, session.id));
        })}
      >
        <ListGroup.ItemPrefix>
          <KeyIcon size={20} className="text-muted" />
        </ListGroup.ItemPrefix>
        <ListGroup.ItemContent>
          <ListGroup.ItemTitle>{t.credentials.open}</ListGroup.ItemTitle>
          <ListGroup.ItemDescription>{session.repo}</ListGroup.ItemDescription>
        </ListGroup.ItemContent>
        <ListGroup.ItemSuffix />
      </ListGroup.Item>
    ),
  ].filter(Boolean);
  return (
    <View className="gap-2">
      <ListGroup>
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 && <Separator className="mx-4" />}
            {row}
          </Fragment>
        ))}
      </ListGroup>
      {!!u && <Description className="px-4">{t.costNote}</Description>}
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
const credentialsHref = (conversationId: string, sessionId: string) => `/code/${conversationId}/${sessionId}/credentials` as Href;

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

/** The branch above the field: its name and its changes; a tap opens its sheet. */
function BranchChip({ git, onPress }: { git: CodeGit; onPress: () => void }) {
  const t = tr(codeSessions).git;
  const summary = git.changes ? t.changes(git.changes) : git.ahead ? t.ahead(git.ahead, git.pushed) : git.pr ? `${t.pr(git.pr.number)} · ${t.prState[git.pr.state]}` : t.clean;
  return (
    <Chip size="sm" variant="secondary" accessibilityRole="button" onPress={withTap(onPress)} className="min-w-0 shrink">
      <BranchIcon size={14} className="text-muted" />
      <Chip.Label numberOfLines={1}>
        {git.branch ?? "?"} · {summary}
      </Chip.Label>
    </Chip>
  );
}

/**
 * The branch's sheet (web: ChangesBar): where the clone stands, its pull request, the files changed
 * with their lines, and for the owner the commit message and the git actions (commit, push, PR,
 * merge). A commit without a message gets one written by Claude Code from the diff.
 */
function ChangesPanel({ conversationId, session, git, owner, onLeave }: { conversationId: string; session: CodeSession; git: CodeGit; owner: boolean; onLeave: () => void }) {
  const t = tr(codeSessions).git;
  const c = tr(common);
  const qc = useQueryClient();
  const toast = useAdminToast();
  const field = useBottomSheetAwareHandlers();
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
    onSuccess: setMessage,
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

  // The next thing to do with the branch first, then what else can be done with it.
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
          ...(canOpenPr
            ? [
                {
                  label: t.openPr,
                  onPress: () => {
                    onLeave();
                    router.push(pullRequestHref(conversationId, session.id));
                  },
                },
              ]
            : []),
          ...(canPush ? [{ label: openPr ? t.pushPr(openPr.number) : t.push, onPress: () => run.mutate([{ action: "push" }]) }] : []),
          ...(git.pushed && git.behind > 0 ? [{ label: t.pull, onPress: () => run.mutate([{ action: "pull" }]) }] : []),
          ...(git.github && openPr && !canPush ? [{ label: t.merge, onPress: () => void merge() }] : []),
        ];
  const summary = [git.changes ? t.changes(git.changes) : null, git.ahead ? t.ahead(git.ahead, git.pushed) : null, git.behind ? t.behind(git.behind) : null].filter(Boolean);

  return (
    <View className="gap-4">
      <View className="gap-1 px-1">
        <Typography type="code" numberOfLines={1}>
          {git.branch ?? "?"}
        </Typography>
        <Typography type="body-sm" color="muted">
          {summary.length ? summary.join(" · ") : t.clean}
          {added > 0 || removed > 0 ? "  " : ""}
          {added > 0 && <Typography type="body-sm" className="text-success">{`+${added} `}</Typography>}
          {removed > 0 && <Typography type="body-sm" className="text-danger">{`−${removed}`}</Typography>}
        </Typography>
      </View>

      {pr && (
        <ListGroup>
          <ListGroup.Item accessibilityRole="link" onPress={withTap(() => Linking.openURL(pr.url))}>
            <ListGroup.ItemContent>
              <ListGroup.ItemTitle>
                {t.pr(pr.number)} · {t.prState[pr.state]}
              </ListGroup.ItemTitle>
              <ListGroup.ItemDescription numberOfLines={2}>{pr.title}</ListGroup.ItemDescription>
            </ListGroup.ItemContent>
            <ListGroup.ItemSuffix>
              <ExternalLinkIcon size={16} className="text-muted" />
            </ListGroup.ItemSuffix>
          </ListGroup.Item>
        </ListGroup>
      )}

      {files.length > 0 && (
        <ListGroup>
          {files.map((f, i) => {
            const slash = f.path.lastIndexOf("/");
            return (
              <Fragment key={f.path}>
                {i > 0 && <Separator className="mx-4" />}
                <ListGroup.Item accessibilityLabel={f.path}>
                  <ListGroup.ItemPrefix>
                    <Typography type="code" className={FILE_TONE[f.state]}>
                      {FILE_STATE[f.state]}
                    </Typography>
                  </ListGroup.ItemPrefix>
                  <ListGroup.ItemContent>
                    <ListGroup.ItemTitle numberOfLines={1}>{f.path.slice(slash + 1)}</ListGroup.ItemTitle>
                    {slash > 0 && <ListGroup.ItemDescription numberOfLines={1}>{f.path.slice(0, slash)}</ListGroup.ItemDescription>}
                  </ListGroup.ItemContent>
                  {f.added !== null && (
                    <ListGroup.ItemSuffix>
                      <Typography type="body-sm">
                        {f.added > 0 && <Typography type="body-sm" className="text-success">{`+${f.added}`}</Typography>}
                        {!!f.removed && <Typography type="body-sm" className="text-danger">{` −${f.removed}`}</Typography>}
                      </Typography>
                    </ListGroup.ItemSuffix>
                  )}
                </ListGroup.Item>
              </Fragment>
            );
          })}
        </ListGroup>
      )}
      {git.changes > files.length && <Description className="px-4">{t.moreFiles(git.changes - files.length)}</Description>}

      {owner && git.changes > 0 && (
        <TextField>
          <Label>{t.message}</Label>
          <TextArea value={message} onChangeText={setMessage} placeholder={t.messagePlaceholder} onFocus={field.onFocus} onBlur={field.onBlur} />
          <Button size="sm" variant="ghost" className="self-start" isDisabled={busy} onPress={withTap(() => generate.mutate())}>
            {generate.isPending ? t.writing : t.generate}
          </Button>
        </TextField>
      )}

      {actions.length > 0 && (
        <View className="gap-2">
          {actions.map((a, i) => (
            <Button key={a.label} variant={i === 0 ? "primary" : "secondary"} isDisabled={busy} onPress={withTap(a.onPress)}>
              {run.isPending && i === 0 ? c.inProgress : a.label}
            </Button>
          ))}
          {working && <Description className="px-4">{t.busy}</Description>}
        </View>
      )}
      {owner && !git.github && <Description className="px-4">{t.noGithub}</Description>}
    </View>
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
        {!!step.input && (step.name === "ExitPlanMode" ? <MessageText text={step.input} /> : <Detail label={t.input} text={step.input} />)}
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
  const answer = useMutation({
    mutationFn: (choice: CodeApproval["choices"][number]) => answerCodeApproval(conversationId, session.id, approval.id, { choice }),
    onSuccess: (s) => applyCodeSession(qc, s),
    onError: (e) => toast.failed(e),
  });
  return (
    <Card role="alert" accessibilityLabel={t.asks}>
      <View className="gap-4">
        <Card.Body className="gap-3">
          <View className="gap-1">
            <Card.Title>
              {t.asks} <Typography type="code">{approval.tool}</Typography>
            </Card.Title>
            <Card.Description numberOfLines={2}>{approval.title}</Card.Description>
          </View>
          {!!approval.detail && <Detail text={approval.detail} />}
        </Card.Body>
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
      </View>
    </Card>
  );
}

/** Its task list is shown while a task is left or while it works. */
const showTodos = (todos: CodeTodo[], running: boolean) => todos.length > 0 && (running || todos.some((x) => x.status !== "completed"));

/** Claude Code's task list above the field (web: TodoBar): where it stands; a tap opens every task. */
function TodosChip({ todos, running, onPress }: { todos: CodeTodo[]; running: boolean; onPress: () => void }) {
  const t = tr(codeSessions).todos;
  const done = todos.filter((x) => x.status === "completed").length;
  return (
    <Chip size="sm" variant="secondary" accessibilityRole="button" accessibilityLabel={t.label(done, todos.length)} onPress={withTap(onPress)}>
      {running ? <Spinner size="sm" /> : <TaskListIcon size={14} className="text-muted" />}
      <Chip.Label>{t.progress(done, todos.length)}</Chip.Label>
    </Chip>
  );
}

/** Every task of its list, in its sheet. */
function TodoList({ todos, running }: { todos: CodeTodo[]; running: boolean }) {
  return (
    <ListGroup>
      {todos.map((todo, i) => (
        <Fragment key={todo.id}>
          {i > 0 && <Separator className="mx-4" />}
          <ListGroup.Item>
            <ListGroup.ItemPrefix>
              <TodoMark status={todo.status} running={running} />
            </ListGroup.ItemPrefix>
            <ListGroup.ItemContent>
              <ListGroup.ItemTitle>
                {todo.status === "in_progress" && todo.activeForm ? todo.activeForm : todo.content}
              </ListGroup.ItemTitle>
            </ListGroup.ItemContent>
          </ListGroup.Item>
        </Fragment>
      ))}
    </ListGroup>
  );
}

function TodoMark({ status, running }: { status: CodeTodo["status"]; running: boolean }) {
  if (status === "completed") return <CheckCircleIcon size={20} className="text-success" />;
  if (status === "in_progress" && running) return <Spinner size="sm" />;
  return <CircleIcon size={20} className={status === "in_progress" ? "text-foreground" : "text-muted"} />;
}

/**
 * Its question to the bot that started it (ask_bot; web: BotQuestionBlock): the bot answers it, or its
 * owner, with one of its options or the next message of the field below, which goes to it as the answer.
 */
function BotQuestionBlock({ conversationId, session, question, canAnswer }: { conversationId: string; session: CodeSession; question: CodeBotQuestion; canAnswer: boolean }) {
  const t = tr(codeSessions);
  const c = tr(common);
  const qc = useQueryClient();
  const toast = useAdminToast();
  const [choice, setChoice] = useState<Choice>({ picked: [], other: "" });
  const answer = useMutation({
    mutationFn: (text: string) => sendToCodeSession(conversationId, session.id, text),
    onSuccess: (s) => {
      applyCodeSession(qc, s);
      toast.success(t.question.answered);
    },
    onError: (e) => toast.failed(e),
  });
  const options = question.options?.length
    ? [...question.options.map((o) => ({ value: o.label, label: o.label, description: o.description })), { value: OTHER_ANSWER, label: t.question.other, description: undefined }]
    : [];
  const value = answerOf(choice);
  const help = !canAnswer ? t.botQuestion.waiting(question.bot) : options.length ? t.botQuestion.pick(question.bot, options[0]!.label) : t.botQuestion.help(question.bot);
  return (
    <Card role="alert" accessibilityLabel={t.botQuestion.title(question.bot)}>
      <View className="gap-4">
        <Card.Body className="gap-3">
          <View className="gap-1">
            <Card.Title>{t.botQuestion.title(question.bot)}</Card.Title>
            <Card.Description>{help}</Card.Description>
          </View>
          <MessageText text={question.text} />
          {!!question.context && <MessageText text={question.context} />}
          {options.length > 0 && (
            <RadioGroup value={choice.picked[0]} isDisabled={!canAnswer || answer.isPending} onValueChange={(v) => setChoice((all) => ({ ...all, picked: [v] }))}>
              {options.map((o, i) => (
                <Fragment key={o.value}>
                  {i > 0 && <Separator className="my-1" />}
                  <RadioGroup.Item value={o.value}>
                    <View className="flex-1">
                      <Label>{o.label}</Label>
                      {!!o.description && <Description>{o.description}</Description>}
                    </View>
                    <Radio />
                  </RadioGroup.Item>
                </Fragment>
              ))}
            </RadioGroup>
          )}
          {choice.picked.includes(OTHER_ANSWER) && (
            <Input
              autoFocus
              accessibilityLabel={t.question.other}
              placeholder={t.question.otherPlaceholder}
              value={choice.other}
              onChangeText={(other) => setChoice((all) => ({ ...all, other }))}
            />
          )}
        </Card.Body>
        {canAnswer && options.length > 0 && (
          <Card.Footer className="flex-row flex-wrap gap-2">
            <Button size="sm" variant="primary" isDisabled={!value || answer.isPending} onPress={withTap(() => answer.mutate(value))}>
              {answer.isPending ? c.inProgress : t.question.answer}
            </Button>
          </Card.Footer>
        )}
      </View>
    </Card>
  );
}

type Choice = { picked: string[]; other: string };

const answerOf = (c: Choice | undefined) => (c ? questionAnswer(c.picked, c.other) : "");

/**
 * Claude Code's questions (AskUserQuestion; web: QuestionBlock): each with its options, one or several
 * to pick, and "Other" for an answer of one's own. The run waits for the answers.
 */
function QuestionBlock({
  conversationId,
  session,
  approval,
  questions,
  canAnswer,
}: {
  conversationId: string;
  session: CodeSession;
  approval: CodeApproval;
  questions: CodeQuestion[];
  canAnswer: boolean;
}) {
  const t = tr(codeSessions);
  const c = tr(common);
  const qc = useQueryClient();
  const toast = useAdminToast();
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const answer = useMutation({
    mutationFn: (skip: boolean) =>
      answerCodeApproval(
        conversationId,
        session.id,
        approval.id,
        skip ? { choice: "deny" } : { choice: "once", answers: Object.fromEntries(questions.map((q) => [q.question, answerOf(choices[q.question])])) },
      ),
    onSuccess: (s, skip) => {
      applyCodeSession(qc, s);
      if (!skip) toast.success(t.question.answered);
    },
    onError: (e) => toast.failed(e),
  });
  const set = (question: string, change: Partial<Choice>) =>
    setChoices((all) => ({ ...all, [question]: { ...(all[question] ?? { picked: [], other: "" }), ...change } }));
  const complete = questions.every((q) => answerOf(choices[q.question]));
  return (
    <Card accessibilityLabel={t.question.title}>
      <View className="gap-4">
        <Card.Body className="gap-4">
          <Card.Title>{questions.length > 1 ? t.question.titleMany(questions.length) : t.question.title}</Card.Title>
          {questions.map((q) => {
            const picked = choices[q.question]?.picked ?? [];
            const options = [...q.options.map((o) => ({ value: o.label, label: o.label, description: o.description })), { value: OTHER_ANSWER, label: t.question.other, description: undefined }];
            const text = (o: (typeof options)[number]) => (
              <View className="flex-1">
                <Label>{o.label}</Label>
                {!!o.description && <Description>{o.description}</Description>}
              </View>
            );
            return (
              <View key={q.question} className="gap-2">
                <View className="flex-row flex-wrap items-center gap-2">
                  {!!q.header && (
                    <Chip size="sm" variant="secondary">
                      {q.header}
                    </Chip>
                  )}
                  <Typography type="body-sm" weight="medium" className="min-w-0 flex-1">
                    {q.question}
                  </Typography>
                </View>
                {q.multiSelect ? (
                  <View className="gap-2">
                    {options.map((o) => (
                      <ControlField
                        key={o.value}
                        isDisabled={!canAnswer}
                        isSelected={picked.includes(o.value)}
                        onSelectedChange={(on) => set(q.question, { picked: on ? [...picked, o.value] : picked.filter((p) => p !== o.value) })}
                      >
                        {text(o)}
                        <ControlField.Indicator variant="checkbox" />
                      </ControlField>
                    ))}
                  </View>
                ) : (
                  <RadioGroup value={picked[0]} isDisabled={!canAnswer} onValueChange={(v) => set(q.question, { picked: [v] })}>
                    {options.map((o, i) => (
                      <Fragment key={o.value}>
                        {i > 0 && <Separator className="my-1" />}
                        <RadioGroup.Item value={o.value}>
                          {text(o)}
                          <Radio />
                        </RadioGroup.Item>
                      </Fragment>
                    ))}
                  </RadioGroup>
                )}
                {picked.includes(OTHER_ANSWER) && (
                  <Input
                    autoFocus
                    accessibilityLabel={t.question.other}
                    placeholder={t.question.otherPlaceholder}
                    value={choices[q.question]?.other ?? ""}
                    onChangeText={(other) => set(q.question, { other })}
                  />
                )}
              </View>
            );
          })}
        </Card.Body>
        <Card.Footer className="flex-row flex-wrap gap-2">
          {canAnswer ? (
            <>
              <Button size="sm" variant="primary" isDisabled={!complete || answer.isPending} onPress={withTap(() => answer.mutate(false))}>
                {answer.isPending && !answer.variables ? c.inProgress : t.question.answer}
              </Button>
              <Button size="sm" variant="ghost" isDisabled={answer.isPending} onPress={withTap(() => answer.mutate(true))}>
                {answer.isPending && answer.variables ? c.inProgress : t.question.skip}
              </Button>
            </>
          ) : (
            <Typography type="body-sm" color="muted">
              {t.waitingOwner}
            </Typography>
          )}
        </Card.Footer>
      </View>
    </Card>
  );
}

/**
 * The plan Claude Code wrote in plan mode (ExitPlanMode; web: PlanBlock): read whole, then approved
 * (it starts, in the mode it had before planning) or sent back with what to change.
 */
function PlanBlock({ conversationId, session, approval, canAnswer }: { conversationId: string; session: CodeSession; approval: CodeApproval; canAnswer: boolean }) {
  const t = tr(codeSessions);
  const c = tr(common);
  const qc = useQueryClient();
  const toast = useAdminToast();
  const [feedback, setFeedback] = useState("");
  const answer = useMutation({
    mutationFn: (approve: boolean) =>
      answerCodeApproval(conversationId, session.id, approval.id, approve ? { choice: "once" } : { choice: "deny", feedback: feedback.trim() }),
    onSuccess: (s, approve) => {
      applyCodeSession(qc, s);
      setFeedback("");
      toast.success(approve ? t.plan.approved : t.plan.sentBack);
    },
    onError: (e) => toast.failed(e),
  });
  return (
    <Card accessibilityLabel={t.plan.title}>
      <View className="gap-4">
        <Card.Body className="gap-3">
          <View className="gap-1">
            <Card.Title>{t.plan.title}</Card.Title>
            <Card.Description>{t.plan.help}</Card.Description>
          </View>
          {!!approval.plan && <MessageText text={approval.plan} />}
          {canAnswer && (
            <TextField>
              <Label>{t.plan.feedback}</Label>
              <TextArea value={feedback} onChangeText={setFeedback} placeholder={t.plan.feedbackPlaceholder} />
            </TextField>
          )}
        </Card.Body>
        <Card.Footer className="flex-row flex-wrap gap-2">
          {canAnswer ? (
            <>
              <Button size="sm" variant="primary" isDisabled={answer.isPending || !!feedback.trim()} onPress={withTap(() => answer.mutate(true))}>
                {answer.isPending && answer.variables ? c.inProgress : t.plan.approve}
              </Button>
              <Button size="sm" variant="secondary" isDisabled={answer.isPending} onPress={withTap(() => answer.mutate(false))}>
                {answer.isPending && !answer.variables ? c.inProgress : t.plan.revise}
              </Button>
            </>
          ) : (
            <Typography type="body-sm" color="muted">
              {t.waitingOwner}
            </Typography>
          )}
        </Card.Footer>
      </View>
    </Card>
  );
}

/**
 * Same field as the conversation's: the instruction, the session's mode and model, send (stop while it
 * works). "/" at its start lists Claude Code's skills and slash commands, as in its terminal.
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
    mutationFn: (value: CodeSession["mode"]) => setCodeSessionMode(conversationId, session.id, value),
    onSuccess: (s) => {
      applyCodeSession(qc, s);
      toast.success(t.modeChanged(t.modes[s.mode]));
    },
    onError: (e) => toast.failed(e),
  });
  // "/name" alone in the field: a skill or a command being picked.
  const query = /^\/([\w:.-]*)$/.exec(text)?.[1] ?? null;
  const items: SlashItem[] =
    query === null
      ? []
      : rankByQuery(
          [...session.commands]
            .sort((a, b) => Number(b.skill) - Number(a.skill))
            .map((cmd) => ({
              key: `${cmd.skill ? "skill" : "command"}:${cmd.name}`,
              kind: cmd.skill ? ("skill" as const) : ("command" as const),
              name: cmd.name,
              description: cmd.argumentHint ? `${cmd.argumentHint} · ${cmd.description}` : cmd.description,
            })),
          query,
        );
  // While Claude Code works, the send button stops it; typing turns it back into send (an instruction mid-run).
  const stoppable = isActive(session.status) && !text.trim() && !files.length;
  const canSend = !send.isPending && !files.some((f) => f.status === "uploading") && (!!text.trim() || ids.length > 0);
  const submit = () => {
    if (canSend) send.mutate({ value: text.trim(), attachmentIds: ids });
  };
  return (
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
          placeholder={session.question ? t.placeholderAnswer : isActive(session.status) ? t.placeholderRunning : session.commands.length ? t.commands.hint : t.placeholderIdle}
          className="max-h-[152px] bg-transparent px-2 pt-2.5 pb-1.5 text-body shadow-none ios:focus:outline-transparent android:focus:border-transparent"
        />
        <View className="flex-row items-center gap-2">
          <AttachMenu open={attachOpen} onOpenChange={setAttachOpen} onFiles={addFiles} />
          <Menu>
            <Menu.Trigger asChild>
              <Button variant="outline" size="sm" accessibilityLabel={`${t.mode}: ${t.modes[session.mode]}`} isDisabled={mode.isPending} className="max-w-[150px]">
                <Button.Label numberOfLines={1}>{t.modes[session.mode]}</Button.Label>
              </Button>
            </Menu.Trigger>
            <MenuContent
              placement="top"
              entries={[
                {
                  title: t.mode,
                  actions: CODE_PERMISSION_MODES.map((m) => ({ label: t.modes[m], checked: m === session.mode, onPress: () => m !== session.mode && mode.mutate(m) })),
                },
              ]}
            />
          </Menu>
          <SessionModelPicker conversationId={conversationId} session={session} />
          <View className="flex-1" />
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
