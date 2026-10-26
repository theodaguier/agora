import { Children, Fragment, isValidElement, useId, type ReactElement, type ReactNode, type SVGProps } from "react";
import { Hole } from "./shapes";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  /** Width and height, in px or any CSS length. A `size-*` class overrides it. */
  size?: number | string;
};

export type IconComponent = ((props: IconProps) => ReactNode) & { displayName?: string; layers?: IconLayers };

/**
 * The layers of an icon, painted in this order:
 * - `fill`: solid shapes, with `cut` knocked out of them;
 * - `cut`: what is hollowed out of `fill` (strokes, or `<Hole>` for filled areas).
 *   A thick stroke around a shape drawn on top opens the gap that detaches it;
 * - `solid`: solid shapes drawn on top, not cut;
 * - `line`: strokes, for the parts that stay a line (arrows, handles, crosses).
 */
export type IconLayers = { fill?: ReactNode; cut?: ReactNode; solid?: ReactNode; line?: ReactNode };

/** The parts of `cut`, fragments opened. */
function parts(node: ReactNode): ReactElement<{ strokeWidth?: number | string; stroke?: string; fill?: string }>[] {
  return Children.toArray(node).flatMap((child) =>
    isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment ? parts(child.props.children) : isValidElement(child) ? [child as ReactElement<{ strokeWidth?: number | string }>] : [],
  );
}

/** A filled area cut out (`<Hole>`, or a path filled black), rather than a stroke. */
const isHole = (part: ReactElement<{ fill?: string }>) => part.type === Hole || part.props.fill === "black";

/** A wide cut only opens the gap that detaches a shape drawn on top: it is not a detail of its own. */
const isGap = (part: ReactElement<{ strokeWidth?: number | string }>) => Number(part.props.strokeWidth ?? 0) >= 3;

/**
 * The house icon style: rounded and two-tone, in the spirit of Hugeicons "duotone rounded".
 * 24px grid, soft corners, round caps and curved arrowheads for what stays a line.
 * Two tones of `currentColor`: the body (`fill`) in the light tone (`--icon-tone`, 40% by
 * default), its details (`cut`), what sits on top (`solid`) and the lines in the full one.
 */
export function createIcon(name: string, { fill, cut, solid, line }: IconLayers): IconComponent {
  function Icon({ size = 24, strokeWidth = 1.75, ...props }: IconProps) {
    const mask = `icon-${useId().replace(/[^\w-]/g, "")}`;
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="currentColor"
        stroke="none"
        aria-hidden="true"
        data-glyph={name}
        {...props}
      >
        {cut && (
          <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
            <rect width="24" height="24" fill="white" />
            <g fill="none" stroke="black" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
              {cut}
            </g>
          </mask>
        )}
        {fill && (
          <g mask={cut ? `url(#${mask})` : undefined} opacity={0.4} style={{ opacity: "var(--icon-tone, 0.4)" }}>
            {fill}
          </g>
        )}
        {/* The details hollowed out of the body come back in the full tone (not the gaps around shapes on top). */}
        {cut && (
          <g fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
            {parts(cut)
              .filter((part) => !isGap(part))
              .map((part, i) => (isHole(part) ? <path key={i} {...part.props} fill="currentColor" stroke="none" /> : <part.type key={i} {...part.props} />))}
          </g>
        )}
        {solid}
        {line && (
          <g fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
            {line}
          </g>
        )}
      </svg>
    );
  }
  Icon.displayName = `${name.replace(/(^|-)(\w)/g, (_, _d, c: string) => c.toUpperCase())}Icon`;
  // The drawing itself, for exports (the Figma library is built from it).
  Icon.layers = { fill, cut, solid, line };
  return Icon;
}

/** A circle as path data, for `<Hole>`. */
export const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
