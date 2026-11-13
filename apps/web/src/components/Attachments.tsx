import { CloseIcon, DownloadIcon, FileTextIcon, MaximizeIcon, PauseIcon, PlayIcon } from "@/components/icons";
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { defineMessages, useT } from "@/i18n";
import { attachmentUrl, type Attachment } from "@/lib/api";
import { fileKind, isAudio, isImage, isVideo } from "@/lib/files";
import { formatSize } from "@/lib/format";
import { FileTile } from "@/components/FileTile";
import { cn } from "@/lib/utils";

const shownMessages = defineMessages({
  en: { download: (name: string) => `Download ${name}`, downloadShort: "Download", failed: "Failed", remove: (name: string) => `Remove ${name}`, close: "Close", play: "Play", pause: "Pause", seek: "Position", fullscreen: "Full screen", gone: "File not found" },
  fr: { download: (name: string) => `Télécharger ${name}`, downloadShort: "Télécharger", failed: "Échec", remove: (name: string) => `Retirer ${name}`, close: "Fermer", play: "Lire", pause: "Pause", seek: "Position", fullscreen: "Plein écran", gone: "Fichier introuvable" },
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

/**
 * A video or a sound that won't play, as a file. If the server no longer has it (a 404), it says so
 * and offers no download that would fail.
 */
function Unplayable({ a }: { a: Shown }) {
  const t = useT(shownMessages);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (a.previewUrl) return;
    let live = true;
    fetch(attachmentUrl(a.id), { method: "HEAD", credentials: "include" })
      .then((res) => live && setGone(res.status === 404))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [a.id, a.previewUrl]);
  return <FileTile name={a.name} meta={gone ? t.gone : formatSize(a.size)} downloadHref={gone ? undefined : (a.previewUrl ?? attachmentUrl(a.id, true))} />;
}

/** 83 → "1:23". */
const clock = (seconds: number) => {
  const s = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** A media element's play state, time and length, and the way to play, pause and move in it. */
function useMedia<T extends HTMLMediaElement>() {
  const ref = useRef<T>(null);
  const [playing, setPlaying] = useState(false);
  // Played once: the time alone can't say, a video starts on its frame at 0.1 s.
  const [started, setStarted] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };
  const seek = (to: number) => {
    if (ref.current) ref.current.currentTime = to;
    setTime(to);
  };
  const events = {
    onPlay: () => {
      setPlaying(true);
      setStarted(true);
    },
    onPause: () => setPlaying(false),
    onEnded: () => setPlaying(false),
    onTimeUpdate: (e: { currentTarget: HTMLMediaElement }) => setTime(e.currentTarget.currentTime),
    onLoadedMetadata: (e: { currentTarget: HTMLMediaElement }) => setDuration(e.currentTarget.duration),
  };
  return { ref, playing, started, time, duration, toggle, seek, events };
}

/**
 * Where a sound or a video is, as a thin line: a press or a drag moves in it, the arrows by 5 s.
 * Lighter than a slider's knob, as players are (Linear's, Apple's).
 */
function Progress({ time, duration, onSeek, label, className }: { time: number; duration: number; onSeek: (t: number) => void; label: string; className?: string }) {
  const at = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onSeek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (duration || 0));
  };
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration) || 0}
      aria-valuenow={Math.round(time)}
      aria-valuetext={`${clock(time)} / ${clock(duration)}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        at(e);
      }}
      onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && at(e)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") onSeek(Math.min(duration, time + 5));
        else if (e.key === "ArrowLeft") onSeek(Math.max(0, time - 5));
      }}
      className={cn("group/progress flex h-3 cursor-pointer items-center outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className)}
    >
      <div className="h-1 w-full overflow-hidden rounded-full bg-current/20 transition-all group-hover/progress:h-1.5">
        <div className="h-full rounded-full bg-current" style={{ width: `${duration ? (time / duration) * 100 : 0}%` }} />
      </div>
    </div>
  );
}

/**
 * A video, played where it is, with the app's controls rather than the browser's: its first frame
 * while it waits, a white play button and its length in a corner; on hover a bar with play, time,
 * where it is and fullscreen. A file that can't be read is shown as a file, not a black box.
 */
function VideoTile({ a, className, videoClassName }: { a: Shown; className?: string; /** Its size limits: the video keeps its own proportions within them. */ videoClassName?: string }) {
  const t = useT(shownMessages);
  const m = useMedia<HTMLVideoElement>();
  const box = useRef<HTMLDivElement>(null);
  const [broken, setBroken] = useState(false);
  const started = m.started;
  const src = a.previewUrl ?? attachmentUrl(a.id);
  if (broken) return <Unplayable a={a} />;
  return (
    <div ref={box} className={cn("group/video relative w-fit max-w-full overflow-hidden bg-black", className)}>
      {/* « #t=0.1 »: the browser paints the first frame instead of black. */}
      <video ref={m.ref} src={`${src}#t=0.1`} playsInline preload="metadata" aria-label={a.name} onClick={m.toggle} onError={() => setBroken(true)} {...m.events} className={cn("block max-w-full group-[:fullscreen]/video:size-full group-[:fullscreen]/video:max-h-none group-[:fullscreen]/video:object-contain", videoClassName)} />
      <Button
        variant="secondary"
        size="icon-sm"
        aria-label={t.download(a.name)}
        nativeButton={false}
        render={<a href={a.previewUrl ?? attachmentUrl(a.id, true)} download={a.name} />}
        className="absolute top-2.5 right-2.5 opacity-0 group-hover/video:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
      >
        <DownloadIcon />
      </Button>
      {!started && (
        <>
          <button
            type="button"
            aria-label={t.play}
            onClick={m.toggle}
            className="absolute top-1/2 left-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black shadow-lg transition-transform outline-none hover:scale-105 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <PlayIcon className="fill-current ml-0.5 size-5" />
          </button>
          {m.duration > 0 && <span className="absolute right-2.5 bottom-2.5 rounded-md bg-black/60 px-1.5 py-0.5 text-xs text-white tabular-nums backdrop-blur-sm">{clock(m.duration)}</span>}
        </>
      )}
      {started && (
        <div className={cn("absolute inset-x-0 bottom-0 flex items-center gap-2 bg-linear-to-t from-black/70 to-transparent px-3 pt-8 pb-2.5 text-white transition-opacity", m.playing && "opacity-0 group-hover/video:opacity-100 focus-within:opacity-100")}>
          <button type="button" aria-label={m.playing ? t.pause : t.play} onClick={m.toggle} className="flex size-6 shrink-0 items-center justify-center rounded-md outline-none hover:bg-white/15 focus-visible:ring-3 focus-visible:ring-ring/50">
            {m.playing ? <PauseIcon className="fill-current size-3.5" /> : <PlayIcon className="fill-current size-3.5" />}
          </button>
          <span className="shrink-0 text-xs tabular-nums">
            {clock(m.time)} / {clock(m.duration)}
          </span>
          <Progress time={m.time} duration={m.duration} onSeek={m.seek} label={t.seek} className="flex-1" />
          <button
            type="button"
            aria-label={t.fullscreen}
            onClick={() => void box.current?.requestFullscreen()}
            className="flex size-6 shrink-0 items-center justify-center rounded-md outline-none hover:bg-white/15 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <MaximizeIcon className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

const BARS = 40;

/**
 * A sound's waveform, as voice messages draw it: its loudness in 40 bars, read from the file once.
 * Until then (or if it can't be read) even bars, so the card keeps its shape.
 */
function useWaveform(src: string) {
  const [peaks, setPeaks] = useState<number[] | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const buffer = await (await fetch(src)).arrayBuffer();
        const ctx = new OfflineAudioContext(1, 1, 44_100);
        const audio = await ctx.decodeAudioData(buffer);
        const data = audio.getChannelData(0);
        const step = Math.floor(data.length / BARS) || 1;
        const raw = Array.from({ length: BARS }, (_, i) => {
          let sum = 0;
          for (let j = i * step; j < Math.min(data.length, (i + 1) * step); j++) sum += Math.abs(data[j]!);
          return sum / step;
        });
        const max = Math.max(...raw) || 1;
        if (live) setPeaks(raw.map((v) => Math.max(0.12, v / max)));
      } catch {
        // Unreadable: the even bars stay.
      }
    })();
    return () => {
      live = false;
    };
  }, [src]);
  return peaks ?? Array.from({ length: BARS }, () => 0.3);
}

/**
 * A sound, as a voice message (iMessage, WhatsApp): a round play button, its waveform lit up to where
 * it is (a press moves in it), its time. The browser's player is hidden; it only plays.
 */
function AudioCard({ a, className }: { a: Shown; className?: string }) {
  const t = useT(shownMessages);
  const m = useMedia<HTMLAudioElement>();
  const src = a.previewUrl ?? attachmentUrl(a.id);
  const peaks = useWaveform(src);
  const [broken, setBroken] = useState(false);
  const played = m.duration ? m.time / m.duration : 0;
  const seekAt = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    m.seek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (m.duration || 0));
  };
  return (
    // A sound that can't be read is shown as a file, not a player stuck at 0:00.
    broken ? (
      <Unplayable a={a} />
    ) : (
    <div title={a.name} className={cn("flex w-72 max-w-full items-center gap-3 rounded-full bg-accent py-1.5 pr-4 pl-1.5", className)}>
      <audio ref={m.ref} src={src} preload="metadata" onError={() => setBroken(true)} {...m.events} className="hidden" />
      <button
        type="button"
        aria-label={m.playing ? t.pause : t.play}
        onClick={m.toggle}
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background outline-none transition-transform hover:scale-105 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {m.playing ? <PauseIcon className="fill-current size-4" /> : <PlayIcon className="fill-current ml-0.5 size-4" />}
      </button>
      <div
        role="slider"
        tabIndex={0}
        aria-label={t.seek}
        aria-valuemin={0}
        aria-valuemax={Math.round(m.duration) || 0}
        aria-valuenow={Math.round(m.time)}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seekAt(e);
        }}
        onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && seekAt(e)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") m.seek(Math.min(m.duration, m.time + 5));
          else if (e.key === "ArrowLeft") m.seek(Math.max(0, m.time - 5));
        }}
        className="flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-0.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {peaks.map((p, i) => (
          <span key={i} className={cn("w-0.5 flex-1 rounded-full", (i + 0.5) / peaks.length <= played ? "bg-foreground" : "bg-foreground/25")} style={{ height: `${p * 100}%` }} />
        ))}
      </div>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{clock(m.started ? m.time : m.duration)}</span>
      <Button variant="ghost" size="icon-xs" aria-label={t.download(a.name)} nativeButton={false} render={<a href={a.previewUrl ?? attachmentUrl(a.id, true)} download={a.name} />} className="-mr-2 shrink-0 text-muted-foreground">
        <DownloadIcon />
      </Button>
    </div>
    )
  );
}

/** The attachments by how they are shown; a file saved without a type is known by its extension. */
function sortShown(items: Shown[]) {
  const kind = (a: Shown) => {
    if (isImage(a.mime)) return "image";
    if (isVideo(a.mime)) return "video";
    if (isAudio(a.mime)) return "audio";
    const byName = a.mime === "application/octet-stream" || !a.mime ? fileKind(a.name) : "file";
    return byName === "video" || byName === "audio" ? byName : "file";
  };
  return {
    images: items.filter((a) => kind(a) === "image"),
    videos: items.filter((a) => kind(a) === "video"),
    sounds: items.filter((a) => kind(a) === "audio"),
    files: items.filter((a) => kind(a) === "file"),
  };
}

/** File card: the shared attachment tile; a click previews it, or opens a document in the editor. */
function FileCard({ a, className }: { a: Shown; className?: string }) {
  return <FileTile name={a.name} meta={formatSize(a.size)} src={a.previewUrl ?? attachmentUrl(a.id)} downloadHref={a.previewUrl ?? attachmentUrl(a.id, true)} editId={a.previewUrl ? undefined : a.id} className={className} />;
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
        <VideoTile key={a.id} a={a} className="rounded-2xl" videoClassName="max-h-96" />
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
        <VideoTile key={a.id} a={a} className="rounded-xl" videoClassName="max-h-80" />
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
