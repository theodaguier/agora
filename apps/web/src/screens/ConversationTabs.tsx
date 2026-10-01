import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams, useRouteContext } from "@tanstack/react-router";
import { ScreenPage } from "@/components/AgentScreen";
import { CodeSessionPage } from "@/components/CodeSession";
import { PreviewPage } from "@/components/Preview";
import { conversationTitle } from "@/lib/participants";
import { conversationQuery } from "@/lib/queries";

/**
 * What a conversation's side panel shows, at a URL of its own: on desktop the workspace opens these
 * in tabs; on a phone (or a link opened there) they take the screen, and closing goes back to the thread.
 */
function useBackToThread(conversationId: string) {
  const navigate = useNavigate();
  return () => navigate({ to: "/c/$conversationId", params: { conversationId } });
}

export function ScreenRoute() {
  const { conversationId } = useParams({ from: "/app/c/$conversationId/screen" });
  const { user } = useRouteContext({ from: "/app" });
  const { data: conv } = useQuery(conversationQuery(conversationId));
  return <ScreenPage conversationId={conversationId} title={conv ? conversationTitle(conv, user.id) : ""} onClose={useBackToThread(conversationId)} />;
}

export function CodeSessionRoute() {
  const { conversationId, sessionId } = useParams({ from: "/app/c/$conversationId/code/$sessionId" });
  const navigate = useNavigate();
  return (
    <CodeSessionPage
      conversationId={conversationId}
      sessionId={sessionId}
      onClose={useBackToThread(conversationId)}
      onStarted={(id) => navigate({ to: "/c/$conversationId/code/$sessionId", params: { conversationId, sessionId: id }, replace: true })}
    />
  );
}

export function PreviewRoute() {
  const { conversationId, previewKey } = useParams({ from: "/app/c/$conversationId/preview/$previewKey" });
  return <PreviewPage conversationId={conversationId} previewKey={previewKey} onClose={useBackToThread(conversationId)} />;
}
