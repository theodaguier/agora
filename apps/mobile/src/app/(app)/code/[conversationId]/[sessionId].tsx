import { useLocalSearchParams } from "expo-router";
import { CodeSessionScreen } from "@/screens/code-session";

/** A Claude Code session of a conversation, live (the web's side panel). */
export default function CodeSessionRoute() {
  const { conversationId, sessionId } = useLocalSearchParams<{ conversationId: string; sessionId: string }>();
  return <CodeSessionScreen key={sessionId} conversationId={conversationId} sessionId={sessionId} />;
}
