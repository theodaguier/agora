import { agentAccentColor, shade } from "@agora/core";
import { useId } from "react";
import { cn } from "@/lib/utils";

const FILL = { width: "100%", height: "100%" } as const;

/**
 * A bot's face (Figma « Atelier · Théo », proposition en Geist): a soft sphere in its palette colour,
 * lit from the top left. Drawn inside a sized box, so containers that size their icons
 * (`[&_svg]:size-4` in the sidebar, buttons, menus) can't shrink it.
 */
export function AgentOrb({ color, className }: { color: string; className?: string }) {
  const id = useId().replace(/[^\w-]/g, "");
  const base = agentAccentColor(color);
  return (
    <span aria-hidden className={cn("inline-block shrink-0", className ?? "size-10")}>
      <svg viewBox="0 0 64 64" className="block" style={FILL}>
        <defs>
          <radialGradient id={id} cx="0.4" cy="0.38" r="0.66">
            <stop offset="0" stopColor={shade(base, 255, 0.22)} />
            <stop offset="0.6" stopColor={base} />
            <stop offset="1" stopColor={shade(base, 0, 0.3)} />
          </radialGradient>
        </defs>
        <circle cx="32" cy="32" r="32" fill={`url(#${id})`} />
      </svg>
    </span>
  );
}
