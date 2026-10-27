import { byCodePriority, CODE_PRIORITIES, codeDetailLine, codeSessionState, codeStatusText, placeCodeSessions, type CodePriority, type CodeSession, type CodeSessionRef, type CodeSessionStatus } from "@agora/core";
import { codeSessions } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import { Button, Card, ListGroup, Separator, Surface, Typography } from "heroui-native";
import { Fragment, useEffect, type ReactNode } from "react";
import { View } from "react-native";
import { useAdminToast } from "@/components/admin/ui";
import { confirmAction } from "@/components/confirm-action";
import { AgentAvatar } from "@/components/agent-avatar";
import { CodePriorityIcon, CodeStateIcon, IssueIcon } from "@/components/code-session-marks";
import { CodeIcon, PlusIcon } from "@/components/icons";
import { LongPressMenu, type MenuEntry } from "@/components/menus";
import { useMe } from "@/components/server-scope";
import { applyCodeSession, codeModelsQuery, codeSessionsQuery, deleteCodeSession, dropCodeSession, refreshCodeSessionGit, setCodeSessionPriority } from "@/lib/code-sessions";
import { listTime } from "@/lib/dates";
import { conversationQuery } from "@/lib/queries";
import { withTap } from "@/lib/haptics";
import { tr } from "@/lib/i18n";

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

/** Figma « Menu de priorité » as menu entries: the five priorities, the current one checked. */
export function priorityEntries(session: Pick<CodeSession, "priority">, set: (p: CodePriority) => void): MenuEntry[] {
  const t = tr(codeSessions);
  return [{ title: t.priority, actions: CODE_PRIORITIES.map((p) => ({ label: t.priorities[p], mark: <CodePriorityIcon priority={p} />, checked: session.priority === p, onPress: () => p !== session.priority && set(p) })) }];
}

/** Card of a Claude Code session, where it was started in the conversation: where it stands, and the way into its steps. */
export function CodeSessionCard({ conversationId, sessionId, title }: { conversationId: string; sessionId: string; title: string }) {
  const t = tr(codeSessions);
  const { data } = useQuery(codeSessionsQuery(conversationId));
  const session = data?.find((s) => s.id === sessionId);
  // Deleted by its owner: the card stays, without the way into it.
  const gone = !!data && !session;
  const status = session?.status ?? "running";
  const detail = session && codeDetailLine(session);
  return (
    <Card className="w-full flex-row items-center gap-3 self-start rounded-[14px] border border-border bg-background p-3">
      <Surface variant="secondary" className="size-9 items-center justify-center rounded-[10px] p-0 shadow-none">
        <CodeIcon size={18} className="text-foreground" />
      </Surface>
      <Card.Body className="min-w-0 gap-0.5">
        <Card.Title numberOfLines={1} className="text-sm font-semibold">
          {session?.title ?? title}
        </Card.Title>
        <View className="flex-row items-center gap-1.5">
          {session && <CodeStateIcon state={codeSessionState(session)} size={12} />}
          <Card.Description numberOfLines={1} className="shrink-0 text-footnote">
            {session ? codeStatusText(t, session) : gone ? t.gone : t.status[status]}
          </Card.Description>
          {!!detail && (
            <Typography type="body-xs" numberOfLines={1} className="ml-1 min-w-0 shrink text-subtle">
              {detail}
            </Typography>
          )}
        </View>
      </Card.Body>
      {!gone && (
        <Button size="sm" variant="secondary" onPress={withTap(() => router.push(codeSessionHref(conversationId, sessionId)))}>
          {isActive(status) ? t.follow : t.open}
        </Button>
      )}
    </Card>
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

/**
 * Every session of the conversation (the web's header button), each opening its screen; its owner
 * starts one from the first row and deletes one with a long press.
 */
export function CodeSessionList({ conversationId, onOpen, onNew }: { conversationId: string; onOpen: (sessionId: string) => void; onNew: () => void }) {
  const t = tr(codeSessions);
  const qc = useQueryClient();
  const me = useMe();
  const toast = useAdminToast();
  const canStart = useCanStartCodeSession(conversationId);
  const sessions = byCodePriority(useCodeSessions(conversationId) ?? []);
  const { data: conversation } = useQuery(conversationQuery(conversationId));
  const setPriority = useSetCodePriority();
  const remove = useMutation({
    mutationFn: (id: string) => deleteCodeSession(conversationId, id),
    onSuccess: (_, id) => {
      dropCodeSession(qc, conversationId, id);
      toast.success(t.deleted);
    },
    onError: (e) => toast.failed(e),
  });
  const confirmDelete = async (s: CodeSession) => {
    if (await confirmAction({ title: t.deleteTitle(s.title), description: t.deleteHelp, action: t.deleteSession })) remove.mutate(s.id);
  };
  // Opened: the pull requests still open, and the branches pushed, as they are on GitHub now.
  useEffect(() => {
    for (const s of qc.getQueryData(codeSessionsQuery(conversationId).queryKey) ?? []) {
      if (s.git?.pr?.state === "open" || (s.git?.pushed && !s.git.pr)) {
        refreshCodeSessionGit(conversationId, s.id).then(
          (fresh) => applyCodeSession(qc, fresh),
          () => {},
        );
      }
    }
  }, [conversationId, qc]);
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
      {sessions.map((s, i) => {
        const owner = canStart && s.requestedBy === me.id;
        const agent = s.agentId ? conversation?.agents.find((a) => a.id === s.agentId) : undefined;
        return (
          <Fragment key={s.id}>
            {(i > 0 || canStart) && <Separator className="ml-16" />}
            <LongPressMenu
              actions={
                owner
                  ? [...priorityEntries(s, (priority) => setPriority.mutate({ conversationId, id: s.id, priority })), "divider", { label: t.deleteSession, icon: "trash", destructive: true, onPress: () => void confirmDelete(s) }]
                  : []
              }
            >
              <ListGroup.Item onPress={withTap(() => onOpen(s.id))} className="items-start">
                <ListGroup.ItemPrefix className="flex-row gap-2 pt-0.5">
                  <CodePriorityIcon priority={s.priority} />
                  <CodeStateIcon state={codeSessionState(s)} />
                </ListGroup.ItemPrefix>
                <ListGroup.ItemContent className="gap-0.5">
                  <ListGroup.ItemTitle numberOfLines={2}>{s.title}</ListGroup.ItemTitle>
                  <SessionMeta session={s} who={agent?.name ?? (s.requestedBy === me.id ? t.page.you : null)} agent={agent} />
                </ListGroup.ItemContent>
                <ListGroup.ItemSuffix>
                  <Typography type="body-xs" className="text-subtle">
                    {listTime(new Date(s.updatedAt))}
                  </Typography>
                </ListGroup.ItemSuffix>
              </ListGroup.Item>
            </LongPressMenu>
          </Fragment>
        );
      })}
    </ListGroup>
  );
}

/** A row's meta line (web Sessions' SessionRow): who, its issue, what it does or where it stands; spaced, no separators. */
function SessionMeta({ session: s, who, agent }: { session: CodeSession; who: string | null; agent?: { avatar: { color: string; shape?: string } } }) {
  const t = tr(codeSessions);
  const state = codeSessionState(s);
  const detail =
    state === "waiting" || state === "running"
      ? codeDetailLine(s)
      : s.git?.pr
        ? `${t.git.pr(s.git.pr.number)} ${t.git.prState[s.git.pr.state]}`
        : s.todos.length
          ? t.page.todos(s.todos.filter((x) => x.status === "completed").length, s.todos.length)
          : s.worktree?.removedAt
            ? t.worktree.listGone
            : null;
  return (
    <View className="min-w-0 flex-row items-center gap-2">
      {!!who && (
        <View className="shrink-0 flex-row items-center gap-1.5">
          {agent && <AgentAvatar agent={agent} size={14} />}
          <Typography type="body-sm" color="muted">
            {who}
          </Typography>
        </View>
      )}
      {s.issue && (
        <View className="shrink-0 flex-row items-center gap-1">
          <IssueIcon size={12} />
          <Typography type="body-sm" color="muted">
            #{s.issue.number}
          </Typography>
        </View>
      )}
      {!!detail && (
        <Typography
          type="body-sm"
          color="muted"
          numberOfLines={1}
          className={state === "waiting" ? "min-w-0 shrink text-state-you" : state === "failed" ? "min-w-0 shrink text-priority-urgent" : "min-w-0 shrink"}
        >
          {detail}
        </Typography>
      )}
    </View>
  );
}
