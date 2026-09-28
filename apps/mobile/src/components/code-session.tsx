import { placeCodeSessions, type CodeSession, type CodeSessionRef, type CodeSessionStatus } from "@agora/core";
import { codeSessions } from "@agora/core/i18n";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import { Button, Card, ListGroup, Separator, Spinner } from "heroui-native";
import { Fragment, useEffect, type ReactNode } from "react";
import { View } from "react-native";
import { CheckCircleIcon, CloseCircleIcon, CodeIcon, ShieldAlertIcon } from "@/components/icons";
import { applyCodeSession, codeSessionsQuery, refreshCodeSessionGit } from "@/lib/code-sessions";
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

export function StatusIcon({ status, className }: { status: CodeSessionStatus; className?: string }) {
  if (status === "running") return <Spinner size="sm" className={className} />;
  if (status === "waiting") return <ShieldAlertIcon size={18} className={cn("text-warning", className)} />;
  if (status === "idle") return <CheckCircleIcon size={18} className={cn("text-success", className)} />;
  return <CloseCircleIcon size={18} className={cn(status === "failed" ? "text-danger" : "text-muted", className)} />;
}

/** Card of a Claude Code session, where it was started in the conversation: where it stands, and the way into its steps. */
export function CodeSessionCard({ conversationId, sessionId, title }: { conversationId: string; sessionId: string; title: string }) {
  const t = tr(codeSessions);
  const { data } = useQuery(codeSessionsQuery(conversationId));
  const session = data?.find((s) => s.id === sessionId);
  const status = session?.status ?? "running";
  const detail = session?.approval ? `${session.approval.tool} · ${session.approval.title}` : isActive(status) ? session?.activity : null;
  return (
    <Card className="w-full max-w-[92%] self-start">
      <View className="flex-row items-center gap-3">
        {session ? <StatusIcon status={status} /> : <CodeIcon size={18} className="text-muted" />}
        <View className="min-w-0 flex-1 gap-0.5">
          <Card.Title numberOfLines={1}>{session?.title ?? title}</Card.Title>
          <Card.Description numberOfLines={1}>
            {t.claudeCode} · {t.status[status]}
            {detail ? ` · ${detail}` : ""}
          </Card.Description>
        </View>
        <Button size="sm" variant="secondary" onPress={withTap(() => router.push(codeSessionHref(conversationId, sessionId)))}>
          {isActive(status) ? t.follow : t.open}
        </Button>
      </View>
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

/** Every session of the conversation (the web's header button), each opening its screen. */
export function CodeSessionList({ conversationId, onOpen }: { conversationId: string; onOpen: (sessionId: string) => void }) {
  const t = tr(codeSessions);
  const qc = useQueryClient();
  const sessions = useCodeSessions(conversationId) ?? [];
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
      {sessions.map((s, i) => (
        <Fragment key={s.id}>
          {i > 0 && <Separator className="ml-12" />}
          <ListGroup.Item onPress={withTap(() => onOpen(s.id))} className="items-start">
            <ListGroup.ItemPrefix className="pt-0.5">
              <StatusIcon status={s.status} />
            </ListGroup.ItemPrefix>
            <ListGroup.ItemContent className="gap-0.5">
              <ListGroup.ItemTitle numberOfLines={2}>{s.title}</ListGroup.ItemTitle>
              <ListGroup.ItemDescription numberOfLines={1}>
                {t.status[s.status]}
                {s.git?.pr ? ` · PR #${s.git.pr.number}` : s.git?.branch ? ` · ${s.git.branch}` : ""} · {dividerLabel(new Date(s.updatedAt))}
              </ListGroup.ItemDescription>
              {s.instruction && (
                <ListGroup.ItemDescription numberOfLines={2}>
                  {s.instruction.by ? t.instructedBy(s.instruction.by, s.instruction.text) : s.instruction.text}
                </ListGroup.ItemDescription>
              )}
            </ListGroup.ItemContent>
            <ListGroup.ItemSuffix />
          </ListGroup.Item>
        </Fragment>
      ))}
    </ListGroup>
  );
}
