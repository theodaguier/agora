import { toast } from "sonner";
import { codeSessionState, type CodeSession, type CodeSessionState } from "@agora/core";
import { codeSessions } from "@agora/core/i18n";
import { AgentAvatar } from "@/components/AgentAvatar";
import { CodeStateIcon } from "@/components/CodeSessionMarks";
import { tr } from "@/i18n";
import type { Author, Message } from "./api";
import { sideOf, updateSide } from "./conversation-side";

/**
 * Figma « Toast » (Desktop 11): what happens away from your eyes comes to you. A code session of yours
 * waits for you, is done, merged or failed; a bot answers you in another conversation. Same toast for
 * both: its mark, who and what, one action. Nothing for what is already on screen.
 */

const conversationOnScreen = (conversationId: string) => !document.hidden && window.location.pathname === `/c/${conversationId}`;

const sessionOnScreen = (s: Pick<CodeSession, "id" | "conversationId">) => conversationOnScreen(s.conversationId) && sideOf(s.conversationId).codeSession === s.id;

async function go(conversationId: string) {
  const { router } = await import("@/router");
  void router.navigate({ to: "/c/$conversationId", params: { conversationId } });
}

/** Opens a session beside its conversation's thread, as its row in Sessions does. */
export function openCodeSession(s: Pick<CodeSession, "id" | "conversationId">) {
  updateSide(s.conversationId, (side) => ({ ...side, panel: null, previewKey: null, codeTabs: side.codeTabs.includes(s.id) ? side.codeTabs : [...side.codeTabs, s.id], codeSession: s.id }));
  void go(s.conversationId);
}

const TOLD: CodeSessionState[] = ["waiting", "finished", "merged", "failed"];

/** A session of yours reached a state worth telling (from another one): its toast, unless it is on screen. */
export function notifyCodeSession(session: CodeSession, before: CodeSessionState | undefined) {
  const state = codeSessionState(session);
  if (!before || state === before || !TOLD.includes(state) || sessionOnScreen(session)) return;
  const t = tr(codeSessions);
  const title = { waiting: t.notify.waiting, finished: t.notify.finished, merged: t.notify.merged, failed: t.notify.failed }[state as "waiting" | "finished" | "merged" | "failed"](session.title);
  const description = state === "waiting" ? (session.question?.text ?? session.approval?.title) : (session.result?.split("\n", 1)[0] ?? undefined);
  toast(title, {
    id: `code:${session.id}`,
    description: description && description.length > 140 ? `${description.slice(0, 139)}…` : description,
    icon: <CodeStateIcon state={state} />,
    duration: state === "waiting" ? 12_000 : 6_000,
    action: { label: state === "waiting" ? t.notify.reply : t.notify.open, onClick: () => openCodeSession(session) },
  });
}

/** A bot's message for you, in a conversation you are not looking at: its toast. */
export function notifyBotMessage(conversationId: string, message: Message) {
  const author = message.author as Author;
  if (author?.kind !== "agent" || message.kind !== "bot" || !message.text.trim() || conversationOnScreen(conversationId)) return;
  const text = message.text.replace(/\s+/g, " ").trim();
  toast(author.name, {
    id: `message:${message.id}`,
    description: text.length > 140 ? `${text.slice(0, 139)}…` : text,
    icon: <AgentAvatar agent={author} className="size-5" />,
    action: { label: tr(codeSessions).notify.open, onClick: () => void go(conversationId) },
  });
}
