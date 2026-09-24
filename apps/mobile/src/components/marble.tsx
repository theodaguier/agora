import Svg, { Defs, FeGaussianBlur, Filter, G, Mask, Path, Rect } from "react-native-svg";

/*
 * boring-avatars' "marble" variant (v2.0.4, what the web uses for colleagues without a photo):
 * same hash, same palette, same shapes. react-native-svg has no mix-blend-mode, so the third
 * shape isn't blended "overlay": colors are slightly softer than on the web.
 */

const COLORS = ["#92A1C6", "#146A7C", "#F0AB3D", "#C271B4", "#C20D90"];
const SIZE = 80;

function hashCode(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}
const digit = (n: number, ntn: number) => Math.floor((n / Math.pow(10, ntn)) % 10);
const unit = (n: number, range: number, index?: number) => {
  const value = n % range;
  return index && digit(n, index) % 2 === 0 ? -value : value;
};

function properties(name: string) {
  const n = hashCode(name);
  return Array.from({ length: 3 }, (_, i) => ({
    color: COLORS[(n + i) % COLORS.length]!,
    translateX: unit(n * (i + 1), SIZE / 10, 1),
    translateY: unit(n * (i + 1), SIZE / 10, 2),
    scale: 1.2 + unit(n * (i + 1), SIZE / 20) / 10,
    rotate: unit(n * (i + 1), 360, 1),
  }));
}

export function Marble({ name, size }: { name: string; size: number }) {
  const [a, b, c] = properties(name);
  // The library scales both shapes with the third element's scale: kept as is to draw the same marble.
  const transform = (p: { translateX: number; translateY: number; rotate: number }) =>
    `translate(${p.translateX} ${p.translateY}) rotate(${p.rotate} ${SIZE / 2} ${SIZE / 2}) scale(${c!.scale})`;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${SIZE} ${SIZE}`}>
      <Defs>
        <Mask id="marble" maskUnits="userSpaceOnUse" x="0" y="0" width={SIZE} height={SIZE}>
          <Rect width={SIZE} height={SIZE} rx={SIZE * 2} fill="#FFFFFF" />
        </Mask>
        <Filter id="blur" filterUnits="userSpaceOnUse">
          <FeGaussianBlur stdDeviation={7} />
        </Filter>
      </Defs>
      <G mask="url(#marble)">
        <Rect width={SIZE} height={SIZE} fill={a!.color} />
        <Path filter="url(#blur)" d="M32.414 59.35L50.376 70.5H72.5v-71H33.728L26.5 13.381l19.057 27.08L32.414 59.35z" fill={b!.color} transform={transform(b!)} />
        <Path
          filter="url(#blur)"
          d="M22.216 24L0 46.75l14.108 38.129L78 86l-3.081-59.276-22.378 4.005 12.972 20.186-23.35 27.395L22.215 24z"
          fill={c!.color}
          transform={transform(c!)}
        />
      </G>
    </Svg>
  );
}
