import type { SVGProps } from "react";

/** A filled dot, inside `solid` or `line`. */
export function Dot({ cx, cy, r = 1 }: { cx: number; cy: number; r?: number }) {
  return <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />;
}

/** A filled area hollowed out of `fill`, inside `cut`. */
export function Hole(props: SVGProps<SVGPathElement> & { d: string }) {
  return <path fill="black" stroke="none" {...props} />;
}
