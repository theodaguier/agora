import { useQuery } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { previewFileName, readPreviews, SCREEN_DEVICES, withArtifactKit, type PreviewRef, type ScreenDevice } from "@agora/core";
import { useIsDark } from "@/lib/theme";
import { common } from "@agora/core/i18n";
import { useWide } from "@/components/CodeSession";
import { ArtifactShareMenu, ArtifactVersionMenu } from "@/components/ArtifactShare";
import { BesideButton } from "@/components/BesideButton";
import { PaneHeader } from "@/components/PaneHeader";
import { CloseIcon, FileCodeIcon, WarningIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { defineMessages, useT } from "@/i18n";
import { attachmentUrl, type ActiveTurn, type Message } from "@/lib/api";
import { artifactContentUrl, artifactQuery } from "@/lib/artifacts";
import { messagesQuery } from "@/lib/queries";
import { useTurns } from "@/lib/realtime";
import { cn } from "@/lib/utils";

const messages = defineMessages({
  en: {
    mockup: "HTML mockup",
    artifact: "Artifact",
    versioned: (n: number) => `Artifact · v${n}`,
    untitled: "Mockup",
    writing: "Being written…",
    ready: "Ready",
    follow: "Follow",
    open: "Open",
    download: "Download",
    enlarge: "Enlarge",
    width: "Preview width",
    mobile: "Phone",
    tablet: "Tablet",
    desktop: "Computer",
    missing: "This mockup is no longer available.",
    missingTitle: "Mockup not found",
    unreachableTitle: "Mockup unreachable",
    unreachable: "It couldn't be loaded for now. Try again in a moment.",
    sandboxed: "Rendered without scripts; links don't leave the preview.",
  },
  fr: {
    mockup: "Maquette HTML",
    artifact: "Artefact",
    versioned: (n: number) => `Artefact · v${n}`,
    untitled: "Maquette",
    writing: "En cours d'écriture…",
    ready: "Prête",
    follow: "Suivre",
    open: "Ouvrir",
    download: "Télécharger",
    enlarge: "Agrandir",
    width: "Largeur de l'aperçu",
    mobile: "Mobile",
    tablet: "Tablette",
    desktop: "Ordinateur",
    missing: "Cette maquette n'est plus disponible.",
    missingTitle: "Maquette introuvable",
    unreachableTitle: "Maquette injoignable",
    unreachable: "Elle n'a pas pu être chargée pour le moment. Réessaie dans un instant.",
    sandboxed: "Affichée sans scripts ; les liens ne quittent pas l'aperçu.",
  },
});

/** Where a mockup is read from: the reply being written, or the file its saved message keeps. */
export type PreviewSource = { title: string; writing: boolean } & ({ html: string } | { id: string; artifactId?: string; version?: number });

/** The mockup `<turnId>:<index>`: in its live reply while there is one, then in the saved message. */
export function findPreview(key: string, turns: ActiveTurn[], thread: Message[]): PreviewSource | null {
  const [turnId, index] = key.split(":");
  const turn = turns.find((t) => t.turnId === turnId);
  const live = turn && readPreviews(turn.text)[Number(index)];
  if (live) return { title: live.title, html: live.html, writing: !live.done };
  for (let i = thread.length - 1; i >= 0; i--) {
    const ref = thread[i]!.data?.previews?.find((p) => p.key === key);
    if (ref) return { title: ref.title, id: ref.id, artifactId: ref.artifactId, version: ref.version, writing: false };
  }
  return null;
}

/** A page in the thread, where the bot wrote it: its state, its version, and the ways into it (open, share). */
export function PreviewCard({ title, writing, onOpen, artifactId, version, className }: { title: string; writing: boolean; onOpen: () => void; artifactId?: string; version?: number; className?: string }) {
  const t = useT(messages);
  return (
    <Card className={cn("w-full max-w-lg", className)}>
      <CardHeader>
        <CardTitle className="truncate">{title || t.untitled}</CardTitle>
        <CardDescription>{version ? t.versioned(version) : artifactId || writing ? t.artifact : t.mockup}</CardDescription>
        <CardAction>
          <Badge variant="outline">
            {writing ? <Spinner data-icon="inline-start" /> : <FileCodeIcon data-icon="inline-start" />}
            {writing ? t.writing : t.ready}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardFooter className="justify-end gap-2">
        {artifactId && <ArtifactShareMenu artifactId={artifactId} />}
        <Button variant="secondary" onClick={onOpen}>
          {writing ? t.follow : t.open}
        </Button>
      </CardFooter>
    </Card>
  );
}

/** The mockups of a saved bot message. */
export function PreviewCards({ previews, onOpen }: { previews: PreviewRef[]; onOpen: (key: string) => void }) {
  return previews.map((p) => <PreviewCard key={p.key} title={p.title} writing={false} artifactId={p.artifactId} version={p.version} onOpen={() => onOpen(p.key)} />);
}

/** Large screens show the mockup beside the thread (`onDetach`: in a pane of its own); smaller ones in a sheet over it. */
export function PreviewPanel({ source, onClose, onDetach }: { source: PreviewSource | null; onClose: () => void; onDetach?: () => void }) {
  const t = useT(messages);
  const wide = useWide();
  const view = <PreviewView source={source} onClose={onClose} onDetach={wide ? onDetach : undefined} />;
  if (!wide) {
    return (
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="right" showCloseButton={false} className="w-full gap-0 data-[side=right]:sm:max-w-xl">
          <SheetTitle className="sr-only">{source?.title || t.untitled}</SheetTitle>
          {view}
        </SheetContent>
      </Sheet>
    );
  }
  return <aside className="flex h-full w-full flex-col bg-background">{view}</aside>;
}

/** A mockup as a workspace tab: the whole pane for the page. */
export function PreviewPage({ conversationId, previewKey, onClose }: { conversationId: string; previewKey: string; onClose?: () => void }) {
  const turns = useTurns(conversationId);
  const c = useT(common);
  const t = useT(messages);
  const { data: thread = [], isPending, isError, error, refetch } = useQuery(messagesQuery(conversationId));
  const source = findPreview(previewKey, turns, thread);
  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-background">
      {isPending ? (
        <div className="grid flex-1 place-items-center">
          <Spinner />
        </div>
      ) : isError && !source ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <WarningIcon />
            </EmptyMedia>
            <EmptyTitle>{t.unreachableTitle}</EmptyTitle>
            <EmptyDescription title={error.message}>{t.unreachable}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="secondary" onClick={() => void refetch()}>
              {c.retry}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <PreviewView source={source} onClose={onClose} page />
      )}
    </section>
  );
}

/** An artifact on its own (from the Artefacts screen): its latest version, the whole pane for it. */
export function ArtifactPage({ artifactId, onClose }: { artifactId: string; onClose?: () => void }) {
  const c = useT(common);
  const t = useT(messages);
  const { data: artifact, isPending, isError, error, refetch } = useQuery(artifactQuery(artifactId));
  const latest = artifact?.versions[0];
  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-background">
      {isPending ? (
        <div className="grid flex-1 place-items-center">
          <Spinner />
        </div>
      ) : isError ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <WarningIcon />
            </EmptyMedia>
            <EmptyTitle>{t.unreachableTitle}</EmptyTitle>
            <EmptyDescription title={error.message}>{t.unreachable}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="secondary" onClick={() => void refetch()}>
              {c.retry}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <PreviewView source={latest ? { title: artifact.title, id: latest.attachmentId, artifactId: artifact.id, writing: false } : null} onClose={onClose} page />
      )}
    </section>
  );
}

const DEVICES = ["mobile", "tablet", "desktop"] as const satisfies readonly ScreenDevice[];

function DeviceToggle({ value, onChange }: { value: ScreenDevice; onChange: (device: ScreenDevice) => void }) {
  const t = useT(messages);
  return (
    <ToggleGroup aria-label={t.width} value={[value]} onValueChange={(v) => v[0] && onChange(v[0] as ScreenDevice)} variant="outline" size="sm">
      {DEVICES.map((d) => (
        <ToggleGroupItem key={d} value={d}>
          {t[d]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function download(html: string, title: string) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = previewFileName(title);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** `page`: a tab of its own, the close button closes it. */
function PreviewView({ source, onClose, onDetach, page }: { source: PreviewSource | null; onClose?: () => void; onDetach?: () => void; page?: boolean }) {
  const t = useT(messages);
  const c = useT(common);
  const [device, setDevice] = useState<ScreenDevice>("mobile");
  const [enlarged, setEnlarged] = useState(false);
  const id = source && "id" in source ? source.id : null;
  const artifactId = source && "id" in source ? source.artifactId : undefined;
  // The version this message saved, until another is picked for this page (undefined: the latest).
  const [picked, setPicked] = useState<{ id: string | null; version: number | undefined } | null>(null);
  const version = picked && picked.id === id ? picked.version : source && "id" in source ? source.version : undefined;
  const setVersion = (v: number | undefined) => setPicked({ id, version: v });
  const saved = useQuery({
    queryKey: ["preview", id],
    queryFn: async () => {
      const res = await fetch(attachmentUrl(id!, true));
      if (!res.ok) throw new Error(String(res.status));
      return res.text();
    },
    // An artifact's page loads from its own address, where its scripts run (ArtifactFrame).
    enabled: !!id && !artifactId,
    staleTime: Infinity,
  });
  const html = source && "html" in source ? source.html : saved.data;
  // Between the end of the reply and its saved message, the page stays as it was.
  const [kept, setKept] = useState<{ html: string; title: string } | null>(null);
  if (html !== undefined && (kept?.html !== html || kept.title !== source?.title)) setKept({ html, title: source?.title ?? "" });
  const writing = !!source?.writing;
  const title = kept?.title || source?.title || t.untitled;
  // The page in the app's palette: Agora's kit goes ahead of it, live as once saved.
  const theme = useIsDark() ? "dark" : "light";
  const frame = (style: CSSProperties) =>
    artifactId ? (
      <ArtifactFrame src={artifactContentUrl(artifactId, version, theme)} title={title} style={style} />
    ) : (
      kept && <HtmlFrame html={withArtifactKit(kept.html, theme)} done={!writing} style={style} />
    );
  const ready = !!artifactId || !!kept;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader
        media={writing && <Spinner />}
        title={title}
        description={writing ? `${t.artifact}, ${t.writing.toLowerCase()}` : version ? t.versioned(version) : `${artifactId ? t.artifact : t.mockup}, ${t.ready.toLowerCase()}`}
        actions={
          <>
            {onDetach && <BesideButton onClick={onDetach} />}
            {onClose && (
              <Button variant="ghost" size="icon" aria-label={c.close} onClick={onClose}>
                <CloseIcon />
              </Button>
            )}
          </>
        }
      />
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 pb-3">
        <DeviceToggle value={device} onChange={setDevice} />
        <div className="flex-1" />
        {artifactId && <ArtifactVersionMenu artifactId={artifactId} value={version} onChange={setVersion} />}
        {!page && (
          <Button variant="outline" size="sm" disabled={!ready} onClick={() => setEnlarged(true)}>
            {t.enlarge}
          </Button>
        )}
        {artifactId ? (
          <Button variant="outline" size="sm" nativeButton={false} render={<a href={artifactContentUrl(artifactId, version)} download={previewFileName(title)} />}>
            {t.download}
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled={!kept} onClick={() => kept && download(kept.html, kept.title)}>
            {t.download}
          </Button>
        )}
        {artifactId && <ArtifactShareMenu artifactId={artifactId} />}
      </div>
      <div className="min-h-0 flex-1 px-4 pb-4">
        {ready ? (
          <ScaledFrame device={device}>{frame}</ScaledFrame>
        ) : saved.isError ? (
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <WarningIcon />
              </EmptyMedia>
              <EmptyTitle>{t.unreachableTitle}</EmptyTitle>
              <EmptyDescription title={saved.error.message}>{t.unreachable}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="secondary" onClick={() => void saved.refetch()}>
                {c.retry}
              </Button>
            </EmptyContent>
          </Empty>
        ) : !source && !id ? (
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileCodeIcon />
              </EmptyMedia>
              <EmptyTitle>{t.missingTitle}</EmptyTitle>
              <EmptyDescription>{t.missing}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid h-full place-items-center">
            <Spinner />
          </div>
        )}
      </div>

      {/* The whole window, at the size chosen. */}
      <Dialog open={enlarged && ready} onOpenChange={setEnlarged}>
        <DialogContent className="flex h-full max-h-dvh w-full max-w-none flex-col sm:max-w-none">
          <DialogHeader>
            <DialogTitle className="truncate">{title}</DialogTitle>
            <DialogDescription>{t.sandboxed}</DialogDescription>
          </DialogHeader>
          <DeviceToggle value={device} onChange={setDevice} />
          {ready && (
            <div className="min-h-0 flex-1">
              <ScaledFrame device={device}>{frame}</ScaledFrame>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * The page at the device's width, scaled down to fit the box and centered in it. A phone or a
 * tablet keeps its screen's proportions; a computer takes the box's whole height.
 */
function ScaledFrame({ device, children }: { device: ScreenDevice; children: (style: CSSProperties) => ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry!.contentRect.width, height: entry!.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const { width: base, height: baseHeight, mobile } = SCREEN_DEVICES[device];
  const scale = !size.width ? 1 : mobile ? Math.min(1, size.width / base, size.height / baseHeight) : Math.min(1, size.width / base);
  // One box for every device: the observer keeps measuring it.
  return (
    <div ref={box} className={cn("flex h-full justify-center overflow-hidden", mobile ? "items-center" : "rounded-lg border bg-background")}>
      {size.width > 0 &&
        (mobile ? (
          <div style={{ width: base * scale, height: baseHeight * scale }} className="shrink-0 overflow-hidden rounded-xl border bg-background">
            {children({ width: base, height: baseHeight, transform: `scale(${scale})`, transformOrigin: "top left" })}
          </div>
        ) : (
          <div style={{ width: base * scale, height: size.height }} className="shrink-0">
            {children({ width: base, height: size.height / scale, transform: `scale(${scale})`, transformOrigin: "top left" })}
          </div>
        ))}
    </div>
  );
}

/**
 * The page, written into the frame as it arrives, so it builds up without reloading or losing
 * its scroll. The sandbox runs no script (the page's, or its `on…` handlers); `allow-same-origin`
 * only lets this component write into it. Links stay inside the preview.
 */
function HtmlFrame({ html, done, style }: { html: string; done: boolean; style: CSSProperties }) {
  const frame = useRef<HTMLIFrameElement>(null);
  /** The document written to, what it holds, and whether it is closed. */
  const state = useRef<{ doc: Document | null; written: string; closed: boolean }>({ doc: null, written: "", closed: false });

  const write = () => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    const s = state.current;
    // A new document (the frame reloaded), a page that changed rather than grew, or more after the end: start over.
    if (s.doc !== doc || !html.startsWith(s.written) || (s.closed && html !== s.written)) {
      doc.open();
      // open() drops the document's listeners.
      doc.addEventListener("click", stayInside);
      state.current = { doc, written: "", closed: false };
    }
    const cur = state.current;
    if (html.length > cur.written.length) {
      doc.write(html.slice(cur.written.length));
      cur.written = html;
    }
    if (done && !cur.closed) {
      doc.close();
      cur.closed = true;
    }
  };

  // Every render: the effect only writes what is new.
  useEffect(write);

  return <iframe ref={frame} title="preview" sandbox="allow-same-origin" onLoad={write} style={style} className="block border-0 bg-background" />;
}

/**
 * A saved artifact, loaded from its own address: its scripts run there, on an opaque origin (the
 * sandbox here and the CSP the API sends with it), so they never reach the app's session.
 */
function ArtifactFrame({ src, title, style }: { src: string; title: string; style: CSSProperties }) {
  return <iframe src={src} title={title} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads" style={style} className="block border-0 bg-background" />;
}

/** A click on a link to elsewhere does nothing; one to a section of the page scrolls to it. */
function stayInside(e: MouseEvent) {
  const link = (e.target as Element | null)?.closest?.("a[href]");
  if (link && !link.getAttribute("href")!.startsWith("#")) e.preventDefault();
}
