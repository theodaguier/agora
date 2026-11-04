import { CloseIcon, DownloadIcon, FileTextIcon, PauseIcon, PlayIcon } from "@/components/icons";
import { useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { defineMessages, useT } from "@/i18n";
import { attachmentUrl, type Attachment } from "@/lib/api";
import { isAudio, isImage, isVideo } from "@/lib/files";
import { formatSize } from "@/lib/format";
import { cn } from "@/lib/utils";

const shownMessages = defineMessages({
  en: { download: (name: string) => `Download ${name}`, downloadShort: "Download", failed: "Failed", remove: (name: string) => `Remove ${name}`, close: "Close", play: "Play", pause: "Pause", seek: "Position" },
  fr: { download: (name: string) => `Télécharger ${name}`, downloadShort: "Télécharger", failed: "Échec", remove: (name: string) => `Retirer ${name}`, close: "Fermer", play: "Lire", pause: "Pause", seek: "Position" },
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
        className="inset-0 top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col sm:max-w-none"
      >
        {a && (
          <>
            <div className="flex items-center gap-3">
              <DialogTitle className="min-w-0 flex-1 truncate">{a.name}</DialogTitle>
              {images.length > 1 && (
                <span className="tabular-nums text-muted-foreground">
                  {index! + 1} / {images.length}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                render={<a href={a.previewUrl ?? attachmentUrl(a.id, true)} download={a.name} />}
              >
                {t.downloadShort}
              </Button>
              <DialogClose render={<Button variant="ghost" size="icon" aria-label={t.close} />}>
                <CloseIcon />
              </DialogClose>
            </div>
            <div
              className="flex min-h-0 flex-1 items-center justify-center"
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

/** A video, played where it is; its controls hold fullscreen and download. */
function VideoTile({ a, className }: { a: Shown; className?: string }) {
  return (
    <video
      src={a.previewUrl ?? attachmentUrl(a.id)}
      controls
      playsInline
      preload="metadata"
      aria-label={a.name}
      className={cn("bg-muted object-contain", className)}
    />
  );
}

/** 83 → "1:23". */
const clock = (seconds: number) => {
  const s = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * A sound: play/pause, its name, where it is and how long it lasts, a bar to move in it. The browser's
 * own player is hidden (it can't look like the rest of the app); it only plays.
 */
function AudioCard({ a, className }: { a: Shown; className?: string }) {
  const t = useT(shownMessages);
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };
  return (
    <Item variant="outline" size="sm" className={cn("w-80 max-w-full flex-nowrap", className)}>
      <audio
        ref={ref}
        src={a.previewUrl ?? attachmentUrl(a.id)}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        className="hidden"
      />
      <ItemMedia>
        <Button size="icon" variant="secondary" aria-label={playing ? t.pause : t.play} onClick={toggle}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </Button>
      </ItemMedia>
      <ItemContent className="min-w-0 gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <ItemTitle className="min-w-0 flex-1 truncate">{a.name}</ItemTitle>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {clock(time)} / {clock(duration)}
          </span>
        </div>
        <Slider
          aria-label={t.seek}
          min={0}
          max={duration || 1}
          step={0.1}
          value={[time]}
          onValueChange={(v) => {
            const next = Array.isArray(v) ? v[0]! : (v as number);
            if (ref.current) ref.current.currentTime = next;
            setTime(next);
          }}
        />
      </ItemContent>
    </Item>
  );
}

/** The attachments by how they are shown. */
function sortShown(items: Shown[]) {
  return {
    images: items.filter((a) => isImage(a.mime)),
    videos: items.filter((a) => isVideo(a.mime)),
    sounds: items.filter((a) => isAudio(a.mime)),
    files: items.filter((a) => !isImage(a.mime) && !isVideo(a.mime) && !isAudio(a.mime)),
  };
}

/** "recap.pdf" → "PDF": the file's type, from its extension. */
const fileType = (name: string) => (/\.([a-z0-9]{1,8})$/i.exec(name)?.[1] ?? "").toUpperCase();

/** File card: a click downloads it. */
function FileCard({ a, className }: { a: Shown; className?: string }) {
  const t = useT(shownMessages);
  return (
    <Item
      variant="outline"
      size="sm"
      render={<a href={a.previewUrl ?? attachmentUrl(a.id, true)} download={a.name} title={t.download(a.name)} />}
      className={cn("w-72 max-w-full", className)}
    >
      <ItemMedia variant="icon">
        <FileTextIcon />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full truncate">{a.name}</ItemTitle>
        <ItemDescription className="flex gap-2">
          {fileType(a.name) && <span>{fileType(a.name)}</span>}
          <span>{formatSize(a.size)}</span>
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        {/* The whole card downloads: the icon only shows it, as a ghost button would. */}
        <span aria-hidden className={buttonVariants({ variant: "ghost", size: "icon-sm" })}>
          <DownloadIcon />
        </span>
      </ItemActions>
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
  const { images, videos, sounds, files } = sortShown(items);
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
      {videos.map((a) => (
        <VideoTile key={a.id} a={a} className="max-h-96 w-96 max-w-full rounded-2xl" />
      ))}
      {sounds.map((a) => (
        <AudioCard key={a.id} a={a} />
      ))}
      {files.map((a) => (
        <FileCard key={a.id} a={a} />
      ))}
    </div>
  );
}

/** Attachments inside a bubble, above its text. */
export function BubbleAttachments({ items }: { items: Shown[] }) {
  const { images, videos, sounds, files } = sortShown(items);
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
      {videos.map((a) => (
        <VideoTile key={a.id} a={a} className="max-h-80 w-full rounded-xl" />
      ))}
      {sounds.map((a) => (
        <AudioCard key={a.id} a={a} className="w-full" />
      ))}
      {files.map((a) => (
        <FileCard key={a.id} a={a} className="w-full" />
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
    // Room above and on the right for each remove button, which overhangs its file.
    <div className="flex w-full gap-2 overflow-x-auto pt-2 pr-2">
      {items.map((p) => (
        <div key={p.key} className={cn("relative shrink-0", p.status === "error" && "opacity-50")} title={p.error ?? p.file.name}>
          {p.previewUrl ? (
            <img src={p.previewUrl} alt={p.file.name} className="size-16 rounded-lg object-cover" />
          ) : (
            <Item variant="muted" size="xs" className="w-44">
              <ItemMedia variant="icon">
                <FileTextIcon />
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle className="w-full truncate">{p.file.name}</ItemTitle>
                <ItemDescription>{p.status === "error" ? t.failed : formatSize(p.file.size)}</ItemDescription>
              </ItemContent>
            </Item>
          )}
          {p.status === "uploading" && (
            <span className="absolute inset-0 grid place-items-center rounded-lg bg-background/60">
              <Spinner />
            </span>
          )}
          <Button size="icon-xs" aria-label={t.remove(p.file.name)} onClick={() => onRemove(p.key)} className="absolute -top-2 -right-2">
            <CloseIcon />
          </Button>
        </div>
      ))}
    </div>
  );
}
