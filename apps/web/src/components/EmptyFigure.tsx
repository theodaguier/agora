import type { AgentMascot } from "@agora/core";
import { EmptyMedia } from "@/components/ui/empty";

/** A clay mascot, cut out, as the picture of an empty state (Figma « État vide », Grand). */
export function EmptyFigure({ mascot }: { mascot: AgentMascot }) {
  return (
    <EmptyMedia variant="figure">
      <img src={`/mascots/${mascot}-solo.webp`} alt="" draggable={false} />
    </EmptyMedia>
  );
}
