import { lazy, Suspense, useRef, useState, type ReactNode } from "react";
import { CloseIcon, DownloadIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { defineMessages, useT } from "@/i18n";
import { fileKind, type FileKind } from "@/lib/files";
import { FILE_ICONS } from "@/lib/file-icons";
import { cn } from "@/lib/utils";
import { confirmAction } from "@/lib/confirm";
import { docFormat } from "@/lib/documents";
import { Spinner } from "@/components/ui/spinner";

// The text editor weighs: loaded only when a document is opened.
const DocumentEditor = lazy(() => import("@/components/DocumentEditor"));

const messages = defineMessages({
  en: {
    preview: (name: string) => `Preview ${name}`,
    download: (name: string) => `Download ${name}`,
    downloadShort: "Download",
    close: "Close",
    openOriginal: "Open the original",
    openIn: (where: string) => `Open in ${where}`,
    discardTitle: "Close without saving?",
    discardBody: "The last changes couldn't be saved and will be lost.",
    discard: "Close without saving",
  },
  fr: {
    preview: (name: string) => `Aperçu de ${name}`,
    download: (name: string) => `Télécharger ${name}`,
    downloadShort: "Télécharger",
    close: "Fermer",
    openOriginal: "Ouvrir l'original",
    openIn: (where: string) => `Ouvrir dans ${where}`,
    discardTitle: "Fermer sans enregistrer ?",
    discardBody: "Les dernières modifications n'ont pas pu être enregistrées et seront perdues.",
    discard: "Fermer sans enregistrer",
  },
});

/** Each kind of file in its colour, as file managers do: what it is reads before its name. */
const KIND_TONE: Record<FileKind, string> = {
  pdf: "text-destructive",
  document: "text-state-running",
  spreadsheet: "text-state-finished",
  presentation: "text-warning",
  design: "text-state-merged",
  image: "text-state-you",
  video: "text-state-you",
  audio: "text-state-merged",
  archive: "text-muted-foreground",
  code: "text-muted-foreground",
  file: "text-muted-foreground",
};


/** What a file is: its kind's icon in its colour, on a quiet tile (Linear's, Finder's). */
function KindBadge({ name, large }: { name: string; large?: boolean }) {
  const kind = fileKind(name);
  const Icon = FILE_ICONS[kind];
  return (
    <span aria-hidden className={cn("flex shrink-0 items-center justify-center bg-accent", large ? "size-16 rounded-2xl [&_svg]:size-7" : "size-9 rounded-lg [&_svg]:size-4.5", KIND_TONE[kind])}>
      <Icon />
    </span>
  );
}

/**
 * A file as an attachment tile (Claude, ChatGPT): its type as a coloured badge, its name on two
 * lines, its size and date under it. A click shows it large in the app (`src`: an image, a PDF);
 * its download button shows on hover. The same tile for the files people send and the ones a bot
 * finds in a drive (`openHref`: its page there, offered in the preview when it can't be shown).
 */
export function FileTile({
  name,
  meta,
  src,
  openHref,
  source,
  downloadHref,
  editId,
  className,
}: {
  name: string;
  meta?: ReactNode;
  /** The file itself, to show it: an image or a PDF is previewed from it. */
  src?: string;
  /** Its page elsewhere (Drive, Figma), when the app can't show it. */
  openHref?: string;
  /** Where it lives (« Google Drive »), to say where the original opens. */
  source?: string;
  downloadHref?: string;
  /** The attachment it is, when the app can rewrite it: a Word, Markdown or text document then opens in the editor. */
  editId?: string;
  className?: string;
}) {
  const t = useT(messages);
  const [open, setOpen] = useState(false);
  const kind = fileKind(name);
  // What the app can show itself: an image or a PDF it has the address of.
  const shown = !!src && (kind === "image" || kind === "pdf");
  // A document of the conversation: opened in the text editor, saved back in place.
  const format = src && editId ? docFormat(name) : null;
  // What's typed is saved before the editor closes; only a save that failed asks first.
  const flush = useRef<() => Promise<boolean>>(async () => true);
  const close = async () => {
    if (!(await flush.current()) && !(await confirmAction({ title: t.discardTitle, description: t.discardBody, action: t.discard }))) return;
    flush.current = async () => true;
    setOpen(false);
  };
  return (
    <>
      {/* One line, as an attachment: its mark, its name over its size, download on hover. */}
      <div className={cn("group/tile relative flex w-64 max-w-full shrink-0 items-center gap-2.5 rounded-xl border bg-card py-2 pr-2 pl-2 transition-colors hover:bg-accent/60", className)}>
        {/* The whole tile opens the preview: a button stretched under its content, download above it. */}
        <button
          type="button"
          aria-label={t.preview(name)}
          onClick={() => setOpen(true)}
          className="absolute inset-0 cursor-pointer rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        {kind === "image" && src ? <img src={src} alt="" className="size-9 shrink-0 rounded-lg object-cover" /> : <KindBadge name={name} />}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-ui font-medium">{name}</span>
          {meta && <span className="truncate text-xs text-subtle-foreground tabular-nums">{meta}</span>}
        </span>
        {downloadHref && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t.download(name)}
            nativeButton={false}
            render={<a href={downloadHref} download={name} />}
            className="relative shrink-0 text-muted-foreground opacity-0 group-hover/tile:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
          >
            <DownloadIcon />
          </Button>
        )}
      </div>
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : void close())}>
        {format && src && editId ? (
          // A document: the editor, as large as the screen allows.
          <DialogContent showCloseButton={false} initialFocus={false} className="flex h-11/12 max-h-11/12 flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
            <Suspense fallback={<Spinner className="m-auto" />}>
              <DocumentEditor
                name={name}
                src={src}
                attachmentId={editId}
                format={format}
                meta={meta}
                downloadHref={downloadHref}
                onClose={() => void close()}
                registerFlush={(f) => (flush.current = f)}
              />
            </Suspense>
          </DialogContent>
        ) : shown ? (
          // An image or a PDF: large, its name and download on a thin bar over it.
          <DialogContent
            showCloseButton={false}
            initialFocus={(type) => type === "keyboard"}
            className={cn("flex max-h-11/12 flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl", kind === "pdf" && "h-11/12")}
          >
            <div className="flex h-12 shrink-0 items-center gap-2 border-b pr-2 pl-4">
              <DialogTitle className="min-w-0 flex-1 truncate text-ui font-medium">{name}</DialogTitle>
              {meta && <span className="shrink-0 text-xs text-subtle-foreground tabular-nums">{meta}</span>}
              {downloadHref && (
                <Button variant="ghost" size="icon-sm" aria-label={t.download(name)} nativeButton={false} render={<a href={downloadHref} download={name} />}>
                  <DownloadIcon />
                </Button>
              )}
              <DialogClose render={<Button variant="ghost" size="icon-sm" aria-label={t.close} />}>
                <CloseIcon />
              </DialogClose>
            </div>
            {kind === "pdf" ? (
              <iframe src={src} title={name} className="min-h-0 w-full flex-1 bg-muted" />
            ) : (
              <img src={src} alt={name} className="min-h-0 w-full flex-1 bg-muted object-contain" />
            )}
          </DialogContent>
        ) : (
          // Nothing the browser can show: a small card, what it is and what can be done with it.
          <DialogContent initialFocus={(type) => type === "keyboard"} className="flex flex-col items-center gap-0 p-6 text-center sm:max-w-xs">
            <KindBadge name={name} large />
            <DialogTitle className="mt-4 line-clamp-2 text-ui font-medium break-words">{name}</DialogTitle>
            {meta && <p className="mt-1 text-xs text-subtle-foreground tabular-nums">{meta}</p>}
            <div className="mt-5 flex w-full flex-col gap-2">
              {openHref && (
                <Button nativeButton={false} render={<a href={openHref} target="_blank" rel="noreferrer" />}>
                  {source ? t.openIn(source) : t.openOriginal}
                </Button>
              )}
              {downloadHref && (
                <Button variant="secondary" nativeButton={false} render={<a href={downloadHref} download={name} />}>
                  {t.downloadShort}
                </Button>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

/** Tiles side by side, wrapping. */
export function FileTiles({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap gap-2", className)}>{children}</div>;
}
