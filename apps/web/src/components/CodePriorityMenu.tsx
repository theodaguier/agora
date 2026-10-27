import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CODE_PRIORITIES, CODE_PRIORITY_KEYS, type CodePriority, type CodeSession } from "@agora/core";
import { codeSessions } from "@agora/core/i18n";
import type { ReactElement } from "react";
import { CodePriorityIcon } from "@/components/CodeSessionMarks";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuShortcut, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useT } from "@/i18n";
import { applyCodeSession, setCodeSessionPriority } from "@/lib/code-sessions";

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

/** Figma « Menu de priorité »: the five priorities, their mark, the current one checked, their key. */
export function CodePriorityMenu({ session, trigger, align = "end" }: { session: Pick<CodeSession, "id" | "conversationId" | "priority">; trigger: ReactElement; align?: "start" | "end" }) {
  const t = useT(codeSessions);
  const set = useSetCodePriority(session);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align={align} className="w-56">
        <DropdownMenuRadioGroup value={session.priority} onValueChange={(v) => set.mutate(v as CodePriority)}>
          {CODE_PRIORITIES.map((p) => (
            <DropdownMenuRadioItem key={p} value={p}>
              <CodePriorityIcon priority={p} />
              {t.priorities[p]}
              <DropdownMenuShortcut>{CODE_PRIORITY_KEYS[p]}</DropdownMenuShortcut>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
