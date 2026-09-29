import { useQuery } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { previewFileName, readPreviews, type PreviewRef } from "@agora/core";
import { common } from "@agora/core/i18n";
import { useWide } from "@/components/CodeSession";
import { ChevronsRightIcon, FileCodeIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { defineMessages, useT } from "@/i18n";
import { attachmentUrl, type ActiveTurn, type Message } from "@/lib/api";
import { cn } from "@/lib/utils";

const messages = defineMessages({
  en: {
    mockup: "HTML mockup",
    untitled: "Mockup",
    writing: "Being written…",
    ready: "Ready",
    follow: "Follow",
    open: "Open",
    download: "Download",
    enlarge: "Enlarge",
    width: "Preview width",
    phone: "Phone",
    computer: "Computer",
    missing: "This mockup is no longer available.",
    sandboxed: "Rendered without scripts; links don't leave the preview.",
  },
  fr: {
    mockup: "Maquette HTML",
    untitled: "Maquette",
    writing: "En cours d'écriture…",
    ready: "Prête",
    follow: "Suivre",
    open: "Ouvrir",
    download: "Télécharger",
    enlarge: "Agrandir",
    width: "Largeur de l'aperçu",
    phone: "Mobile",
    computer: "Ordinateur",
    missing: "Cette maquette n'est plus disponible.",
    sandboxed: "Affichée sans scripts ; les liens ne quittent pas l'aperçu.",
  },
});

/** Where a mockup is read from: the reply being written, or the file its saved message keeps. */
export type PreviewSource = { title: string; writing: boolean } & ({ html: string } | { id: string });

/** The mockup `<turnId>:<index>`: in its live reply while there is one, then in the saved message. */
export function findPreview(key: string, turns: ActiveTurn[], thread: Message[]): PreviewSource | null {
  const [turnId, index] = key.split(":");
  const turn = turns.find((t) => t.turnId === turnId);
  const live = turn && readPreviews(turn.text)[Number(index)];
  if (live) return { title: live.title, html: live.html, writing: !live.done };
  for (let i = thread.length - 1; i >= 0; i--) {
    const ref = thread[i]!.data?.previews?.find((p) => p.key === key);
    if (ref) return { title: ref.title, id: ref.id, writing: false };
  }
  return null;
}

/** A mockup in the thread, where the bot wrote it: its state, and the way into the preview. */
export function PreviewCard({ title, writing, onOpen, className }: { title: string; writing: boolean; onOpen: () => void; className?: string }) {
  const t = useT(messages);
  return (
    <Item variant="outline" className={cn("my-1 w-full max-w-[min(680px,88%)]", className)}>
      <ItemMedia variant="icon">{writing ? <Spinner className="size-4" /> : <FileCodeIcon />}</ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full truncate">{title || t.untitled}</ItemTitle>
        <ItemDescription className="truncate">
          {t.mockup} · {writing ? t.writing : t.ready}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button variant="outline" size="sm" onClick={onOpen}>
          {writing ? t.follow : t.open}
        </Button>
      </ItemActions>
    </Item>
  );
}

/** The mockups of a saved bot message. */
export function PreviewCards({ previews, onOpen }: { previews: PreviewRef[]; onOpen: (key: string) => void }) {
  return previews.map((p) => <PreviewCard key={p.key} title={p.title} writing={false} onOpen={() => onOpen(p.key)} />);
}

/** Large screens show the mockup beside the thread; smaller ones in a sheet over it. */
export function PreviewPanel({ source, onClose }: { source: PreviewSource | null; onClose: () => void }) {
  const t = useT(messages);
  const wide = useWide();
  const view = <PreviewView source={source} onClose={onClose} />;
  if (!wide) {
    return (
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 data-[side=right]:sm:max-w-xl">
          <SheetTitle className="sr-only">{source?.title || t.untitled}</SheetTitle>
          {view}
        </SheetContent>
      </Sheet>
    );
  }
  return <aside className="flex h-full w-[520px] shrink-0 flex-col bg-sidebar">{view}</aside>;
}

type Device = "phone" | "computer";
/** Layout width each device renders the page at; the frame is scaled down to the space it has. */
const WIDTHS: Record<Device, number> = { phone: 390, computer: 1280 };

function download(html: string, title: string) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = previewFileName(title);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function PreviewView({ source, onClose }: { source: PreviewSource | null; onClose: () => void }) {
  const t = useT(messages);
  const c = useT(common);
  const [device, setDevice] = useState<Device>("phone");
  const [enlarged, setEnlarged] = useState(false);
  const id = source && "id" in source ? source.id : null;
  const saved = useQuery({
    queryKey: ["preview", id],
    queryFn: async () => {
      const res = await fetch(attachmentUrl(id!, true));
      if (!res.ok) throw new Error(String(res.status));
      return res.text();
    },
    enabled: !!id,
    staleTime: Infinity,
  });
  const html = source && "html" in source ? source.html : saved.data;
  // Between the end of the reply and its saved message, the page stays as it was.
  const [kept, setKept] = useState<{ html: string; title: string } | null>(null);
  if (html !== undefined && (kept?.html !== html || kept.title !== source?.title)) setKept({ html, title: source?.title ?? "" });
  const writing = !!source?.writing;
  const title = kept?.title || source?.title || t.untitled;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-start gap-2.5 px-4 pb-2 pt-3.5">
        {writing && <Spinner className="mt-1 size-4 shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium leading-snug">{title}</p>
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
            {t.mockup} · {writing ? t.writing : t.ready}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label={c.close} onClick={onClose} className="-mr-1.5 -mt-1 rounded-lg">
          <ChevronsRightIcon />
        </Button>
      </header>
      <div className="flex shrink-0 items-center gap-2 px-4 pb-3">
        <ToggleGroup aria-label={t.width} value={[device]} onValueChange={(v) => v[0] && setDevice(v[0] as Device)} variant="outline" size="sm">
          <ToggleGroupItem value="phone">{t.phone}</ToggleGroupItem>
          <ToggleGroupItem value="computer">{t.computer}</ToggleGroupItem>
        </ToggleGroup>
        <div className="flex-1" />
        <Button variant="outline" size="sm" disabled={!kept} onClick={() => setEnlarged(true)}>
          {t.enlarge}
        </Button>
        <Button variant="outline" size="sm" disabled={!kept} onClick={() => kept && download(kept.html, kept.title)}>
          {t.download}
        </Button>
      </div>
      <div className="min-h-0 flex-1 px-4 pb-4">
        {kept ? (
          <ScaledFrame html={kept.html} done={!writing} device={device} />
        ) : saved.isError || (!source && !id) ? (
          <Empty className="h-full rounded-lg border border-solid border-border bg-background/60">
            <EmptyHeader>
              <EmptyDescription>{t.missing}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid h-full place-items-center">
            <Spinner className="size-5 text-muted-foreground" />
          </div>
        )}
      </div>

      <Dialog open={enlarged && !!kept} onOpenChange={setEnlarged}>
        <DialogContent className="flex h-[88vh] flex-col sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle className="truncate">{title}</DialogTitle>
            <DialogDescription>{t.sandboxed}</DialogDescription>
          </DialogHeader>
          {kept && (
            <div className="min-h-0 flex-1">
              <ScaledFrame html={kept.html} done={!writing} device={device} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** The page at the device's width, scaled down to fit the box and centered in it. */
function ScaledFrame({ html, done, device }: { html: string; done: boolean; device: Device }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry!.contentRect.width, height: entry!.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const base = WIDTHS[device];
  const scale = size.width ? Math.min(1, size.width / base) : 1;
  return (
    <div ref={box} className="flex h-full justify-center overflow-hidden rounded-lg border border-border bg-background">
      {size.width > 0 && (
        <div style={{ width: base * scale, height: size.height }} className="shrink-0">
          <HtmlFrame html={html} done={done} style={{ width: base, height: size.height / scale, transform: `scale(${scale})`, transformOrigin: "top left" }} />
        </div>
      )}
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

  return <iframe ref={frame} title="preview" sandbox="allow-same-origin" onLoad={write} style={style} className="block border-0 bg-white" />;
}

/** A click on a link to elsewhere does nothing; one to a section of the page scrolls to it. */
function stayInside(e: MouseEvent) {
  const link = (e.target as Element | null)?.closest?.("a[href]");
  if (link && !link.getAttribute("href")!.startsWith("#")) e.preventDefault();
}
