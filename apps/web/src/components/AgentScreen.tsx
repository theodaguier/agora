import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { useRouteContext } from "@tanstack/react-router";
import { ChevronLeftIcon, ChevronRightIcon, RefreshIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api, conversationPath } from "@/lib/api";
import { cn } from "@/lib/utils";
import { defineMessages, useT } from "@/i18n";

const messages = defineMessages({
  en: {
    noScreen: "The agent isn't using a screen right now",
    screen: "Screen",
    screenOf: (name: string) => `${name}'s screen`,
    enlarge: "Enlarge",
    live: "Live view of the browser the agent drives.",
    takeControl: "Take control",
    release: "Release control",
    back: "Back",
    forward: "Forward",
    reload: "Reload",
    address: "Address",
  },
  fr: {
    noScreen: "L'agent n'utilise pas d'écran pour le moment",
    screen: "Écran",
    screenOf: (name: string) => `Écran de ${name}`,
    enlarge: "Agrandir",
    live: "Vue en direct du navigateur piloté par l'agent.",
    takeControl: "Prendre la main",
    release: "Rendre la main",
    back: "Précédente",
    forward: "Suivante",
    reload: "Recharger",
    address: "Adresse",
  },
});

type Frame = { data: string; url: string; width: number; height: number };

type ScreenInput =
  | { type: "click"; x: number; y: number }
  | { type: "wheel"; x: number; y: number; dx: number; dy: number }
  | { type: "key"; key: string; code: string; keyCode: number; modifiers: number }
  | { type: "text"; text: string }
  | { type: "navigate"; url: string }
  | { type: "back" | "forward" | "reload" };

const visible = () => document.visibilityState === "visible";

/** Sends what the member does to the browser (ignored when it closed in between). */
const act = (conversationId: string, input: ScreenInput) =>
  void api(conversationPath(conversationId, "/screen/input"), { method: "POST", body: JSON.stringify(input) }).catch(() => {});

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

/** What was typed in the address field: a scheme is added (http for this machine, https otherwise). */
const toUrl = (typed: string) => {
  const value = typed.trim();
  if (/^https?:\/\//i.test(value)) return value;
  return /^(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(value) ? `http://${value}` : `https://${value}`;
};

/** Modifier bits of the DevTools protocol: Alt 1, Ctrl 2, Meta 4, Shift 8. */
const modifiers = (e: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) =>
  (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0);

/** Where a point of the image falls on the page, as fractions; the image is contained (letterboxed) in its box. */
function pagePoint(img: HTMLImageElement, frame: Frame, clientX: number, clientY: number) {
  const box = img.getBoundingClientRect();
  const ratio = frame.width && frame.height ? frame.width / frame.height : box.width / box.height;
  const width = Math.min(box.width, box.height * ratio);
  const height = width / ratio;
  const x = (clientX - box.left - (box.width - width) / 2) / width;
  const y = (clientY - box.top - (box.height - height) / 2) / height;
  return x < 0 || x > 1 || y < 0 || y > 1 ? null : { x, y };
}

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick} className="rounded-lg" />}>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The live image and, for an admin, its controls: history, address, and taking control, where clicks,
 * scrolling, keys and pastes on the image go to the page. `fill`: the image takes all the height given.
 */
function ScreenView({
  conversationId,
  frame,
  canControl,
  fill,
  onEnlarge,
}: {
  conversationId: string;
  frame: Frame;
  canControl: boolean;
  fill?: boolean;
  onEnlarge?: () => void;
}) {
  const t = useT(messages);
  const [controlling, setControlling] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const img = useRef<HTMLImageElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const frameRef = useRef(frame);
  frameRef.current = frame;

  const send = (input: ScreenInput) => act(conversationId, input);

  // Scrolling: native listener (React's is passive, the panel would scroll too), deltas sent at most every 60 ms.
  useEffect(() => {
    const el = surface.current;
    if (!controlling || !el) return;
    let pending: { x: number; y: number; dx: number; dy: number } | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onWheel = (e: WheelEvent) => {
      if (!img.current) return;
      const point = pagePoint(img.current, frameRef.current, e.clientX, e.clientY);
      if (!point) return;
      e.preventDefault();
      const scale = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1;
      pending = { ...point, dx: (pending?.dx ?? 0) + e.deltaX * scale, dy: (pending?.dy ?? 0) + e.deltaY * scale };
      timer ??= setTimeout(() => {
        timer = null;
        if (pending) act(conversationId, { type: "wheel", ...pending });
        pending = null;
      }, 60);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (timer) clearTimeout(timer);
    };
  }, [controlling, conversationId]);

  useEffect(() => {
    if (controlling) surface.current?.focus();
  }, [controlling]);

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!controlling) return onEnlarge?.();
    if (!img.current) return;
    const point = pagePoint(img.current, frame, e.clientX, e.clientY);
    if (point) send({ type: "click", ...point });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!controlling) {
      if ((e.key === "Enter" || e.key === " ") && onEnlarge) {
        e.preventDefault();
        onEnlarge();
      }
      return;
    }
    if (e.nativeEvent.isComposing) return;
    // Pasting goes through the paste event, with the clipboard's text.
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v") return;
    if (e.key === "Escape") return;
    e.preventDefault();
    send({ type: "key", key: e.key, code: e.code, keyCode: e.keyCode, modifiers: modifiers(e) });
  };

  const src = `data:image/jpeg;base64,${frame.data}`;

  return (
    <div className={cn("flex flex-col gap-2", fill && "min-h-0 flex-1")}>
      {canControl && (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft?.trim()) send({ type: "navigate", url: toUrl(draft) });
            setDraft(null);
            (document.activeElement as HTMLElement | null)?.blur();
          }}
        >
          <IconAction label={t.back} onClick={() => send({ type: "back" })}>
            <ChevronLeftIcon />
          </IconAction>
          <IconAction label={t.forward} onClick={() => send({ type: "forward" })}>
            <ChevronRightIcon />
          </IconAction>
          <IconAction label={t.reload} onClick={() => send({ type: "reload" })}>
            <RefreshIcon />
          </IconAction>
          <Input
            aria-label={t.address}
            value={draft ?? frame.url}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => {
              setDraft(frame.url);
              e.currentTarget.select();
            }}
            onBlur={() => setDraft(null)}
            onKeyDown={(e) => e.key === "Escape" && e.currentTarget.blur()}
            className="h-7 min-w-0 flex-1 rounded-lg text-[13px] md:text-[13px]"
          />
        </form>
      )}

      <div
        ref={surface}
        role={controlling ? "application" : onEnlarge ? "button" : undefined}
        tabIndex={controlling || onEnlarge ? 0 : undefined}
        aria-label={controlling ? t.release : onEnlarge ? t.enlarge : undefined}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onPaste={(e) => {
          if (!controlling) return;
          const text = e.clipboardData.getData("text");
          e.preventDefault();
          if (text) send({ type: "text", text });
        }}
        className={cn(
          "overflow-hidden rounded-lg border border-border bg-background outline-none focus-visible:ring-2 focus-visible:ring-ring",
          fill && "relative min-h-0 flex-1 border-transparent bg-transparent",
          controlling ? "cursor-default ring-2 ring-primary focus-visible:ring-primary" : onEnlarge && "cursor-zoom-in",
        )}
      >
        <img
          ref={img}
          src={src}
          alt=""
          draggable={false}
          width={frame.width || undefined}
          height={frame.height || undefined}
          className={cn("block select-none", fill ? "absolute inset-0 size-full object-contain" : "h-auto w-full")}
        />
      </div>

      {canControl ? (
        <div className="flex items-center justify-end gap-2">
          {onEnlarge && (
            <Button variant="outline" size="sm" onClick={onEnlarge}>
              {t.enlarge}
            </Button>
          )}
          <Button variant={controlling ? "default" : "outline"} size="sm" onClick={() => setControlling((c) => !c)}>
            {controlling ? t.release : t.takeControl}
          </Button>
        </div>
      ) : (
        !fill && (
          <p className="truncate text-center text-[13px] text-muted-foreground" title={frame.url}>
            {host(frame.url)}
          </p>
        )
      )}
    </div>
  );
}

/** `agentName`: the bot of a direct conversation; without it, the conversation's screen (any of its bots or sessions). */
export function AgentScreen({ conversationId, agentName }: { conversationId: string; agentName?: string }) {
  const t = useT(messages);
  const { user } = useRouteContext({ from: "/app" });
  // The browser reaches the server's own network: only admins drive it (as the API checks).
  const canControl = user.role === "admin";
  const frame = useAgentScreen(conversationId);
  const [enlarged, setEnlarged] = useState(false);
  // The browser closed while enlarged: don't reopen on the next session.
  if (!frame && enlarged) setEnlarged(false);

  return (
    <>
      {frame ? (
        <ScreenView conversationId={conversationId} frame={frame} canControl={canControl} onEnlarge={() => setEnlarged(true)} />
      ) : (
        <>
          <Empty className="aspect-[16/10] gap-2 rounded-lg border border-solid border-border bg-background/60 p-4">
            <EmptyHeader>
              <EmptyDescription>{t.noScreen}</EmptyDescription>
            </EmptyHeader>
          </Empty>
          {agentName && <p className="mt-2 truncate text-center text-[13px] text-muted-foreground">{t.screenOf(agentName)}</p>}
        </>
      )}

      {/* The whole window, the page fitted in it. */}
      <Dialog open={enlarged && !!frame} onOpenChange={setEnlarged}>
        <DialogContent className="flex h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-none flex-col gap-3 sm:max-w-none">
          <DialogHeader className="pr-8">
            <DialogTitle>{agentName ? t.screenOf(agentName) : t.screen}</DialogTitle>
            <DialogDescription className="truncate">{canControl ? t.live : frame?.url || t.live}</DialogDescription>
          </DialogHeader>
          {frame && <ScreenView conversationId={conversationId} frame={frame} canControl={canControl} fill />}
        </DialogContent>
      </Dialog>
    </>
  );
}
