import { useQuery } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { previewFileName, readPreviews, SCREEN_DEVICES, withArtifactKit, type PreviewRef, type ScreenDevice } from "@agora/core";
import { useIsDark } from "@/lib/theme";
import { common } from "@agora/core/i18n";
import { useWide } from "@/components/CodeSession";
import { ArtifactShareMenu, ArtifactVersionSelect, SHARE_MODE_ICON } from "@/components/ArtifactShare";
import { Card } from "@/components/ui/card";
import { ArtifactActionsMenu } from "@/components/ArtifactActions";
import { useNavigate } from "@tanstack/react-router";
import { openHere, tabPath, useDesktop } from "@/lib/workspace";
import { ButtonGroup } from "@/components/ui/button-group";
import { BesideButton } from "@/components/BesideButton";
import { PaneHeader } from "@/components/PaneHeader";
import { CloseIcon, DownloadIcon, ExternalLinkIcon, FileCodeIcon, MonitorIcon, MoreIcon, SmartphoneIcon, TabletIcon, WarningIcon } from "@/components/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BlockCard, BlockFooter, StatusLine } from "@/components/views/block";
import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
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
    versioned: (n: number) => `Artifact, version ${n}`,
    version: (n: number) => `Version ${n}`,
    share: "Share",
    deleted: (title: string) => `« ${title} » was deleted.`,
    more: "More",
    untitled: "Mockup",
    writing: "Being written…",
    ready: "Ready",
    follow: "Follow",
    open: "Open",
    download: "Download",
    openTab: "Open in a new tab",
    width: "Preview width",
    mobile: "Phone",
    tablet: "Tablet",
    desktop: "Computer",
    missing: "This mockup is no longer available.",
    missingTitle: "Mockup not found",
    unreachableTitle: "Mockup unreachable",
    unreachable: "It couldn't be loaded for now. Try again in a moment.",
  },
  fr: {
    mockup: "Maquette HTML",
    artifact: "Artefact",
    versioned: (n: number) => `Artefact, version ${n}`,
    version: (n: number) => `Version ${n}`,
    share: "Partager",
    deleted: (title: string) => `« ${title} » a été supprimé.`,
    more: "Plus d'actions",
    untitled: "Maquette",
    writing: "En cours d'écriture…",
    ready: "Prête",
    follow: "Suivre",
    open: "Ouvrir",
    download: "Télécharger",
    openTab: "Ouvrir dans un onglet",
    width: "Largeur de l'aperçu",
    mobile: "Mobile",
    tablet: "Tablette",
    desktop: "Ordinateur",
    missing: "Cette maquette n'est plus disponible.",
    missingTitle: "Maquette introuvable",
    unreachableTitle: "Maquette injoignable",
    unreachable: "Elle n'a pas pu être chargée pour le moment. Réessaie dans un instant.",
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

/**
 * An artifact as a card, the same in the thread and in the gallery: the page itself as its picture
 * (live while the bot writes it), its title, a line under it (`meta`), who can open it (its icon opens
 * the sharing menu) and its « … ». A click opens it.
 */
export function ArtifactTile({
  title,
  page,
  meta,
  onOpen,
  artifactId,
  version,
  className,
}: {
  title: string;
  page: ((style: CSSProperties) => ReactNode) | null;
  meta: ReactNode;
  onOpen: () => void;
  artifactId?: string;
  version?: number;
  className?: string;
}) {
  const t = useT(messages);
  const { data: artifact } = useQuery({ ...artifactQuery(artifactId ?? ""), enabled: !!artifactId });
  const Mode = artifact ? SHARE_MODE_ICON[artifact.shareMode] : null;
  return (
    <Card size="sm" className={cn("w-full gap-0 py-0", className)}>
      <button type="button" aria-label={t.open} onClick={onOpen} className="block h-44 w-full cursor-pointer overflow-hidden border-b bg-background">
        {page && <Thumb page={page} />}
      </button>
      <div className="flex items-center gap-1 py-2.5 pr-2 pl-3">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 cursor-pointer text-left">
          <span className="block truncate text-ui font-medium">{title || t.untitled}</span>
          <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">{meta}</span>
        </button>
        {artifactId && Mode && (
          <ArtifactShareMenu
            artifactId={artifactId}
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label={t.share}>
                <Mode />
              </Button>
            }
          />
        )}
        {artifactId && <ArtifactActionsMenu artifactId={artifactId} version={version} />}
      </div>
    </Card>
  );
}

/** A page drawn 720 px wide, then shrunk to its box: wide enough to lay out, narrow enough to read. */
function Thumb({ page }: { page: (style: CSSProperties) => ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry!.contentRect.width, height: entry!.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const scale = size.width ? size.width / THUMB_WIDTH : 0;
  return (
    <div ref={box} className="pointer-events-none h-full overflow-hidden" aria-hidden>
      {scale > 0 && page({ width: THUMB_WIDTH, height: size.height / scale, transform: `scale(${scale})`, transformOrigin: "top left" })}
    </div>
  );
}

const THUMB_WIDTH = 720;

/** A page in the thread, where the bot wrote it: its card, live while written, then its artifact's. */
export function PreviewCard({
  title,
  writing,
  onOpen,
  artifactId,
  version,
  html,
  className,
}: {
  title: string;
  writing: boolean;
  onOpen: () => void;
  artifactId?: string;
  version?: number;
  /** The page as the reply streams it (the saved one loads from its artifact). */
  html?: string;
  className?: string;
}) {
  const t = useT(messages);
  const theme = useIsDark() ? "dark" : "light";
  const openFull = useOpenArtifact();
  // Deleted since: one line where its card was.
  const gone = useQuery({ ...artifactQuery(artifactId ?? ""), enabled: !!artifactId, retry: false }).isError;
  // Once saved, the artifact opens full size, in a tab of its own; while written, the panel follows it.
  const open = artifactId && !writing ? () => openFull(artifactId) : onOpen;
  const page =
    html !== undefined ? (style: CSSProperties) => <HtmlFrame html={withArtifactKit(html, theme)} done={!writing} style={style} />
    : artifactId ? (style: CSSProperties) => <ArtifactFrame src={artifactContentUrl(artifactId, version, theme)} title={title} style={style} />
    : null;
  if (gone) return <p className={cn("text-xs text-subtle-foreground", className)}>{t.deleted(title || t.untitled)}</p>;
  return (
    <ArtifactTile
      title={title}
      page={page}
      onOpen={open}
      artifactId={artifactId}
      version={version}
      className={cn("max-w-sm", className)}
      meta={
        writing ? (
          <>
            <Spinner className="size-3" />
            {t.writing}
          </>
        ) : (
          (version ? t.versioned(version) : artifactId ? t.artifact : t.mockup)
        )
      }
    />
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

const DEVICE_ICON = { mobile: SmartphoneIcon, tablet: TabletIcon, desktop: MonitorIcon } satisfies Record<(typeof DEVICES)[number], unknown>;

/** The width the page is shown at, as icons (their name in a tooltip). */
function DeviceToggle({ value, onChange }: { value: ScreenDevice; onChange: (device: ScreenDevice) => void }) {
  const t = useT(messages);
  return (
    <ToggleGroup aria-label={t.width} value={[value]} onValueChange={(v) => v[0] && onChange(v[0] as ScreenDevice)} variant="outline" size="sm" spacing={0}>
      {DEVICES.map((d) => {
        const Icon = DEVICE_ICON[d];
        return (
          <Tooltip key={d}>
            <TooltipTrigger render={<ToggleGroupItem value={d} aria-label={t[d]} />}>
              <Icon />
            </TooltipTrigger>
            <TooltipContent>{t[d]}</TooltipContent>
          </Tooltip>
        );
      })}
    </ToggleGroup>
  );
}

/** A page not saved yet, in a tab of its own. */
function openHtml(html: string) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** A saved version, as a file (its page with Agora's kit). */
function downloadUrl(url: string, title: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = previewFileName(title);
  a.click();
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
  const id = source && "id" in source ? source.id : null;
  const artifactId = source && "id" in source ? source.artifactId : undefined;
  // The version this message saved, until another is picked for this page (undefined: the latest).
  const [picked, setPicked] = useState<{ id: string | null; version: number | undefined } | null>(null);
  const version = picked && picked.id === id ? picked.version : source && "id" in source ? source.version : undefined;
  const setVersion = (v: number | undefined) => setPicked({ id, version: v });
  // On its own, an artifact opens at its link, under Agora's toolbar (artifact-page.ts).
  const sharedPath = useQuery({ ...artifactQuery(artifactId ?? ""), enabled: !!artifactId }).data?.sharePath;
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
        // The title is enough; only a page being written says so.
        description={writing ? t.writing : undefined}
        actions={
          <>
            {artifactId && <ArtifactVersionSelect artifactId={artifactId} value={version} onChange={setVersion} />}
            {artifactId && <ArtifactShareMenu artifactId={artifactId} />}
            {artifactId ? (
              <ArtifactActionsMenu artifactId={artifactId} version={version} onDeleted={onClose} />
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t.more} disabled={!ready} />}>
                  <MoreIcon />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => kept && openHtml(withArtifactKit(kept.html, theme))}>
                    <ExternalLinkIcon />
                    {t.openTab}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => kept && download(kept.html, kept.title)}>
                    <DownloadIcon />
                    {t.download}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {onDetach && <BesideButton onClick={onDetach} />}
            {onClose && (
              <Button variant="ghost" size="icon" aria-label={c.close} onClick={onClose}>
                <CloseIcon />
              </Button>
            )}
          </>
        }
      />
      <div className="min-h-0 flex-1">
        {ready ? (
          frame({ width: "100%", height: "100%" })
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
    </div>
  );
}

/**
 * The page at the device's width, scaled down to fit the box and centered in it. A phone or a
 * tablet keeps its screen's proportions; a computer takes the box's whole height.
 */
function ScaledFrame({ device, children, bare }: { device: ScreenDevice; children: (style: CSSProperties) => ReactNode; bare?: boolean }) {
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
    <div ref={box} className={cn("flex h-full justify-center overflow-hidden", mobile ? "items-center" : !bare && "rounded-lg border bg-background")}>
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
  return <iframe src={src} title={title} loading="lazy" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads" style={style} className="block border-0 bg-background" />;
}

/** Opens an artifact full size: a workspace tab on a computer, the screen on a phone. */
export function useOpenArtifact() {
  const desktop = useDesktop();
  const navigate = useNavigate();
  return (artifactId: string) => (desktop ? openHere(tabPath.artifact(artifactId), true) : navigate({ to: "/artifacts/$artifactId", params: { artifactId } }));
}

/** An artifact's latest version, in the app's palette (the gallery's pictures). */
export function ArtifactPageFrame({ artifactId, title, style }: { artifactId: string; title: string; style: CSSProperties }) {
  const theme = useIsDark() ? "dark" : "light";
  return <ArtifactFrame src={artifactContentUrl(artifactId, undefined, theme)} title={title} style={style} />;
}

/** An artifact's latest version as a picture (the gallery): the page at a computer's width, scaled to the box. */
export function ArtifactThumbnail({ artifactId, title }: { artifactId: string; title: string }) {
  const theme = useIsDark() ? "dark" : "light";
  return <Thumb page={(style) => <ArtifactFrame src={artifactContentUrl(artifactId, undefined, theme)} title={title} style={style} />} />;
}

/** A click on a link to elsewhere does nothing; one to a section of the page scrolls to it. */
function stayInside(e: MouseEvent) {
  const link = (e.target as Element | null)?.closest?.("a[href]");
  if (link && !link.getAttribute("href")!.startsWith("#")) e.preventDefault();
}
