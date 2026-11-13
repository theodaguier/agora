import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useIsDark } from "@/lib/theme";
import { defineMessages, useT } from "@/i18n";
import { type WikiEdge, type WikiNode, type WikiNodeType } from "@/lib/wiki-graph";

const messages = defineMessages({
  en: { label: "Company memory graph: wiki pages and the links between them" },
  fr: { label: "Graphe de la mémoire d'entreprise : pages du wiki et liens entre elles" },
});

type SimNode = SimulationNodeDatum & WikiNode & { degree: number; r: number };
type SimLink = SimulationLinkDatum<SimNode> & { authored: boolean };

const INK = {
  dark: { node: "#8a8a8a", nodeFocus: "#ededed", edge: "rgba(255,255,255,0.09)", authored: "rgba(255,255,255,0.035)", edgeFocus: "rgba(255,255,255,0.42)", ring: "#ffffff", label: "#e6e6e6" },
  light: { node: "#a3a3a3", nodeFocus: "#262626", edge: "rgba(0,0,0,0.1)", authored: "rgba(0,0,0,0.035)", edgeFocus: "rgba(0,0,0,0.45)", ring: "#171717", label: "#262626" },
};
const LABEL_SIZE = 12;

/** Drawn radius, in graph units: a dot grows with the zoom up to its own size, never past it, so a small
 * vault fitted to a large pane stays a constellation of points instead of big discs. */
const radius = (n: SimNode, k: number) => (n.r * Math.min(k, 1)) / k;

/**
 * Memory graph, in the style of Obsidian's graph view: force simulation
 * (d3-force) drawn on a canvas. Wheel = zoom, drag background = pan,
 * drag a node = reposition it, click = open the page.
 */
/** Draws the graph: edges, nodes, then labels; the hovered or selected node's neighborhood stands out. */
function paint(
  ctx: CanvasRenderingContext2D,
  s: { nodes: SimNode[]; links: SimLink[]; neighbors: Map<string, Set<string>>; view: { x: number; y: number; k: number }; fitK: number; hover: SimNode | null },
  { width, height, selected, highlight, dark }: { width: number; height: number; selected: string | null; highlight: Set<string> | null; dark: boolean },
) {
  const { view, hover } = s;
  const ink = dark ? INK.dark : INK.light;
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.translate(width / 2 + view.x, height / 2 + view.y);
  ctx.scale(view.k, view.k);

  const focusId = hover?.id ?? selected;
  const rad = (n: SimNode) => radius(n, view.k);
  const focus = focusId ? new Set([focusId, ...(s.neighbors.get(focusId) ?? [])]) : null;
  const lit = (id: string) => (focus ? focus.has(id) : highlight ? highlight.has(id) : true);

  ctx.lineWidth = 0.7 / view.k;
  // Authorship links fainter than page links: an agent that wrote every page would veil the graph.
  for (const authored of [true, false]) {
    ctx.strokeStyle = authored ? ink.authored : ink.edge;
    ctx.beginPath();
    for (const l of s.links) {
      const a = l.source as SimNode;
      const b = l.target as SimNode;
      if (l.authored !== authored || (focus && (a.id === focusId || b.id === focusId))) continue;
      ctx.moveTo(a.x!, a.y!);
      ctx.lineTo(b.x!, b.y!);
    }
    ctx.stroke();
  }
  if (focus) {
    ctx.strokeStyle = ink.edgeFocus;
    ctx.lineWidth = 1 / view.k;
    ctx.beginPath();
    for (const l of s.links) {
      const a = l.source as SimNode;
      const b = l.target as SimNode;
      if (a.id !== focusId && b.id !== focusId) continue;
      ctx.moveTo(a.x!, a.y!);
      ctx.lineTo(b.x!, b.y!);
    }
    ctx.stroke();
  }

  // One grey for every node, as in Obsidian: the kind is in the filter menu and the page panel, the
  // focused node and its neighbors turn dark, a link that leads nowhere stays faint.
  for (const n of s.nodes) {
    ctx.globalAlpha = (lit(n.id) ? 1 : 0.14) * (n.type === "ghost" ? 0.5 : 1);
    ctx.fillStyle = focus?.has(n.id) || highlight?.has(n.id) ? ink.nodeFocus : ink.node;
    ctx.beginPath();
    ctx.arc(n.x!, n.y!, rad(n), 0, Math.PI * 2);
    ctx.fill();
    if (n.id === selected) {
      ctx.strokeStyle = ink.ring;
      ctx.lineWidth = 1.5 / view.k;
      ctx.beginPath();
      ctx.arc(n.x!, n.y!, rad(n) + 3 / view.k, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // No label at rest, as in Obsidian: the hovered or opened node and its neighbors, the search matches,
  // or everything once zoomed well past the fitted view. They are placed by priority and a label that
  // would overlap one already drawn is skipped: zooming in spreads the nodes and reveals the rest.
  const rank = (n: SimNode) => (n.id === focusId ? 0 : n.id === selected ? 1 : highlight?.has(n.id) ? 2 : 3);
  const candidates = s.nodes
    .filter((n) => (focus ? focus.has(n.id) : highlight ? highlight.has(n.id) : view.k > s.fitK * 2))
    .sort((a, b) => rank(a) - rank(b) || b.degree - a.degree);
  ctx.font = `${LABEL_SIZE / view.k}px ${getComputedStyle(ctx.canvas).fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  // Every node is taken first, so a label never covers a node.
  const screen = (n: SimNode) => [width / 2 + view.x + n.x! * view.k, height / 2 + view.y + n.y! * view.k, rad(n) * view.k + 2] as const;
  const placed: [number, number, number, number, string?][] = s.nodes.map((n) => {
    const [x, y, r] = screen(n);
    return [x - r, y - r, x + r, y + r, n.id];
  });
  for (const n of candidates) {
    const label = n.label.length > 30 ? `${n.label.slice(0, 29)}…` : n.label;
    const w = ctx.measureText(label).width * view.k;
    const x = width / 2 + view.x + n.x! * view.k;
    const y = height / 2 + view.y + (n.y! + rad(n)) * view.k + 3;
    const box: [number, number, number, number] = [x - w / 2 - 3, y - 1, x + w / 2 + 3, y + LABEL_SIZE + 3];
    if (box[2] < 0 || box[0] > width || box[3] < 0 || box[1] > height) continue;
    if (n.id !== focusId && placed.some((p) => p[4] !== n.id && box[0] < p[2] && box[2] > p[0] && box[1] < p[3] && box[3] > p[1])) continue;
    placed.push(box);
    ctx.globalAlpha = focus && n.id !== focusId ? 0.8 : lit(n.id) ? 0.95 : 0.3;
    ctx.fillStyle = ink.label;
    ctx.fillText(label, n.x!, n.y! + rad(n) + 3 / view.k);
  }
  ctx.globalAlpha = 1;
}

export function MemoryGraph(props: {
  nodes: WikiNode[];
  edges: WikiEdge[];
  hidden: Set<WikiNodeType>;
  selected: string | null;
  highlight: Set<string> | null;
  onSelect: (id: string | null) => void;
}) {
  const t = useT(messages);
  const dark = useIsDark();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRef({
    nodes: [] as SimNode[],
    links: [] as SimLink[],
    neighbors: new Map<string, Set<string>>(),
    view: { x: 0, y: 0, k: 1 },
    // Zoom of the fitted view: labels show for every node only once zoomed well past it.
    fitK: 1,
    hover: null as SimNode | null,
    sim: null as Simulation<SimNode, SimLink> | null,
    frame: 0,
    draw: () => {},
    size: { width: 0, height: 0 },
    // As long as the user hasn't zoomed or panned, fit the view to the graph.
    touched: false,
  });
  const live = useRef({ ...props, dark });
  useLayoutEffect(() => {
    live.current = { ...props, dark };
  });

  const fit = () => {
    const s = state.current;
    const { width, height } = s.size;
    if (s.touched || !width || !s.nodes.length) return;
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const n of s.nodes) {
      x0 = Math.min(x0, n.x! - n.r);
      y0 = Math.min(y0, n.y! - n.r);
      x1 = Math.max(x1, n.x! + n.r);
      y1 = Math.max(y1, n.y! + n.r);
    }
    // The graph fills its pane, with a small margin (no label at rest), rather than a small knot in the middle.
    const k = Math.min(6, Math.max(0.2, Math.min((width - 64) / (x1 - x0 || 1), (height - 64) / (y1 - y0 || 1))));
    s.view = { k, x: (-(x0 + x1) / 2) * k, y: (-(y0 + y1) / 2) * k };
    s.fitK = k;
    s.draw();
  };

  // Data → simulation (keeping the position of already-placed nodes).
  useEffect(() => {
    const s = state.current;
    const previous = new Map(s.nodes.map((n) => [n.id, n]));
    const visible = props.nodes.filter((n) => !props.hidden.has(n.type));
    const ids = new Set(visible.map((n) => n.id));
    const edges = props.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    const degree = new Map<string, number>();
    const neighbors = new Map<string, Set<string>>();
    for (const e of edges) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
      if (!neighbors.has(e.source)) neighbors.set(e.source, new Set());
      if (!neighbors.has(e.target)) neighbors.set(e.target, new Set());
      neighbors.get(e.source)!.add(e.target);
      neighbors.get(e.target)!.add(e.source);
    }
    s.neighbors = neighbors;
    s.nodes = visible.map((n) => {
      const d = degree.get(n.id) ?? 0;
      const old = previous.get(n.id);
      return {
        ...n,
        degree: d,
        // A little bigger the more it's linked, bounded: an agent's links can be every page.
        r: 2.5 + Math.min(Math.sqrt(d) * 0.6, 3.5),
        x: old?.x ?? (Math.random() - 0.5) * 400,
        y: old?.y ?? (Math.random() - 0.5) * 400,
        vx: old?.vx,
        vy: old?.vy,
      };
    });
    const agents = new Set(visible.filter((n) => n.type === "agent").map((n) => n.id));
    s.links = edges.map((e) => ({ source: e.source, target: e.target, authored: agents.has(e.source) || agents.has(e.target) }));

    s.sim?.stop();
    // Laid out as Obsidian's graph: the page links make the clusters. A link weighs less the more links
    // its ends have (d3's default), so a hub doesn't pull the whole vault into one ball. Authorship links
    // weigh by the agent's own count, so one that wrote every page doesn't crush everything around it;
    // it sits in the middle instead, and an agent that wrote a few pages among them.
    const deg = (n: SimNode | string | number) => (n as SimNode).degree || 1;
    // Linked to nothing, a node is held close: pushed far, it would make the fitted view shrink the rest.
    const center = (d: SimNode) => (d.degree === 0 ? 0.2 : d.type === "agent" ?0.06 + 0.4 * Math.min(1, d.degree / (s.nodes.length * 0.3)) : 0.06);
    const sim = forceSimulation<SimNode, SimLink>(s.nodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(s.links)
          .id((d) => d.id)
          .distance(30)
          .strength((l) => (l.authored ? 1 / Math.max(deg(l.source), deg(l.target)) : 0.7 / Math.min(deg(l.source), deg(l.target)))),
      )
      .force("charge", forceManyBody<SimNode>().strength((d) => (d.degree === 0 ? -15 : d.type === "agent" ? -60 : -40 - 12 * Math.sqrt(d.degree))).distanceMax(400))
      .force("collide", forceCollide<SimNode>((d) => d.r + 2.5))
      // A pull toward the center keeps isolated pages in orbit around the rest, as in Obsidian.
      .force("x", forceX<SimNode>(0).strength(center))
      .force("y", forceY<SimNode>(0).strength(center))
      .alpha(previous.size ? 0.4 : 1)
      // Until the user zooms or pans, the view follows the layout so nothing drifts out of the frame.
      .on("tick", () => (s.touched ? s.draw() : fit()))
      .on("end", () => fit());
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      sim.stop();
      sim.tick(300);
      fit();
    }
    s.sim = sim;
    s.draw();
    return () => {
      sim.stop().on("tick", null).on("end", null);
    };
  }, [props.nodes, props.edges, props.hidden]);

  // Drawing, resizing and interactions.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const s = state.current;
    let width = 0;
    let height = 0;

    const render = () => {
      s.frame = 0;
      const { selected, highlight, dark } = live.current;
      paint(ctx, s, { width, height, selected, highlight, dark });
    };

    s.draw = () => {
      if (!s.frame) s.frame = requestAnimationFrame(render);
    };

    const resize = () => {
      // Its layout size, not its painted one: measured while a dialog zooms in, the bitmap would stay
      // smaller than the canvas on screen, and blurry.
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      s.size = { width, height };
      fit();
      s.draw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const toWorld = (e: { clientX: number; clientY: number }) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left - width / 2 - s.view.x) / s.view.k,
        y: (e.clientY - rect.top - height / 2 - s.view.y) / s.view.k,
      };
    };
    const hit = (e: { clientX: number; clientY: number }) => {
      const p = toWorld(e);
      let best: SimNode | null = null;
      let bestD = Infinity;
      for (const n of s.nodes) {
        const d = Math.hypot(n.x! - p.x, n.y! - p.y);
        if (d < Math.max(radius(n, s.view.k) + 4 / s.view.k, 7 / s.view.k) && d < bestD) {
          best = n;
          bestD = d;
        }
      }
      return best;
    };

    let drag: { node: SimNode | null; startX: number; startY: number; viewX: number; viewY: number; moved: boolean } | null = null;

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      const node = hit(e);
      drag = { node, startX: e.clientX, startY: e.clientY, viewX: s.view.x, viewY: s.view.y, moved: false };
      if (node) {
        node.fx = node.x;
        node.fy = node.y;
        s.sim?.alphaTarget(0.25).restart();
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) {
        const node = hit(e);
        if (node !== s.hover) {
          s.hover = node;
          canvas.style.cursor = node ? "pointer" : "grab";
          s.draw();
        }
        return;
      }
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 3) drag.moved = true;
      if (drag.node) {
        const p = toWorld(e);
        drag.node.fx = p.x;
        drag.node.fy = p.y;
      } else {
        s.view.x = drag.viewX + e.clientX - drag.startX;
        s.view.y = drag.viewY + e.clientY - drag.startY;
        s.touched = true;
        canvas.style.cursor = "grabbing";
      }
      s.draw();
    };
    const onUp = () => {
      if (!drag) return;
      if (drag.node) {
        drag.node.fx = null;
        drag.node.fy = null;
        s.sim?.alphaTarget(0);
      }
      if (!drag.moved) live.current.onSelect(drag.node?.id ?? null);
      canvas.style.cursor = s.hover ? "pointer" : "grab";
      drag = null;
    };
    const onLeave = () => {
      if (s.hover) {
        s.hover = null;
        s.draw();
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left - width / 2;
      const my = e.clientY - rect.top - height / 2;
      const k = Math.min(6, Math.max(0.15, s.view.k * Math.exp(-e.deltaY * 0.0015)));
      s.view.x = mx - ((mx - s.view.x) * k) / s.view.k;
      s.view.y = my - ((my - s.view.y) * k) / s.view.k;
      s.view.k = k;
      s.touched = true;
      s.draw();
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(s.frame);
      s.frame = 0;
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, []);

  // Selection or search changed: redraw, and center the chosen node left of the panel.
  useEffect(() => {
    const s = state.current;
    const node = props.selected ? s.nodes.find((n) => n.id === props.selected) : null;
    if (node && node.x !== undefined) {
      const panel = s.size.width >= 640 ? 360 : 0;
      s.view.x = -node.x * s.view.k - panel / 2;
      s.view.y = -node.y! * s.view.k;
      s.touched = true;
    }
    s.draw();
  }, [props.selected, props.highlight, dark]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={t.label}
      className="absolute inset-0 size-full touch-none"
      style={{ cursor: "grab" }}
    />
  );
}
