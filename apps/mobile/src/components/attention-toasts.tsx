import { codeSessions } from "@agora/core/i18n";
import { router, usePathname } from "expo-router";
import { useToast } from "heroui-native";
import { useEffect, useRef } from "react";
import { AgentAvatar } from "@/components/agent-avatar";
import { codeSessionHref } from "@/components/code-session";
import { CodeStateIcon } from "@/components/code-session-marks";
import { tr } from "@/lib/i18n";
import { onAttention, type AttentionEvent } from "@/lib/realtime";

/*
 * apps/web/src/lib/attention.tsx: what happens away from your eyes comes to you as a toast (Figma
 * « Toast »). A code session of yours waits for you, is done, merged or failed; a bot answers you in
 * another conversation. Its mark, who and what, one action. Nothing for what is on screen.
 * Mounted once in the signed-in layout, under HeroUINativeProvider (its toast host).
 */

const cut = (text: string | null | undefined) => {
  const line = text?.replace(/\s+/g, " ").trim();
  return line && line.length > 140 ? `${line.slice(0, 139)}…` : line || undefined;
};

export function AttentionToasts() {
  const { toast } = useToast();
  const pathname = usePathname();
  // Read when an event comes, not when the listener was set.
  const where = useRef(pathname);
  useEffect(() => {
    where.current = pathname;
  }, [pathname]);

  useEffect(
    () =>
      onAttention((ev: AttentionEvent) => {
        const t = tr(codeSessions);
        if (ev.kind === "code") {
          const s = ev.session;
          if (where.current === `/code/${s.conversationId}/${s.id}`) return;
          const waiting = ev.state === "waiting";
          toast.show({
            id: `code:${s.id}`,
            label: t.notify[ev.state](s.title),
            description: cut(waiting ? (s.question?.text ?? s.approval?.title) : s.result?.split("\n", 1)[0]),
            icon: <CodeStateIcon state={ev.state} />,
            duration: waiting ? 12_000 : 6_000,
            actionLabel: waiting ? t.notify.reply : t.notify.open,
            onActionPress: ({ hide }) => {
              hide();
              router.push(codeSessionHref(s.conversationId, s.id));
            },
          });
          return;
        }
        const { conversationId, message } = ev;
        const author = message.author;
        if (author?.kind !== "agent" || !message.text.trim() || where.current === `/c/${conversationId}`) return;
        toast.show({
          id: `message:${message.id}`,
          label: author.name,
          description: cut(message.text),
          icon: <AgentAvatar agent={author} size={20} />,
          actionLabel: t.notify.open,
          onActionPress: ({ hide }) => {
            hide();
            router.push({ pathname: "/c/[conversationId]", params: { conversationId } });
          },
        });
      }),
    [toast],
  );
  return null;
}
