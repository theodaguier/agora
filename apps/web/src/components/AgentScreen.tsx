import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { defineMessages, useT } from "@/i18n";

const messages = defineMessages({
  en: {
    noScreen: "The agent isn't using a screen right now",
    screenOf: (name: string) => `${name}'s screen`,
    enlarge: "Enlarge the screen",
    live: "Live view of the browser the agent drives.",
  },
  fr: {
    noScreen: "L'agent n'utilise pas d'écran pour le moment",
    screenOf: (name: string) => `Écran de ${name}`,
    enlarge: "Agrandir l'écran",
    live: "Vue en direct du navigateur piloté par l'agent.",
  },
});

type Frame = { data: string; url: string; width: number; height: number };

const visible = () => document.visibilityState === "visible";

/**
 * The agent's browser, live. The stream is only open while this component is
 * mounted and the tab is visible: that is what makes the API watch the browser.
 */
function useAgentScreen(conversationId: string) {
  const [frame, setFrame] = useState<Frame | null>(null);
  const [shown, setShown] = useState(visible);

  useEffect(() => {
    const onChange = () => setShown(visible());
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  useEffect(() => {
    if (!shown) return;
    const source = new EventSource(`/api/conversations/${conversationId}/screen`, { withCredentials: true });
    const read = (e: Event) => {
      try {
        return JSON.parse((e as MessageEvent<string>).data);
      } catch {
        return null;
      }
    };
    source.addEventListener("frame", (e) => {
      const frame = read(e);
      if (frame) setFrame(frame);
    });
    source.addEventListener("state", (e) => {
      if (!read(e)?.live) setFrame(null);
    });
    return () => {
      source.close();
      setFrame(null);
    };
  }, [conversationId, shown]);

  return frame;
}

const host = (url: string) => {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
};

export function AgentScreen({ conversationId, agentName }: { conversationId: string; agentName: string }) {
  const t = useT(messages);
  const frame = useAgentScreen(conversationId);
  const [enlarged, setEnlarged] = useState(false);
  const src = frame && `data:image/jpeg;base64,${frame.data}`;
  // The browser closed while enlarged: don't reopen on the next session.
  if (!src && enlarged) setEnlarged(false);

  return (
    <>
      {src ? (
        <button
          type="button"
          aria-label={t.enlarge}
          onClick={() => setEnlarged(true)}
          className="block w-full cursor-zoom-in overflow-hidden rounded-lg border border-border bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <img src={src} alt="" width={frame.width || undefined} height={frame.height || undefined} className="block h-auto w-full" />
        </button>
      ) : (
        <Empty className="aspect-[16/10] gap-2 rounded-lg border border-solid border-border bg-background/60 p-4">
          <EmptyHeader>
            <EmptyDescription>{t.noScreen}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      <p className="mt-2 truncate text-center text-[13px] text-muted-foreground" title={frame?.url}>
        {frame?.url ? host(frame.url) : t.screenOf(agentName)}
      </p>

      <Dialog open={enlarged && !!src} onOpenChange={setEnlarged}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{t.screenOf(agentName)}</DialogTitle>
            <DialogDescription className="truncate">{frame?.url || t.live}</DialogDescription>
          </DialogHeader>
          {src && <img src={src} alt="" className="block h-auto w-full rounded-md border border-border" />}
        </DialogContent>
      </Dialog>
    </>
  );
}
