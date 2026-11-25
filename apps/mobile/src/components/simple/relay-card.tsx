import type { InboxRelay } from "@agora/core";
import { simple } from "@agora/core/i18n";
import { router } from "expo-router";
import { Card, PressableFeedback } from "heroui-native";
import { View } from "react-native";
import { withTap } from "@/lib/haptics";
import { tr } from "@/lib/i18n";

/*
 * Figma « Mode simple », 7 · Demande d'un collègue: what landed in their inbox, quoted under their
 * assistant's line (« Chloé t'a écrit dans … : »). A tap opens it where it was said, or the task.
 */
export function RelayCard({ relay }: { relay: InboxRelay }) {
  const open = () => {
    if (relay.taskId) router.push({ pathname: "/task/[taskId]", params: { taskId: relay.taskId } });
    else if (relay.conversationId)
      router.push({ pathname: "/c/[conversationId]", params: { conversationId: relay.conversationId, ...(relay.messageId && { m: relay.messageId }) } });
  };
  return (
    <PressableFeedback onPress={withTap(open)} accessibilityRole="button" accessibilityLabel={`${tr(simple).open}: ${relay.text}`} className="mt-2 w-full">
      <Card className="rounded-[14px] border border-border bg-background p-3">
        <PressableFeedback.Highlight />
        <Card.Body className="flex-row gap-3">
          <View className="w-[3px] self-stretch rounded-full bg-border" />
          <Card.Description numberOfLines={6} className="min-w-0 flex-1 text-sm text-foreground">
            {relay.text}
          </Card.Description>
        </Card.Body>
      </Card>
    </PressableFeedback>
  );
}
