import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CODE_PRIORITIES, CODE_PRIORITY_KEYS, codeSessionState, type CodePriority, type CodeSession } from "@agora/core";
import { codeSessions } from "@agora/core/i18n";
import type { ReactElement } from "react";
import { CodePriorityIcon, CodeStateIcon } from "@/components/CodeSessionMarks";
import { MoreIcon, TrashIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/i18n";
import { confirmAction } from "@/lib/confirm";
import { applyCodeSession, deleteCodeSession, dropCodeSession, setCodeSessionParked, setCodeSessionPriority, stopCodeSession } from "@/lib/code-sessions";

/** Sets any session's priority (a row dropped into a priority group); the list, its tab and its panel follow. */
export function useSetCodePriorityOf() {
  const t = useT(codeSessions);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { conversationId: string; id: string; priority: CodePriority }) => setCodeSessionPriority(v.conversationId, v.id, v.priority),
    onSuccess: (s) => applyCodeSession(qc, s),
    meta: { success: (s: CodeSession) => t.priorityChanged(t.priorities[s.priority]) },
  });
}

/** Sets a session aside (out of the active ones until its next instruction), or brings it back. */
export function useSetCodeParked() {
  const t = useT(codeSessions);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { conversationId: string; id: string; parked: boolean }) => setCodeSessionParked(v.conversationId, v.id, v.parked),
    onSuccess: (s) => applyCodeSession(qc, s),
    meta: { success: (s: CodeSession) => (s.parked ? t.parkedNotice : t.unparkedNotice) },
  });
}

/** Sets this session's priority. */
export function useSetCodePriority(session: Pick<CodeSession, "id" | "conversationId">) {
  const set = useSetCodePriorityOf();
  return { ...set, mutate: (priority: CodePriority) => set.mutate({ conversationId: session.conversationId, id: session.id, priority }) };
}

/** The key that sets a priority, as in Linear (1 Urgent to 4 Low, 0 None), outside a text field. */
export function priorityOfKey(e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; target: EventTarget | null }) {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  const el = e.target as HTMLElement | null;
  if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return null;
  return CODE_PRIORITIES.find((p) => CODE_PRIORITY_KEYS[p] === e.key) ?? null;
}

/**
 * Figma « Menu de priorité »: the five priorities, their mark, the current one checked, their key. Under
 * them, setting the session aside (Linear's backlog) or bringing it back; not while it works.
 */
/** `park`: offer setting it aside here (the lists); the panel's header has it in its « … » menu instead. */
/** The priorities to pick from, for a menu that holds other things (the session's « … »). */
export function CodePriorityItems({ session }: { session: Pick<CodeSession, "id" | "conversationId" | "priority" | "parked" | "status" | "question" | "git"> }) {
  const t = useT(codeSessions);
  const set = useSetCodePriority(session);
  return (
    <DropdownMenuRadioGroup value={session.priority} onValueChange={(v) => set.mutate(v as CodePriority)}>
      {CODE_PRIORITIES.map((p) => (
        <DropdownMenuRadioItem key={p} value={p}>
          <CodePriorityIcon priority={p} showNone />
          {t.priorities[p]}
          <DropdownMenuShortcut>{CODE_PRIORITY_KEYS[p]}</DropdownMenuShortcut>
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}

export function CodePriorityMenu({ session, trigger, align = "end", park: withPark = true }: { session: Pick<CodeSession, "id" | "conversationId" | "priority" | "parked" | "status" | "question" | "git">; trigger: ReactElement; align?: "start" | "end"; park?: boolean }) {
  const t = useT(codeSessions);
  const set = useSetCodePriority(session);
  const park = useSetCodeParked();
  const state = codeSessionState(session);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align={align} className="w-56">
        <DropdownMenuRadioGroup value={session.priority} onValueChange={(v) => set.mutate(v as CodePriority)}>
          {CODE_PRIORITIES.map((p) => (
            <DropdownMenuRadioItem key={p} value={p}>
              <CodePriorityIcon priority={p} showNone />
              {t.priorities[p]}
              <DropdownMenuShortcut>{CODE_PRIORITY_KEYS[p]}</DropdownMenuShortcut>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {withPark && state !== "running" && state !== "waiting" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => park.mutate({ conversationId: session.conversationId, id: session.id, parked: !session.parked })}>
              <CodeStateIcon state={session.parked ? "idle" : "parked"} />
              {session.parked ? t.unpark : t.park}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * A session's « … » in the Sessions list, for its owner: its priority, set it aside or bring it back,
 * stop it while it works, delete it (after confirming).
 */
export function CodeSessionActionsMenu({ session }: { session: CodeSession }) {
  const t = useT(codeSessions);
  const qc = useQueryClient();
  const park = useSetCodeParked();
  const stop = useMutation({
    mutationFn: () => stopCodeSession(session.conversationId, session.id),
    onSuccess: (s) => applyCodeSession(qc, s),
    meta: { loading: t.stopping },
  });
  const remove = useMutation({
    mutationFn: () => deleteCodeSession(session.conversationId, session.id),
    onSuccess: () => dropCodeSession(qc, session.conversationId, session.id),
    meta: { loading: t.deleting, success: t.deleted },
  });
  const state = codeSessionState(session);
  const working = state === "running" || state === "waiting";
  const confirmDelete = async () => {
    if (await confirmAction({ title: t.deleteTitle(session.title), description: t.deleteHelp, action: t.deleteSession })) remove.mutate();
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" className="-mx-1" aria-label={t.actions} />}>
        <MoreIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <CodePriorityIcon priority={session.priority} showNone />
              {t.priority}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              <CodePriorityItems session={session} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {!working && (
            <DropdownMenuItem onClick={() => park.mutate({ conversationId: session.conversationId, id: session.id, parked: !session.parked })}>
              <CodeStateIcon state={session.parked ? "idle" : "parked"} />
              {session.parked ? t.unpark : t.park}
            </DropdownMenuItem>
          )}
          {working && (
            <DropdownMenuItem disabled={stop.isPending} onClick={() => stop.mutate()}>
              <CodeStateIcon state="stopped" />
              {stop.isPending ? t.stopping : t.stop}
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" disabled={remove.isPending} onClick={() => void confirmDelete()}>
          <TrashIcon />
          {t.deleteSession}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
