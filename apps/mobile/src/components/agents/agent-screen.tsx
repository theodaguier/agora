import { fetch } from "expo/fetch";
import { Image } from "expo-image";
import { Surface, Typography } from "heroui-native";
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { apiUrl, authHeaders, conversationPath } from "@/lib/api";
import { defineMessages } from "@/lib/i18n";

/* apps/web/src/components/AgentScreen.tsx */

const messages = defineMessages({
  en: {
    noScreen: "The agent isn't using a screen right now",
    screenOf: (name: string) => `${name}'s screen`,
  },
  fr: {
    noScreen: "L'agent n'utilise pas d'écran pour le moment",
    screenOf: (name: string) => `Écran de ${name}`,
  },
});

type Frame = { data: string; url: string; width: number; height: number };

/** Reads the browser's SSE stream until it ends or `signal` aborts: each frame, or null once it stops being live. */
async function streamScreen(conversationId: string, signal: AbortSignal, onFrame: (frame: Frame | null) => void) {
  const res = await fetch(apiUrl(conversationPath(conversationId, "/screen")), {
    headers: { Accept: "text/event-stream", ...authHeaders() },
    signal,
  });
  if (!res.ok || !res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let end: number;
    while ((end = buffer.search(/\r?\n\r?\n/)) >= 0) {
      const chunk = buffer.slice(0, end);
      buffer = buffer.slice(end).replace(/^\r?\n\r?\n/, "");
      let type = "message";
      const data: string[] = [];
      for (const line of chunk.split(/\r?\n/)) {
        if (line.startsWith("event:")) type = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      // A frame read just before the stream was closed belongs to the previous conversation.
      if (signal.aborted) return;
      try {
        if (type === "frame") onFrame(JSON.parse(data.join("\n")));
        else if (type === "state" && !JSON.parse(data.join("\n")).live) onFrame(null);
      } catch {}
    }
  }
}

/**
 * The agent's browser, live. The stream is only open while this is mounted and the app is in
 * the foreground: that is what makes the API watch the browser. React Native has no EventSource:
 * the SSE stream is read with expo/fetch, the session in a header.
 */
function useAgentScreen(conversationId: string) {
  const [frame, setFrame] = useState<Frame | null>(null);
  const [active, setActive] = useState(AppState.currentState === "active");

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setActive(s === "active"));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    streamScreen(conversationId, controller.signal, setFrame).catch(() => {});
    return () => {
      controller.abort();
      setFrame(null);
    };
  }, [conversationId, active]);

  return frame;
}

const host = (url: string) => /^[a-z]+:\/\/([^/?#]+)/i.exec(url)?.[1] ?? url;

export function AgentScreen({ conversationId, agentName }: { conversationId: string; agentName: string }) {
  const frame = useAgentScreen(conversationId);
  return (
    <>
      <Surface className="overflow-hidden p-0">
        {frame ? (
          <Image
            source={{ uri: `data:image/jpeg;base64,${frame.data}` }}
            style={{ width: "100%", aspectRatio: frame.width && frame.height ? frame.width / frame.height : 16 / 10 }}
            contentFit="contain"
 />
        ) : (
          <Typography type="body-sm" color="muted" align="center" className="px-6 py-12">
            {messages.noScreen}
          </Typography>
        )}
      </Surface>
      <Typography type="body-xs" color="muted" align="center" className="px-4" truncate>
        {frame?.url ? host(frame.url) : messages.screenOf(agentName)}
      </Typography>
    </>
  );
}
