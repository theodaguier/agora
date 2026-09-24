import { FileTextIcon, CloseIcon } from "@/components/icons";
import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { defineMessages, useT } from "@/i18n";
import { attachmentUrl, type Attachment } from "@/lib/api";
import { isImage } from "@/lib/files";
import { formatSize } from "@/lib/format";
import { cn } from "@/lib/utils";

const shownMessages = defineMessages({
  en: { download: (name: string) => `Download ${name}`, downloadShort: "Download", failed: "Failed", remove: (name: string) => `Remove ${name}`, close: "Close" },
  fr: { download: (name: string) => `Télécharger ${name}`, downloadShort: "Télécharger", failed: "Échec", remove: (name: string) => `Retirer ${name}`, close: "Fermer" },
});

type Shown = Attachment & { previewUrl?: string };

/**
 * Full-screen viewer for one or several images; ← → move between them.
 * `index` null means closed.
 */
export function ImageViewer({
  images,
  index,
  onIndexChange,
}: {
  images: Shown[];
  index: number | null;
  onIndexChange: (index: number | null) => void;
}) {
  const t = useT(shownMessages);
  const a = index === null ? null : images[index];
  const step = (delta: number) => {
    if (index === null || images.length < 2) return;
    onIndexChange((index + delta + images.length) % images.length);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") step(1);
    else if (e.key === "ArrowLeft") step(-1);
  };
  return (
    <Dialog open={!!a} onOpenChange={(open) => !open && onIndexChange(null)}>
      <DialogContent
        showCloseButton={false}
        onKeyDown={onKeyDown}
        className="inset-0 top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-black/70 p-0 text-white shadow-none sm:max-w-none data-open:zoom-in-100 data-closed:zoom-out-100"
      >
        {a && (
          <>
            <div className="flex items-center gap-3 px-4 py-3">
              <DialogTitle className="min-w-0 flex-1 truncate text-sm font-normal text-white/85">{a.name}</DialogTitle>
              {images.length > 1 && (
                <span className="text-sm tabular-nums text-white/60">
                  {index! + 1} / {images.length}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/10 hover:text-white"
                render={<a href={a.previewUrl ?? attachmentUrl(a.id, true)} download={a.name} />}
              >
                {t.downloadShort}
              </Button>
              <DialogClose render={<Button variant="ghost" size="icon" aria-label={t.close} className="text-white hover:bg-white/10 hover:text-white" />}>
                <CloseIcon />
              </DialogClose>
            </div>
            <div
              className="flex min-h-0 flex-1 items-center justify-center px-4 pb-4"
              onClick={(e) => e.target === e.currentTarget && onIndexChange(null)}
            >
              <img
                key={a.id}
                src={a.previewUrl ?? attachmentUrl(a.id)}
                alt={a.name}
                draggable={false}
                onClick={() => step(1)}
                className={cn("max-h-full max-w-full rounded-lg object-contain", images.length > 1 && "cursor-pointer")}
              />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Image opening the viewer on click; ⌘-click still opens it in a new tab. */
function ImageTile({ a, className, onOpen }: { a: Shown; className?: string; onOpen: () => void }) {
  const open = (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    onOpen();
  };
  return (
    <a href={a.previewUrl ?? attachmentUrl(a.id)} target="_blank" rel="noreferrer" draggable={false} onClick={open} className="block cursor-zoom-in">
      <img src={a.previewUrl ?? attachmentUrl(a.id)} alt={a.name} draggable={false} className={cn("object-cover", className)} />
    </a>
  );
}

/** File card: a click downloads it. */
function FileCard({ a, className }: { a: Shown; className?: string }) {
  const t = useT(shownMessages);
  return (
    <Item
      variant="outline"
      size="sm"
      render={<a href={a.previewUrl ?? attachmentUrl(a.id, true)} download={a.name} title={t.download(a.name)} />}
      className={cn("w-72 max-w-full rounded-xl hover:bg-muted/50", className)}
    >
      <ItemMedia variant="icon">
        <FileTextIcon className="text-muted-foreground" />
      </ItemMedia>
      <ItemContent className="min-w-0 gap-0">
        <ItemTitle className="w-full truncate">{a.name}</ItemTitle>
        <ItemDescription className="text-xs">{formatSize(a.size)}</ItemDescription>
      </ItemContent>
    </Item>
  );
}

/** Attachments sent alone, without text: shown bare. */
export function SentAttachments({
  items,
  className,
  align = "end",
}: {
  items: Shown[];
  className?: string;
  /** "start" for files sent by a colleague. */
  align?: "start" | "end";
}) {
  const images = items.filter((a) => isImage(a.mime));
  const files = items.filter((a) => !isImage(a.mime));
  const [viewing, setViewing] = useState<number | null>(null);
  return (
    <div className={cn("flex flex-col gap-1.5", align === "end" ? "items-end" : "items-start", className)}>
      {images.length > 0 && (
        <div className={cn("flex flex-wrap gap-1.5", align === "end" ? "justify-end" : "justify-start")}>
          {images.map((a, i) => (
            <ImageTile key={a.id} a={a} onOpen={() => setViewing(i)} className="max-h-60 min-h-20 min-w-20 max-w-60 rounded-2xl" />
          ))}
        </div>
      )}
      <ImageViewer images={images} index={viewing} onIndexChange={setViewing} />
      {files.map((a) => (
        <FileCard key={a.id} a={a} />
      ))}
    </div>
  );
}

/** Attachments inside a bubble, above its text. */
export function BubbleAttachments({ items }: { items: Shown[] }) {
  const images = items.filter((a) => isImage(a.mime));
  const files = items.filter((a) => !isImage(a.mime));
  const [viewing, setViewing] = useState<number | null>(null);
  return (
    <div className="flex flex-col gap-1 p-1">
      {images.length > 0 && (
        <div className={cn("grid gap-1", images.length > 1 && "grid-cols-2")}>
          {images.map((a, i) => (
            <ImageTile
              key={a.id}
              a={a}
              onOpen={() => setViewing(i)}
              className={cn("w-full rounded-xl", images.length > 1 ? "aspect-square" : "max-h-80 min-h-24")}
            />
          ))}
        </div>
      )}
      <ImageViewer images={images} index={viewing} onIndexChange={setViewing} />
      {files.map((a) => (
        <FileCard key={a.id} a={a} className="w-full border-border/60" />
      ))}
    </div>
  );
}

export type PendingFile = {
  key: string;
  file: File;
  previewUrl?: string;
  status: "uploading" | "done" | "error";
  attachment?: Attachment;
  error?: string;
};

/** Files being added, shown above the input field. */
export function PendingFiles({ items, onRemove }: { items: PendingFile[]; onRemove: (key: string) => void }) {
  const t = useT(shownMessages);
  if (!items.length) return null;
  return (
    <div className="flex gap-2 overflow-x-auto px-1 pb-2 pt-1">
      {items.map((p) => (
        <div key={p.key} className="group relative shrink-0" title={p.error ?? p.file.name}>
          {p.previewUrl ? (
            <img src={p.previewUrl} alt={p.file.name} className={cn("size-16 rounded-xl object-cover", p.status === "error" && "opacity-40")} />
          ) : (
            <div className={cn("flex h-16 w-44 items-center gap-2 rounded-xl bg-accent px-3", p.status === "error" && "opacity-60")}>
              <FileTextIcon className="size-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block truncate text-sm">{p.file.name}</span>
                <span className="block text-xs text-muted-foreground">{p.status === "error" ? t.failed : formatSize(p.file.size)}</span>
              </span>
            </div>
          )}
          {p.status === "uploading" && (
            <span className="absolute inset-0 grid place-items-center rounded-xl bg-black/40">
              <Spinner className="size-5" />
            </span>
          )}
          <Button
            size="icon-xs"
            aria-label={t.remove(p.file.name)}
            onClick={() => onRemove(p.key)}
            className="absolute -right-1.5 -top-1.5 shadow"
          >
            <CloseIcon strokeWidth={2.5} />
          </Button>
        </div>
      ))}
    </div>
  );
}
