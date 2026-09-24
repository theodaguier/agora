import { useId, type ReactNode } from "react";
import Svg, { Circle, G, Mask, Path, Rect, type PathProps } from "react-native-svg";
import { useResolveClassNames } from "uniwind";

/*
 * apps/web/src/components/icons/create-icon.tsx for React Native: same layers and paths.
 * `className` sets the size (`size-4`) and the color (`text-muted-foreground`), like on the web.
 */

export type IconProps = {
  className?: string;
  /** Width and height in px; a `size-*` class overrides it. */
  size?: number;
  color?: string;
  strokeWidth?: number;
};

export type IconComponent = ((props: IconProps) => ReactNode) & { displayName?: string };

/**
 * The layers of an icon, painted in this order:
 * - `fill`: solid shapes, with `cut` knocked out of them;
 * - `cut`: what is hollowed out of `fill` (strokes, or `<Hole>` for filled areas);
 * - `solid`: solid shapes drawn on top, not cut;
 * - `line`: strokes, for the parts that stay a line (arrows, handles, crosses).
 */
export type IconLayers = { fill?: ReactNode; cut?: ReactNode; solid?: ReactNode; line?: ReactNode };

/** The house icon style: solid and rounded, 24px grid, `currentColor` = the text color of `className`. */
export function createIcon(name: string, { fill, cut, solid, line }: IconLayers): IconComponent {
  function Icon({ className, size = 24, color, strokeWidth = 1.75 }: IconProps) {
    const style = useResolveClassNames(className ?? "") as { width?: number; color?: string };
    const px = typeof style.width === "number" ? style.width : size;
    const ink = color ?? style.color ?? "#000";
    const mask = `icon-${useId().replace(/[^\w-]/g, "")}`;
    return (
      <Svg width={px} height={px} viewBox="0 0 24 24" fill={ink} stroke="none" color={ink}>
        {cut && (
          <Mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
            <Rect width="24" height="24" fill="white" />
            <G fill="none" stroke="black" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
              {cut}
            </G>
          </Mask>
        )}
        {fill && <G mask={cut ? `url(#${mask})` : undefined}>{fill}</G>}
        {solid}
        {line && (
          <G fill="none" stroke={ink} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
            {line}
          </G>
        )}
      </Svg>
    );
  }
  Icon.displayName = `${name.replace(/(^|-)(\w)/g, (_, _d, c: string) => c.toUpperCase())}Icon`;
  return Icon;
}

/** A filled dot, inside `solid` or `line`. */
export function Dot({ cx, cy, r = 1 }: { cx: number; cy: number; r?: number }) {
  return <Circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />;
}

/** A filled area hollowed out of `fill`, inside `cut`. */
export function Hole(props: PathProps & { d: string }) {
  return <Path fill="black" stroke="none" {...props} />;
}

/** A circle as path data, for `<Hole>`. */
export const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
