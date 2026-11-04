import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { SCREEN_VIEWPORTS, type ScreenViewport } from "@agora/core";
import { common } from "@agora/core/i18n";
import { BrowserIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, RefreshIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api, conversationPath } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useTabPlace } from "@/lib/workspace";
import { defineMessages, useT } from "@/i18n";

const messages = defineMessages({
  en: {
    noScreen: "The agent isn't using a screen right now",
    asleep: "The computer is asleep",
    wake: "Click to wake it up",
    waking: "Waking up…",
    noBrowser: "No browser on this server to wake up.",
    screen: "Screen",
    screenOf: (name: string) => `${name}'s screen`,
    enlarge: "Enlarge",
    live: "Live view of the browser the agent drives.",
    watch: "Watch",
    takeControl: "Take control",
    release: "Release control",
    back: "Back",
    forward: "Forward",
    reload: "Reload",
    address: "Address",
    size: "Screen size",
    auto: "Auto",
    mobile: "Phone",
    tablet: "Tablet",
    desktop: "Computer",
  },
  fr: {
    noScreen: "L'agent n'utilise pas d'écran pour le moment",
    asleep: "L'ordinateur est en veille",
    wake: "Clique pour le réveiller",
    waking: "Réveil en cours…",
    noBrowser: "Aucun navigateur sur ce serveur pour le réveiller.",
    screen: "Écran",
    screenOf: (name: string) => `Écran de ${name}`,
    enlarge: "Agrandir",
    live: "Vue en direct du navigateur piloté par l'agent.",
    watch: "Observation",
    takeControl: "Prendre le contrôle",
    release: "Rendre la main",
    back: "Précédente",
    forward: "Suivante",
    reload: "Recharger",
    address: "Adresse",
    size: "Taille de l'écran",
    auto: "Auto",
    mobile: "Mobile",
    tablet: "Tablette",
    desktop: "Ordinateur",
  },
});

type Frame = { data: string; url: string; width: number; height: number };

type ScreenInput =
  | { type: "click"; x: number; y: number }
  | { type: "wheel"; x: number; y: number; dx: number; dy: number }
  | { type: "key"; key: string; code: string; keyCode: number; modifiers: number }
  | { type: "text"; text: string }
  | { type: "navigate"; url: string }
  | { type: "back" | "forward" | "reload" }
  | { type: "viewport"; viewport: ScreenViewport };

const visible = () => document.visibilityState === "visible";

/** Sends what the member does to the browser (ignored when it closed in between). */
const act = (conversationId: string, input: ScreenInput) =>
  void api(conversationPath(conversationId, "/screen/input"), { method: "POST", body: JSON.stringify(input) }).catch(() => {});

/**
 * The agent's browser, live, and the size its viewers chose. The stream is only open while this
 * component is on screen (its workspace tab in front, the browser tab visible): that is what makes
 * the API watch the browser.
 */
function useAgentScreen(conversationId: string) {
  const [frame, setFrame] = useState<Frame | null>(null);
  const [viewport, setViewport] = useState<ScreenViewport>("auto");
  const [pageShown, setShown] = useState(visible);
  const place = useTabPlace();
  const shown = pageShown && place.visible;

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
      const state = read(e);
      if (!state?.live) setFrame(null);
      if (state?.viewport) setViewport(state.viewport);
    });
    return () => {
      source.close();
      setFrame(null);
    };
  }, [conversationId, shown]);

  return { frame, viewport };
}

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
      <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label={label} onClick={onClick} />}>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The live image. As a thumbnail (`onEnlarge`), only the picture: a click opens it. Full size, the page
 * fitted in all the space given and, for an admin, one switch under it between watching and taking
 * control: then clicks, scrolling, keys and pastes on the image go to the page, and the address, history
 * and screen size show above it.
 */
function ScreenView({
  conversationId,
  frame,
  viewport,
  canControl,
  onEnlarge,
}: {
  conversationId: string;
  frame: Frame;
  viewport: ScreenViewport;
  canControl: boolean;
  onEnlarge?: () => void;
}) {
  const t = useT(messages);
  const full = !onEnlarge;
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

  const surfaceView = (
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
        "outline-none",
        full ? "relative min-h-0 flex-1" : "cursor-zoom-in overflow-hidden rounded-xl border focus-visible:ring-3 focus-visible:ring-ring/50",
      )}
    >
      <img
        ref={img}
        src={`data:image/jpeg;base64,${frame.data}`}
        alt=""
        draggable={false}
        width={frame.width || undefined}
        height={frame.height || undefined}
        className={cn("block select-none", full ? "absolute inset-0 size-full object-contain" : "h-auto w-full")}
      />
    </div>
  );
  if (!full) return surfaceView;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {controlling && (
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
            className="min-w-0 flex-1"
          />
          <ToggleGroup
            aria-label={t.size}
            value={[viewport]}
            onValueChange={(v) => v[0] && v[0] !== viewport && send({ type: "viewport", viewport: v[0] as ScreenViewport })}
            variant="outline"
            spacing={0}
          >
            {SCREEN_VIEWPORTS.map((v) => (
              <ToggleGroupItem key={v} value={v}>
                {t[v]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </form>
      )}

      {surfaceView}

      {canControl && (
        <ToggleGroup
          aria-label={t.screen}
          value={[controlling ? "control" : "watch"]}
          onValueChange={(v) => v[0] && setControlling(v[0] === "control")}
          variant="outline"
          spacing={0}
          className="self-center"
        >
          <ToggleGroupItem value="watch">{t.watch}</ToggleGroupItem>
          <ToggleGroupItem value="control">{t.takeControl}</ToggleGroupItem>
        </ToggleGroup>
      )}
    </div>
  );
}

/**
 * `agentName`: the bot of a direct conversation; without it, the conversation's screen (any of its bots or sessions).
 * `mascotSrc` / `waking`: no screen yet, a framed space with the bot's mascot, asleep or waking up (as it works),
 * and the screen's name under it; without them, one grey line.
 */
export function AgentScreen({ conversationId, agentName, mascotSrc, waking }: { conversationId: string; agentName?: string; mascotSrc?: string; waking?: boolean }) {
  const t = useT(messages);
  const { user } = useRouteContext({ from: "/app" });
  // The browser reaches the server's own network: only admins drive it (as the API checks).
  const canControl = user.role === "admin";
  const { frame, viewport } = useAgentScreen(conversationId);
  const [enlarged, setEnlarged] = useState(false);
  const wake = useMutation({
    mutationFn: () => api(conversationPath(conversationId, "/screen/wake"), { method: "POST" }),
    meta: { error: false },
  });
  // The browser closed while enlarged: don't reopen on the next session.
  if (!frame && enlarged) setEnlarged(false);

  return (
    <>
      {frame ? (
        <ScreenView conversationId={conversationId} frame={frame} viewport={viewport} canControl={canControl} onEnlarge={() => setEnlarged(true)} />
      ) : mascotSrc ? (
        <div className="flex flex-col gap-2">
          {/* Asleep: a click wakes it (a blank browser of the conversation), then the screen shows as soon as it runs. */}
          <button
            type="button"
            disabled={waking || wake.isPending || wake.isSuccess}
            onClick={() => wake.mutate()}
            className="flex aspect-[16/10] flex-col items-center justify-center gap-1 rounded-xl border bg-muted transition-colors outline-none enabled:hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <img src={mascotSrc} alt="" draggable={false} className={cn("mb-1 size-12 object-contain", !(waking || wake.isPending || wake.isSuccess) && "opacity-60 grayscale")} />
            {waking || wake.isPending || wake.isSuccess ? (
              <span className="text-sm text-muted-foreground">{t.waking}</span>
            ) : (
              <>
                <span className="text-sm font-medium">{t.asleep}</span>
                <span className="text-sm text-muted-foreground">{wake.isError ? t.noBrowser : t.wake}</span>
              </>
            )}
          </button>
        </div>
      ) : (
        // No screen: one line, not an empty frame reserving the space.
        <p className="text-sm text-muted-foreground">{t.noScreen}.</p>
      )}

      {/* The whole window for the screen alone, as on a remote desktop. */}
      <Dialog open={enlarged && !!frame} onOpenChange={setEnlarged}>
        <DialogContent finalFocus={false} className="flex h-dvh w-screen max-w-none flex-col rounded-none p-4 pt-12 sm:max-w-none">
          <DialogTitle className="sr-only">{agentName ? t.screenOf(agentName) : t.screen}</DialogTitle>
          <DialogDescription className="sr-only">{t.live}</DialogDescription>
          {frame && <ScreenView conversationId={conversationId} frame={frame} viewport={viewport} canControl={canControl} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The screen as a workspace tab: the whole pane for the page, at the size chosen. */
export function ScreenPage({ conversationId, title, onClose }: { conversationId: string; title: string; onClose?: () => void }) {
  const t = useT(messages);
  const c = useT(common);
  const { user } = useRouteContext({ from: "/app" });
  const { frame, viewport } = useAgentScreen(conversationId);
  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <h2 className="shrink-0 text-sm font-medium">{t.screen}</h2>
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{title}</span>
        {onClose && (
          <Button variant="ghost" size="icon" aria-label={c.close} onClick={onClose}>
            <CloseIcon />
          </Button>
        )}
      </header>
      <div className="flex min-h-0 flex-1 flex-col p-3">
        {frame ? (
          <ScreenView conversationId={conversationId} frame={frame} viewport={viewport} canControl={user.role === "admin"} />
        ) : (
          <Empty className="flex-1">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BrowserIcon />
              </EmptyMedia>
              <EmptyTitle>{t.noScreen}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </section>
  );
}
