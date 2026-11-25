import { conversations, simple } from "@agora/core/i18n";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { ListGroup, Typography } from "heroui-native";
import { View } from "react-native";
import { PressableRow } from "@/components/admin/ui";
import { ColorDot } from "@/components/conversation-avatar";
import { conversationTitle } from "@/components/participants";
import { useMe } from "@/components/server-scope";
import { tr } from "@/lib/i18n";
import { conversationsQuery } from "@/lib/queries";
import type { ConversationSummary } from "@/lib/types";

/** Chats of the history with something unread (a routine's result, a colleague's assistant, an inbox item). */
export function useUnreadChats(except?: string) {
  return useQuery({
    ...conversationsQuery,
    select: (list: ConversationSummary[]) => list.filter((c) => c.kind === "direct" && c.unread && c.id !== except),
  }).data ?? [];
}

/**
 * Figma « Mode simple », 7 · Ouverture normale: opened without the notification, the new chat lists what
 * came meanwhile above the composer; one tap opens it, and once read it leaves the list.
 */
export function UnreadCard({ current }: { current: string }) {
  const t = tr(simple);
  const me = useMe();
  const unread = useUnreadChats(current);
  if (!unread.length) return null;
  return (
    <View className="mt-6 w-full gap-2">
      <Typography type="body-sm" color="muted" className="px-1">
        {t.newMessages(unread.length)}
      </Typography>
      <ListGroup>
        {unread.map((c) => {
          const name = conversationTitle(c, me.id);
          const preview = c.preview ? `${c.preview.author ? tr(conversations).prefix(c.preview.author) : ""}${c.preview.text}` : "";
          return (
            <PressableRow key={c.id} onPress={() => router.setParams({ c: c.id })} accessibilityLabel={`${name}, ${tr(conversations).unread}`}>
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle numberOfLines={1} className="font-semibold">
                  {name}
                </ListGroup.ItemTitle>
                {!!preview && <ListGroup.ItemDescription numberOfLines={1}>{preview}</ListGroup.ItemDescription>}
              </ListGroup.ItemContent>
              <ColorDot size={8} color="text-brand" />
            </PressableRow>
          );
        })}
      </ListGroup>
    </View>
  );
}
