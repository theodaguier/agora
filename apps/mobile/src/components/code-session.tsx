import { codeDetailLine, codeStatusText, placeCodeSessions, type CodeSession, type CodeSessionRef, type CodeSessionStatus } from "@agora/core";
import { codeSessions } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import { Button, Card, ListGroup, Separator, Spinner } from "heroui-native";
import { Fragment, useEffect, type ReactNode } from "react";
import { View } from "react-native";
import { useAdminToast } from "@/components/admin/ui";
import { confirmAction } from "@/components/confirm-action";
import { ChatQuestionIcon, CheckCircleIcon, ClockIcon, CloseCircleIcon, CodeIcon, PlusIcon, ShieldAlertIcon } from "@/components/icons";
import { LongPressMenu } from "@/components/menus";
import { useMe } from "@/components/server-scope";
import { applyCodeSession, codeModelsQuery, codeSessionsQuery, deleteCodeSession, dropCodeSession, refreshCodeSessionGit } from "@/lib/code-sessions";
import { dividerLabel } from "@/lib/dates";
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

/** `asking`: it waits on its question to its bot, not on an approval. */
export function StatusIcon({ status, asking, className }: { status: CodeSessionStatus; asking?: boolean; className?: string }) {
  if (status === "running") return <Spinner size="sm" className={className} />;
  if (status === "waiting" && asking) return <ChatQuestionIcon size={18} className={cn("text-warning", className)} />;
  if (status === "waiting") return <ShieldAlertIcon size={18} className={cn("text-warning", className)} />;
  if (status === "idle") return <ClockIcon size={18} className={cn("text-muted", className)} />;
  if (status === "done") return <CheckCircleIcon size={18} className={cn("text-success", className)} />;
  return <CloseCircleIcon size={18} className={cn(status === "failed" ? "text-danger" : "text-muted", className)} />;
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
    <Card className="w-full max-w-[92%] flex-row items-center gap-3 self-start">
      {session ? <StatusIcon status={status} asking={!!session.question} /> : <CodeIcon size={18} className="text-muted" />}
      <Card.Body className="min-w-0 gap-0.5">
        <Card.Title numberOfLines={1}>{session?.title ?? title}</Card.Title>
        <Card.Description numberOfLines={1}>
          {t.claudeCode} · {session ? codeStatusText(t, session) : gone ? t.gone : t.status[status]}
          {detail ? ` · ${detail}` : ""}
        </Card.Description>
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
  const sessions = useCodeSessions(conversationId) ?? [];
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
      {sessions.map((s, i) => (
        <Fragment key={s.id}>
          {(i > 0 || canStart) && <Separator className="ml-12" />}
          <LongPressMenu actions={[canStart && s.requestedBy === me.id && { label: t.deleteSession, icon: "trash", destructive: true, onPress: () => void confirmDelete(s) }]}>
            <ListGroup.Item onPress={withTap(() => onOpen(s.id))} className="items-start">
              <ListGroup.ItemPrefix className="pt-0.5">
                <StatusIcon status={s.status} asking={!!s.question} />
              </ListGroup.ItemPrefix>
              <ListGroup.ItemContent className="gap-0.5">
                <ListGroup.ItemTitle numberOfLines={2}>{s.title}</ListGroup.ItemTitle>
                <ListGroup.ItemDescription numberOfLines={1}>
                  {codeStatusText(t, s)}
                  {s.git?.pr ? ` · PR #${s.git.pr.number}` : s.git?.branch ? ` · ${s.git.branch}` : ""}
                  {s.worktree?.removedAt ? ` · ${t.worktree.listGone}` : ""} · {dividerLabel(new Date(s.updatedAt))}
                </ListGroup.ItemDescription>
                {s.instruction && (
                  <ListGroup.ItemDescription numberOfLines={2}>
                    {s.instruction.by ? t.instructedBy(s.instruction.by, s.instruction.text) : s.instruction.text}
                  </ListGroup.ItemDescription>
                )}
              </ListGroup.ItemContent>
              <ListGroup.ItemSuffix />
            </ListGroup.Item>
          </LongPressMenu>
        </Fragment>
      ))}
    </ListGroup>
  );
}
