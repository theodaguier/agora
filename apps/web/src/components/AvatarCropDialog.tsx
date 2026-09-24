import { useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import type { CropRect } from "@/lib/avatar";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";

const messages = defineMessages({
  en: {
    title: "Crop the photo",
    hint: "Drag to move the photo, zoom to frame your face.",
    frame: "Photo frame. Arrow keys move it, + and − zoom.",
    zoom: "Zoom",
    apply: "Use this photo",
  },
  fr: {
    title: "Recadrer la photo",
    hint: "Fais glisser la photo et zoome pour bien cadrer ton visage.",
    frame: "Cadre de la photo. Les flèches la déplacent, + et − zooment.",
    zoom: "Zoom",
    apply: "Utiliser cette photo",
  },
});

/** Side of the crop frame, in CSS px. */
const FRAME = 288;
const MAX_ZOOM = 4;

type View = { zoom: number; x: number; y: number };

/**
 * Crops a picked photo to a circle: drag to pan, wheel or slider to zoom.
 * Returns the square to keep in the source image's pixels.
 */
export function AvatarCropDialog({
  image,
  onCancel,
  onApply,
}: {
  image: { bitmap: ImageBitmap; url: string } | null;
  onCancel: () => void;
  onApply: (crop: CropRect) => void;
}) {
  const t = useT(messages);
  const c = useT(common);
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const [drag, setDrag] = useState<{ id: number; x: number; y: number } | null>(null);
  // A new photo starts centered, unzoomed.
  const [viewOf, setViewOf] = useState(image);
  if (image !== viewOf) {
    setViewOf(image);
    setView({ zoom: 1, x: 0, y: 0 });
  }

  const w = image?.bitmap.width ?? 1;
  const h = image?.bitmap.height ?? 1;
  // At zoom 1, the short side fills the frame.
  const scaleAt = (zoom: number) => (FRAME / Math.min(w, h)) * zoom;
  // The photo must always cover the whole frame.
  const clamp = (v: View): View => {
    const s = scaleAt(v.zoom);
    const mx = (w * s - FRAME) / 2;
    const my = (h * s - FRAME) / 2;
    return { zoom: v.zoom, x: Math.max(-mx, Math.min(mx, v.x)), y: Math.max(-my, Math.min(my, v.y)) };
  };
  const zoomTo = (zoom: number) =>
    setView((v) => {
      const z = Math.max(1, Math.min(MAX_ZOOM, zoom));
      // Zoom around the center of the frame.
      return clamp({ zoom: z, x: (v.x * z) / v.zoom, y: (v.y * z) / v.zoom });
    });
  const pan = (dx: number, dy: number) => setView((v) => clamp({ ...v, x: v.x + dx, y: v.y + dy }));

  const scale = scaleAt(view.zoom);
  const left = (FRAME - w * scale) / 2 + view.x;
  const top = (FRAME - h * scale) / 2 + view.y;

  const apply = () => onApply({ x: -left / scale, y: -top / scale, side: FRAME / scale });

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id: e.pointerId, x: e.clientX, y: e.clientY });
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag?.id !== e.pointerId) return;
    pan(e.clientX - drag.x, e.clientY - drag.y);
    setDrag({ ...drag, x: e.clientX, y: e.clientY });
  };
  const onWheel = (e: WheelEvent<HTMLDivElement>) => zoomTo(view.zoom * Math.exp(-e.deltaY * 0.002));
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 40 : 10;
    const moves: Record<string, () => void> = {
      ArrowLeft: () => pan(-step, 0),
      ArrowRight: () => pan(step, 0),
      ArrowUp: () => pan(0, -step),
      ArrowDown: () => pan(0, step),
      "+": () => zoomTo(view.zoom * 1.1),
      "=": () => zoomTo(view.zoom * 1.1),
      "-": () => zoomTo(view.zoom / 1.1),
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    move();
  };

  return (
    <Dialog open={!!image} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent showCloseButton={false} className="gap-5 sm:max-w-[352px]">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.hint}</DialogDescription>
        </DialogHeader>

        {image && (
          <div
            role="group"
            tabIndex={0}
            aria-label={t.frame}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => setDrag(null)}
            onPointerCancel={() => setDrag(null)}
            onWheel={onWheel}
            onKeyDown={onKeyDown}
            style={{ width: FRAME, height: FRAME }}
            className="relative mx-auto touch-none overflow-hidden rounded-xl bg-muted outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50 data-[drag=true]:cursor-grabbing cursor-grab"
            data-drag={!!drag}
          >
            <img
              src={image.url}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none origin-top-left"
              style={{ left, top, width: w * scale, height: h * scale }}
            />
            {/* Everything outside the circle is dimmed: that's what gets cut. */}
            <div aria-hidden className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgb(0_0_0/0.55)] ring-1 ring-white/70" />
          </div>
        )}

        <Slider
          aria-label={t.zoom}
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={[view.zoom]}
          onValueChange={(v) => zoomTo(Array.isArray(v) ? v[0]! : v)}
          className="mx-auto data-horizontal:w-72"
        />

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{c.cancel}</DialogClose>
          <Button onClick={apply}>{t.apply}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
