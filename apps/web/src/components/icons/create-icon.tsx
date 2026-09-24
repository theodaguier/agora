import { useId, type ReactNode, type SVGProps } from "react";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  /** Width and height, in px or any CSS length. A `size-*` class overrides it. */
  size?: number | string;
};

export type IconComponent = ((props: IconProps) => ReactNode) & { displayName?: string };

/**
 * The layers of an icon, painted in this order:
 * - `fill`: solid shapes, with `cut` knocked out of them;
 * - `cut`: what is hollowed out of `fill` (strokes, or `<Hole>` for filled areas).
 *   A thick stroke around a shape drawn on top opens the gap that detaches it;
 * - `solid`: solid shapes drawn on top, not cut;
 * - `line`: strokes, for the parts that stay a line (arrows, handles, crosses).
 */
export type IconLayers = { fill?: ReactNode; cut?: ReactNode; solid?: ReactNode; line?: ReactNode };

/**
 * The house icon style: solid and rounded, in the spirit of Hugeicons "solid rounded".
 * 24px grid, filled shapes with soft corners, details hollowed out rather than drawn,
 * round caps and curved arrowheads for what stays a line. Every icon uses `currentColor`.
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
        {fill && <g mask={cut ? `url(#${mask})` : undefined}>{fill}</g>}
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
  return Icon;
}

/** A circle as path data, for `<Hole>`. */
export const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
