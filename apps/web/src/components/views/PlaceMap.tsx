import type { Place, PlaceView } from "@agora/core";
import { useLayoutEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { brandsQuery } from "@/lib/queries";
import { MapPinIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { defineMessages, useLocale, useT } from "@/i18n";
import { useIsDark } from "@/lib/theme";
import { cn } from "@/lib/utils";

const messages = defineMessages({
  en: { directions: "Directions", open: (name: string) => `Open ${name} on the map` },
  fr: { directions: "Itinéraire", open: (name: string) => `Ouvrir ${name} sur la carte` },
});

const TILE = 256;
const HEIGHT = 200;

/** Web Mercator: longitude and latitude → world pixels at zoom `z`. */
const project = (lat: number, lng: number, z: number) => {
  const scale = TILE * 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  return { x: ((lng + 180) / 360) * scale, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale };
};

/** The highest zoom where every place fits the frame, with room around the pins. */
function fitZoom(points: { lat: number; lng: number }[], width: number, height: number) {
  if (points.length < 2) return 15;
  for (let z = 16; z > 2; z--) {
    const xy = points.map((p) => project(p.lat, p.lng, z));
    const w = Math.max(...xy.map((p) => p.x)) - Math.min(...xy.map((p) => p.x));
    const h = Math.max(...xy.map((p) => p.y)) - Math.min(...xy.map((p) => p.y));
    if (w <= width - 80 && h <= height - 64) return z;
  }
  return 3;
}

/**
 * A map of the places, drawn from map tiles as images (the app forbids embedded frames): Esri's grey
 * canvas, dark or light with the theme; Google's red pin per place, the credit in its corner.
 */
function StaticMap({ places }: { places: (Place & { lat: number; lng: number })[] }) {
  const dark = useIsDark();
  const google = !!useQuery(brandsQuery).data?.maps;
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const z = width ? fitZoom(places, width, HEIGHT) : 0;
  const xy = places.map((p) => project(p.lat, p.lng, z));
  const cx = (Math.min(...xy.map((p) => p.x)) + Math.max(...xy.map((p) => p.x))) / 2;
  const cy = (Math.min(...xy.map((p) => p.y)) + Math.max(...xy.map((p) => p.y))) / 2;
  const left = cx - width / 2;
  const top = cy - HEIGHT / 2;
  const tiles: { x: number; y: number }[] = [];
  if (width) {
    const max = 2 ** z;
    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + width) / TILE); tx++)
      for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + HEIGHT) / TILE); ty++) if (ty >= 0 && ty < max) tiles.push({ x: tx, y: ty });
  }

  // Google Maps set up (Settings › Integrations): its own map, through the API that holds the key.
  if (google && width) {
    const p = places.map((x) => `${x.lat},${x.lng}`).join(";");
    return (
      <div ref={box} className="relative h-50 overflow-hidden bg-muted">
        <img alt="" draggable={false} src={`/api/integrations/map?p=${encodeURIComponent(p)}&w=${Math.min(640, width)}&h=${HEIGHT}${dark ? "&dark=1" : ""}`} className="size-full object-cover select-none" />
      </div>
    );
  }

  return (
    <div ref={box} className="relative h-50 overflow-hidden bg-muted">
      {/* Esri's grey canvas (dark or light), its street names over it: a quiet map, as Apple's and Google's. */}
      {(["Base", "Reference"] as const).map((layer) =>
        tiles.map((t) => (
          <img
            key={`${layer}/${t.x}/${t.y}`}
            alt=""
            draggable={false}
            src={`https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${dark ? "Dark" : "Light"}_Gray_${layer}/MapServer/tile/${z}/${t.y}/${((t.x % 2 ** z) + 2 ** z) % 2 ** z}`}
            className="absolute size-64 max-w-none select-none"
            style={{ left: t.x * TILE - left, top: t.y * TILE - top }}
          />
        )),
      )}
      {xy.map((p, i) => (
        // Google's pin: a red drop, its number in white, its tip on the place.
        <svg key={i} aria-hidden viewBox="0 0 28 38" className="absolute h-9.5 w-7 drop-shadow-md" style={{ left: p.x - left - 14, top: p.y - top - 38 }}>
          <path d="M14 0C6.27 0 0 6.1 0 13.63 0 23.85 14 38 14 38s14-14.15 14-24.37C28 6.1 21.73 0 14 0Z" fill="var(--destructive)" stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
          <text x="14" y="18.5" textAnchor="middle" className="fill-white text-xs font-semibold">
            {i + 1}
          </text>
        </svg>
      ))}
      <span className="absolute right-1.5 bottom-1 rounded-sm bg-background/70 px-1 text-2xs text-muted-foreground backdrop-blur-sm">© Esri, OpenStreetMap</span>
    </div>
  );
}

const STAR = "M12 2.5l2.94 6.1 6.56.9-4.8 4.6 1.2 6.6L12 17.6l-5.9 3.1 1.2-6.6-4.8-4.6 6.56-.9z";

/**
 * A rating as Google Maps writes it: the mark (« 4,5 »), five stars filled to it, how many reviews.
 * The stars are drawn once grey, once gold clipped to the rating, so a half star is half filled.
 */
function Stars({ rating, reviews }: { rating: number; reviews?: number }) {
  const locale = useLocale();
  return (
    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground" aria-label={`${rating}/5${reviews ? `, ${reviews}` : ""}`}>
      <span className="font-medium text-foreground tabular-nums">{rating.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
      <span aria-hidden className="relative flex">
        <span className="flex text-border">
          {[0, 1, 2, 3, 4].map((i) => (
            <svg key={i} viewBox="0 0 24 24" className="size-3" fill="currentColor">
              <path d={STAR} />
            </svg>
          ))}
        </span>
        <span className="absolute inset-y-0 left-0 flex overflow-hidden text-warning" style={{ width: `${(rating / 5) * 100}%` }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <svg key={i} viewBox="0 0 24 24" className="size-3 shrink-0" fill="currentColor">
              <path d={STAR} />
            </svg>
          ))}
        </span>
      </span>
      {reviews !== undefined && <span className="tabular-nums">({reviews.toLocaleString(locale)})</span>}
    </span>
  );
}

/** Where a place opens: its own link, else the map at its coordinates or its address. */
const mapUrl = (p: Place) =>
  p.url ?? (p.lat !== undefined && p.lng !== undefined ? `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.name, p.address].filter(Boolean).join(", "))}`);
const directionsUrl = (p: Place) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p.lat !== undefined && p.lng !== undefined ? `${p.lat},${p.lng}` : [p.name, p.address].filter(Boolean).join(", "))}`;

/**
 * Places a bot found: the map with a numbered pin each (when it gave coordinates), then one row per
 * place, its number, name and address, what it notes (« 12:30, réservé »), its way there.
 */
export function PlaceList({ view }: { view: PlaceView }) {
  const t = useT(messages);
  const located = view.places.filter((p): p is Place & { lat: number; lng: number } => p.lat !== undefined && p.lng !== undefined);
  let n = 0;
  return (
    <div className="flex flex-col">
      {located.length > 0 && <StaticMap places={located} />}
      <ul className="flex flex-col px-1 py-1.5">
        {view.places.map((p, i) => {
          const number = p.lat !== undefined && p.lng !== undefined ? ++n : null;
          return (
            <li key={i} className="flex min-w-0 items-center gap-3 rounded-md px-2 py-2 hover:bg-accent">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  number ? "bg-destructive text-white" : "bg-accent text-muted-foreground",
                )}
              >
                {number ?? <MapPinIcon className="size-3.5" />}
              </span>
              <a href={mapUrl(p)} target="_blank" rel="noreferrer" aria-label={t.open(p.name)} className="flex min-w-0 flex-1 flex-col outline-none">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-ui font-medium">{p.name}</span>
                  {p.rating !== undefined && <Stars rating={p.rating} reviews={p.reviews} />}
                </span>
                {(p.address || p.note) && <span className="truncate text-xs text-muted-foreground">{[p.note, p.address].filter(Boolean).join(", ")}</span>}
              </a>
              <Button variant="ghost" size="sm" nativeButton={false} render={<a href={directionsUrl(p)} target="_blank" rel="noreferrer" />} className="shrink-0 text-muted-foreground">
                {t.directions}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
