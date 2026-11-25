import { simple } from "@agora/core/i18n";
import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { Spinner } from "heroui-native";
import { useEffect, useRef } from "react";
import { View } from "react-native";
import { EmptyState } from "@/components/empty-state";
import { BotIcon } from "@/components/icons";
import { tr } from "@/lib/i18n";
import { conversationsQuery } from "@/lib/queries";
import { defaultAssistant, useAssistants, useNewChat } from "@/lib/simple";
import { Conversation } from "@/screens/conversation";

/*
 * Figma « Mode simple », 1 · Accueil: the simple interface opens on a chat with their assistant, every time.
 * The open chat is `?c=` (set by "New chat", the history, the assistant menu); without one, a new chat with
 * the assistant of the latest one (the API hands back the empty one from last time). What came meanwhile is
 * listed in it (components/simple/unread.tsx), and the menu button counts it.
 */
export function SimpleHome() {
  const { c } = useLocalSearchParams<{ c?: string }>();
  const agents = useAssistants();
  const chats = useQuery(conversationsQuery);
  const start = useNewChat();
  const asked = useRef(false);
  useEffect(() => {
    if (c || asked.current || !agents.data || !chats.data) return;
    const agentId = defaultAssistant(agents.data, chats.data);
    if (!agentId) return;
    asked.current = true;
    start.mutate(agentId);
  }, [c, agents.data, chats.data, start]);

  if (c) return <Conversation key={c} conversationId={c} simple />;
  return (
    <>
      <Stack.Screen options={{ title: "" }} />
      <View className="flex-1 items-center justify-center bg-background">
        {agents.data && agents.data.length === 0 ? <EmptyState icon={BotIcon} description={tr(simple).noAssistant} /> : <Spinner />}
      </View>
    </>
  );
}
