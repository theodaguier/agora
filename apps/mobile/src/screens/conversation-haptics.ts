import { useEffect, useRef } from "react";
import { haptic } from "@/lib/haptics";
import { onTurnEvent } from "@/lib/realtime";
import type { Message } from "@/lib/types";

/** Least time between two haptic ticks while a reply streams in. */
const TICK_MS = 120;

/** What happens in an open thread, felt: the bots' replies as they go, and the other messages that land. */
export function useThreadHaptics(conversationId: string, messages: Message[], replying: boolean, me: string) {
  // A bot's reply is felt as it happens, while the thread is open: a tap when it starts, light
  // ticks as the text streams in (at most every TICK_MS), a tick per tool, a warning when it waits
  // for your approval, then success — or the error haptic when it fails.
  const turnEndedAt = useRef(0);
  useEffect(() => {
    let lastTick = 0;
    return onTurnEvent(conversationId, (ev) => {
      if (ev.type === "bot.started") haptic.tap();
      else if (ev.type === "bot.delta") {
        if (Date.now() - lastTick < TICK_MS) return;
        lastTick = Date.now();
        haptic.select();
      } else if (ev.type === "bot.tool") haptic.soft();
      else if (ev.type === "bot.approval") {
        if (ev.approval) haptic.warning();
      } else {
        turnEndedAt.current = Date.now();
        if (ev.type === "bot.done") haptic.success();
        else haptic.error();
      }
    });
  }, [conversationId]);

  // Any other message that lands while the thread is open is felt too: a colleague's, a bot's
  // outside a reply (a routine). Not the thread's first load, what you sent, nor the message a
  // reply ends with (its turn already said so).
  const lastId = messages.at(-1)?.id;
  const seenLast = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!lastId) return;
    const prev = seenLast.current;
    seenLast.current = lastId;
    const author = messages.at(-1)?.author;
    if (!prev || prev === lastId || (author?.kind === "user" && author.id === me)) return;
    if (author?.kind === "agent" && (replying || Date.now() - turnEndedAt.current < 3000)) return;
    haptic.soft();
  }, [lastId]); // eslint-disable-line react-hooks/exhaustive-deps
}
