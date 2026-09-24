import { useLocalSearchParams } from "expo-router";
import { Conversation } from "@/screens/conversation";

/** `m`: a message to open the thread on (a notification, the inbox), as on the web. */
export default function ConversationRoute() {
  const { conversationId, m } = useLocalSearchParams<{ conversationId: string; m?: string }>();
  return <Conversation key={conversationId} conversationId={conversationId} focus={m} />;
}
