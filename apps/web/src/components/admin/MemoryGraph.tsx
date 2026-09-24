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
import { nodeColor, type WikiEdge, type WikiNode, type WikiNodeType } from "@/lib/wiki-graph";

const messages = defineMessages({
  en: { label: "Company memory graph: wiki pages and the links between them" },
  fr: { label: "Graphe de la mémoire d'entreprise : pages du wiki et liens entre elles" },
});

type SimNode = SimulationNodeDatum & WikiNode & { degree: number; r: number };
type SimLink = SimulationLinkDatum<SimNode>;

const INK = {
  dark: { edge: "rgba(255,255,255,0.09)", edgeFocus: "rgba(255,255,255,0.42)", ring: "#ffffff", label: "#e6e6e6" },
  light: { edge: "rgba(0,0,0,0.1)", edgeFocus: "rgba(0,0,0,0.45)", ring: "#171717", label: "#262626" },
};

/**
 * Memory graph, in the style of Obsidian's graph view: force simulation
 * (d3-force) drawn on a canvas. Wheel = zoom, drag background = pan,
 * drag a node = reposition it, click = open the page.
 */
/** Draws the graph: edges, nodes, then labels; the hovered or selected node's neighborhood stands out. */
function paint(
  ctx: CanvasRenderingContext2D,
  s: { nodes: SimNode[]; links: SimLink[]; neighbors: Map<string, Set<string>>; view: { x: number; y: number; k: number }; hover: SimNode | null },
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
  const focus = focusId ? new Set([focusId, ...(s.neighbors.get(focusId) ?? [])]) : null;
  const lit = (id: string) => (focus ? focus.has(id) : highlight ? highlight.has(id) : true);

  ctx.lineWidth = 0.7 / view.k;
  ctx.strokeStyle = ink.edge;
  ctx.beginPath();
  for (const l of s.links) {
    const a = l.source as SimNode;
    const b = l.target as SimNode;
    if (focus && (a.id === focusId || b.id === focusId)) continue;
    ctx.moveTo(a.x!, a.y!);
    ctx.lineTo(b.x!, b.y!);
  }
  ctx.stroke();
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

  for (const n of s.nodes) {
    ctx.globalAlpha = lit(n.id) ? 1 : 0.14;
    ctx.fillStyle = nodeColor(n.type, dark);
    ctx.beginPath();
    ctx.arc(n.x!, n.y!, n.r, 0, Math.PI * 2);
    ctx.fill();
    if (n.id === selected) {
      ctx.strokeStyle = ink.ring;
      ctx.lineWidth = 1.5 / view.k;
      ctx.beginPath();
      ctx.arc(n.x!, n.y!, n.r + 3 / view.k, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Labels: when zoomed in, on the hovered neighborhood, and always for large nodes.
  ctx.font = `${11 / view.k}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const n of s.nodes) {
    const show = focus ? focus.has(n.id) : view.k > 1.6 || n.degree >= 8 || n.type === "agent" || !!highlight?.has(n.id);
    if (!show) continue;
    ctx.globalAlpha = focus && n.id !== focusId ? 0.8 : lit(n.id) ? 0.95 : 0.3;
    ctx.fillStyle = ink.label;
    const label = n.label.length > 36 ? `${n.label.slice(0, 35)}…` : n.label;
    ctx.fillText(label, n.x!, n.y! + n.r + 3 / view.k);
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
    const k = Math.min(1.5, Math.max(0.2, Math.min((width - 80) / (x1 - x0 || 1), (height - 120) / (y1 - y0 || 1))));
    s.view = { k, x: (-(x0 + x1) / 2) * k, y: (-(y0 + y1) / 2) * k };
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
        r: (n.type === "agent" ? 5 : 2.6) + Math.sqrt(d) * (n.type === "agent" ? 1.6 : 1.25),
        x: old?.x ?? (Math.random() - 0.5) * 400,
        y: old?.y ?? (Math.random() - 0.5) * 400,
        vx: old?.vx,
        vy: old?.vy,
      };
    });
    s.links = edges.map((e) => ({ source: e.source, target: e.target }));

    s.sim?.stop();
    const sim = forceSimulation<SimNode, SimLink>(s.nodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(s.links)
          .id((d) => d.id)
          .distance((l) => ((l.source as SimNode).type === "agent" || (l.target as SimNode).type === "agent" ? 70 : 38))
          .strength(0.35),
      )
      .force("charge", forceManyBody<SimNode>().strength((d) => (d.type === "agent" ? -260 : -55)).distanceMax(420))
      .force("collide", forceCollide<SimNode>((d) => d.r + 2))
      // A pull toward the center keeps isolated pages in orbit, like in Obsidian.
      .force("x", forceX<SimNode>(0).strength(0.035))
      .force("y", forceY<SimNode>(0).strength(0.035))
      .alpha(previous.size ? 0.4 : 1)
      .on("tick", () => s.draw())
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
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
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
        if (d < Math.max(n.r + 4 / s.view.k, 7 / s.view.k) && d < bestD) {
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
