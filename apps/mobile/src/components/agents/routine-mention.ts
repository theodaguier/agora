import type { Invocation } from "@/lib/types";

/*
 * "Mention in the conversation" of a routine (apps/web/src/components/RoutineDialog.tsx RoutineActions):
 * on the web the side panel sits next to the composer; on the phone the routine is on the bot's
 * profile, pushed over the conversation. The routine is handed to that conversation's composer,
 * which picks it up as soon as it's back on screen (or right away, since it stays mounted).
 */

const pending = new Map<string, Invocation>();
const listeners = new Set<() => void>();

/** Queues a chip for the composer of `conversationId`. */
export function mentionInComposer(conversationId: string, invocation: Invocation) {
  pending.set(conversationId, invocation);
  listeners.forEach((l) => l());
}

/** The composer of `conversationId` takes what's waiting for it, now and whenever something new comes. */
export function subscribeMentions(conversationId: string, take: (invocation: Invocation) => void) {
  const check = () => {
    const inv = pending.get(conversationId);
    if (!inv) return;
    pending.delete(conversationId);
    take(inv);
  };
  check();
  listeners.add(check);
  return () => {
    listeners.delete(check);
  };
}
