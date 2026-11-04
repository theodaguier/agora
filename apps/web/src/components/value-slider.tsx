import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { cn } from "@/lib/utils";

const TICKS = 9;

/**
 * A slider as a field: a grey bar filled up to the value, its label written inside in small
 * capitals, ticks behind, the value at the end, a thin handle on the edge of the fill. Built on
 * Base UI's Slider, the primitive under shadcn's.
 */
export function ValueSlider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  format = String,
  onValueChange,
  onValueCommitted,
  className,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  format?: (value: number) => string;
  onValueChange: (value: number) => void;
  onValueCommitted?: (value: number) => void;
  className?: string;
}) {
  const one = (v: number | readonly number[]) => (Array.isArray(v) ? v[0]! : (v as number));
  return (
    <SliderPrimitive.Root
      data-slot="value-slider"
      value={value}
      min={min}
      max={max}
      step={step}
      thumbAlignment="edge"
      onValueChange={(v) => onValueChange(one(v))}
      onValueCommitted={onValueCommitted && ((v) => onValueCommitted(one(v)))}
      className={cn("w-full", className)}
    >
      <SliderPrimitive.Control className="relative flex h-10 w-full cursor-ew-resize touch-none items-center overflow-hidden rounded-lg bg-muted select-none data-disabled:opacity-50">
        <SliderPrimitive.Track className="h-full w-full">
          <SliderPrimitive.Indicator className="bg-foreground/15" />
        </SliderPrimitive.Track>
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center">
          <div className="absolute inset-0 flex items-center justify-evenly">
            {Array.from({ length: TICKS }, (_, i) => (
              <span key={i} className="h-3 w-px bg-foreground/20" />
            ))}
          </div>
          <span className="relative pl-3 font-mono text-xs tracking-widest uppercase">{label}</span>
          <span className="relative ml-auto pr-3 font-mono text-xs text-muted-foreground tabular-nums">{format(value)}</span>
        </div>
        <SliderPrimitive.Thumb
          aria-label={label}
          className="h-5 w-0.5 rounded-full bg-foreground/50 outline-none after:absolute after:-inset-x-2 after:-inset-y-3 focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}
