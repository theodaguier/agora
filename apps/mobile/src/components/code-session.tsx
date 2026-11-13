import { CODE_ENGINE_NAMES, CODE_PRIORITIES, codeSessionState, codeStatusText, placeCodeSessions, type CodePriority, type CodeSession, type CodeSessionRef, type CodeSessionStatus } from "@agora/core";
import { codeSessions } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import { Card, ListGroup, PressableFeedback, Separator, Surface, Typography } from "heroui-native";
import { Fragment, useEffect, type ReactNode } from "react";
import { View } from "react-native";
import { useAdminToast } from "@/components/admin/ui";
import { confirmAction } from "@/components/confirm-action";
import { CodeStateIcon, codeStateTone, PriorityMark } from "@/components/code-session-marks";
import { SessionDecision } from "@/components/code-session-decision";
import { PullRequestStatus } from "@/components/pull-request";
import { ChevronRightIcon, PlusIcon } from "@/components/icons";
import { ModelLogo } from "@/components/model-logo";
import { Shimmer } from "@/components/shimmer";
import { LongPressMenu, type MenuEntry } from "@/components/menus";
import { useMe } from "@/components/server-scope";
import { applyCodeSession, codeModelsQuery, codeSessionsQuery, deleteCodeSession, dropCodeSession, refreshCodeSessionGit, setCodeSessionPriority } from "@/lib/code-sessions";
import { listTime } from "@/lib/dates";
import { withTap } from "@/lib/haptics";
import { tr } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/*
 * apps/web/src/components/CodeSession.tsx, in the thread: a session's card where the bot started it,
 * and the list of a conversation's sessions. The session itself opens as a screen of its own
 * (screens/code-session.tsx) instead of the web's side panel.
 */

export const isActive = (s: CodeSessionStatus) => s === "running" || s === "waiting";

export const codeSessionHref = (conversationId: string, sessionId: string) => `/code/${conversationId}/${sessionId}` as Href;

/** Sets a session's priority (its owner): the list, its card and its screen follow. */
export function useSetCodePriority() {
  const t = tr(codeSessions);
  const qc = useQueryClient();
  const toast = useAdminToast();
  return useMutation({
    mutationFn: (v: { conversationId: string; id: string; priority: CodePriority }) => setCodeSessionPriority(v.conversationId, v.id, v.priority),
    onSuccess: (s) => {
      applyCodeSession(qc, s);
      toast.success(t.priorityChanged(t.priorities[s.priority]));
    },
    onError: (e) => toast.failed(e),
  });
}

/** Each priority as an SF Symbol, for the native menus (they can't draw the bars). */
export const PRIORITY_ICONS: Record<CodePriority, string> = {
  urgent: "exclamationmark.square.fill",
  high: "exclamationmark.3",
  medium: "exclamationmark.2",
  low: "exclamationmark",
  none: "minus",
};

/** Figma « Menu de priorité » as menu entries: the five priorities, the current one checked. */
export function priorityEntries(session: Pick<CodeSession, "priority">, set: (p: CodePriority) => void): MenuEntry[] {
  const t = tr(codeSessions);
  return [{ title: t.priority, actions: CODE_PRIORITIES.map((p) => ({ label: t.priorities[p], icon: PRIORITY_ICONS[p], checked: session.priority === p, onPress: () => p !== session.priority && set(p) })) }];
}

/** The session card's frame (web: Card size sm): white, a hairline, its parts edge to edge. */
const sessionCard = "w-full gap-0 overflow-hidden rounded-xl border border-border bg-background p-0";

/** Card of a code session, where it was started in the conversation: it fetches the session, then shows it live. */
export function CodeSessionCard({ conversationId, sessionId, title }: { conversationId: string; sessionId: string; title: string }) {
  const t = tr(codeSessions);
  const { data } = useQuery(codeSessionsQuery(conversationId));
  const session = data?.find((s) => s.id === sessionId);
  // Deleted by its owner: the card stays, without the way into it.
  if (!session) {
    return (
      <Card className={sessionCard}>
        <Card.Body className="gap-0.5 px-3.5 py-3">
          <Card.Title numberOfLines={1} className="text-subheadline font-medium">
            {title}
          </Card.Title>
          <Card.Description className="text-footnote">{data ? t.gone : t.status.running}</Card.Description>
        </Card.Body>
      </Card>
    );
  }
  return <LiveSessionCard session={session} onOpen={() => router.push(codeSessionHref(conversationId, sessionId))} />;
}

/**
 * Figma « Carte de session vivante » (web: LiveSessionCard): one line that opens the session (who codes,
 * its title over its repository, its state); under a hairline, what it waits for, what it does now and
 * its tasks, its pull request, or its answer.
 */
export function LiveSessionCard({ session, onOpen }: { session: CodeSession; onOpen: () => void }) {
  const t = tr(codeSessions);
  const state = codeSessionState(session);
  const waiting = !!(session.approval || session.question);
  const running = session.status === "running" && !waiting;
  const done = session.todos.filter((x) => x.status === "completed").length;
  const tone = codeStateTone(state);
  const owner = session.requestedBy === useMe().id;
  return (
    <Card className={sessionCard}>
      <PressableFeedback onPress={withTap(onOpen)} accessibilityRole="button" accessibilityLabel={session.title} className="flex-row items-center gap-3 px-3.5 py-3">
        <PressableFeedback.Highlight />
        {/* Who codes: Claude Code or Codex, by its logo; its name for VoiceOver. */}
        <Surface variant="secondary" accessibilityLabel={CODE_ENGINE_NAMES[session.engine]} className="size-7 items-center justify-center rounded-md p-0 shadow-none">
          <ModelLogo provider={ENGINE_PROVIDER[session.engine]} model={session.engine === "cursor" ? undefined : session.engine} size={16} />
        </Surface>
        <View className="min-w-0 flex-1 gap-0.5">
          <Typography type="body-sm" weight="medium" numberOfLines={1}>
            {session.title}
          </Typography>
          {!!session.repo && (
            <Typography type="body-xs" numberOfLines={1} className="font-mono text-subtle">
              {session.repo}
            </Typography>
          )}
        </View>
        <View className="max-w-[40%] shrink-0 flex-row items-center gap-1.5">
          <CodeStateIcon state={state} size={12} />
          <Typography type="body-xs" color="muted" numberOfLines={1} className={cn("shrink", tone)}>
            {codeStatusText(t, session)}
          </Typography>
          <ChevronRightIcon size={12} className="text-subtle" />
        </View>
      </PressableFeedback>
      {waiting ? (
        <SessionSection>
          {/* The decision itself, in the card: no separate block. */}
          <SessionDecision conversationId={session.conversationId} session={session} canAnswer={owner} inline />
        </SessionSection>
      ) : running ? (
        <SessionSection className="flex-row items-center gap-2">
          <View className="min-w-0 flex-1">
            <Shimmer numberOfLines={1}>{session.activity || t.status.running}</Shimmer>
          </View>
          {session.todos.length > 0 && (
            <Typography type="body-sm" color="muted" className="shrink-0 tabular-nums">
              {t.view.tasksCount(done, session.todos.length)}
            </Typography>
          )}
        </SessionSection>
      ) : session.git?.pr ? (
        // Its pull request: the whole line opens it on GitHub.
        <SessionSection>
          <PullRequestStatus pr={session.git.pr} />
        </SessionSection>
      ) : session.result ? (
        <SessionSection>
          <Typography type="body-sm" color="muted" numberOfLines={2}>
            {session.result}
          </Typography>
        </SessionSection>
      ) : null}
    </Card>
  );
}

/** Who codes, as LobeHub names its vendor (web: ModelLogo provider={engine}). */
export const ENGINE_PROVIDER: Record<CodeSession["engine"], string> = { claude: "anthropic", codex: "openai", cursor: "cursor" };

/** A part of the session card under its line, past a hairline. */
function SessionSection({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <>
      <Separator />
      <View className={cn("px-3.5 py-3", className)}>{children}</View>
    </>
  );
}

/**
 * A bot's reply with the Claude Code sessions it started: each card where the bot was in its text
 * when it started it. `typing`: the reply is still being written after its last card.
 */
export function ReplyWithSessions({
  conversationId,
  text,
  sessions,
  streaming,
  typing,
  bubble,
}: {
  conversationId: string;
  text: string;
  sessions: CodeSessionRef[];
  streaming?: boolean;
  typing?: ReactNode;
  bubble: (text: string, streaming: boolean) => ReactNode;
}) {
  const parts = placeCodeSessions(text, sessions);
  const last = parts.at(-1);
  return (
    <View className="min-w-0 gap-2">
      {parts.map((p) =>
        p.kind === "text" ? (
          <Fragment key={`text:${p.text.slice(0, 40)}:${p.text.length}`}>{bubble(p.text, !!streaming && p === last)}</Fragment>
        ) : (
          <CodeSessionCard key={p.session.id} conversationId={conversationId} sessionId={p.session.id} title={p.session.title} />
        ),
      )}
      {last?.kind === "code" && typing}
    </View>
  );
}

/** The conversation's sessions, the latest first (null while there are none). */
export function useCodeSessions(conversationId: string): CodeSession[] | null {
  const { data } = useQuery(codeSessionsQuery(conversationId));
  if (!data?.length) return null;
  return [...data].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Its owner may start a session in this conversation: the Claude Code models answer them alone (403 otherwise). */
export function useCanStartCodeSession(conversationId: string) {
  return useQuery({ ...codeModelsQuery(conversationId), retry: false }).isSuccess;
}

export const newCodeSessionHref = (conversationId: string) => `/code/${conversationId}/new` as Href;

/** Deletes a session (its owner), once confirmed: gone from every list. */
export function useDeleteCodeSession() {
  const t = tr(codeSessions);
  const qc = useQueryClient();
  const toast = useAdminToast();
  const remove = useMutation({
    mutationFn: (s: Pick<CodeSession, "id" | "conversationId">) => deleteCodeSession(s.conversationId, s.id),
    onSuccess: (_, s) => {
      dropCodeSession(qc, s.conversationId, s.id);
      toast.success(t.deleted);
    },
    onError: (e) => toast.failed(e),
  });
  return async (s: Pick<CodeSession, "id" | "conversationId" | "title">) => {
    if (await confirmAction({ title: t.deleteTitle(s.title), description: t.deleteHelp, action: t.deleteSession })) remove.mutate(s);
  };
}

/** Opened: the pull requests still open, and the branches pushed, as they are on GitHub now. */
export function useRefreshCodeSessionsGit(sessions: CodeSession[] | undefined) {
  const qc = useQueryClient();
  const loaded = !!sessions;
  useEffect(() => {
    for (const s of sessions ?? []) {
      if (s.git?.pr?.state === "open" || (s.git?.pushed && !s.git.pr)) {
        refreshCodeSessionGit(s.conversationId, s.id).then(
          (fresh) => applyCodeSession(qc, fresh),
          () => {},
        );
      }
    }
    // Once per opening, not on every change the refresh itself brings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, qc]);
}

/**
 * A session in the conversation's list (web CodeSessionsButton's rows, Figma « 8 · Proposition — Sessions
 * de code »): one line, as on the Sessions screen: priority, state, title, when. Its owner deletes it
 * with a long press.
 */
export function CodeSessionRow({ session: s, owner, onOpen }: { session: CodeSession; owner: boolean; onOpen: () => void }) {
  const t = tr(codeSessions);
  const confirmDelete = useDeleteCodeSession();
  return (
    <LongPressMenu actions={owner ? [{ label: t.deleteSession, icon: "trash", destructive: true, onPress: () => void confirmDelete(s) }] : []}>
      <ListGroup.Item onPress={withTap(onOpen)} accessibilityLabel={`${s.title}, ${codeStatusText(t, s)}`}>
        <ListGroup.ItemPrefix className="flex-row items-center gap-2.5">
          <PriorityMark priority={s.priority} />
          <CodeStateIcon state={codeSessionState(s)} />
        </ListGroup.ItemPrefix>
        <ListGroup.ItemContent>
          <ListGroup.ItemTitle numberOfLines={1}>{s.title}</ListGroup.ItemTitle>
        </ListGroup.ItemContent>
        <ListGroup.ItemSuffix>
          <Typography type="body-xs" className="text-subtle">
            {listTime(new Date(s.updatedAt))}
          </Typography>
        </ListGroup.ItemSuffix>
      </ListGroup.Item>
    </LongPressMenu>
  );
}

/**
 * Every session of the conversation (the web's header button), each opening its screen; its owner
 * starts one from the first row and deletes one with a long press.
 */
export function CodeSessionList({ conversationId, onOpen, onNew }: { conversationId: string; onOpen: (sessionId: string) => void; onNew: () => void }) {
  const t = tr(codeSessions);
  const me = useMe();
  const canStart = useCanStartCodeSession(conversationId);
  const loaded = useCodeSessions(conversationId);
  const sessions = loaded ?? [];
  useRefreshCodeSessionsGit(loaded ?? undefined);
  return (
    <ListGroup>
      {canStart && (
        <ListGroup.Item onPress={withTap(onNew)}>
          <ListGroup.ItemPrefix>
            <PlusIcon size={18} className="text-muted" />
          </ListGroup.ItemPrefix>
          <ListGroup.ItemContent>
            <ListGroup.ItemTitle>{t.newSession}</ListGroup.ItemTitle>
          </ListGroup.ItemContent>
          <ListGroup.ItemSuffix />
        </ListGroup.Item>
      )}
      {sessions.map((s, i) => (
        <Fragment key={s.id}>
          {(i > 0 || canStart) && <Separator className="mx-4" />}
          <CodeSessionRow session={s} owner={canStart && s.requestedBy === me.id} onOpen={() => onOpen(s.id)} />
        </Fragment>
      ))}
    </ListGroup>
  );
}
