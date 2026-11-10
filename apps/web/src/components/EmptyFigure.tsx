import { AGENT_COLORS, AGENT_MASCOTS, type AgentMascot } from "@agora/core";
import { AgentOrb } from "@/components/AgentOrb";
import { EmptyMedia } from "@/components/ui/empty";

/** A bot's orb, large, as the picture of an empty state (Figma « État vide », Grand). */
export function EmptyFigure({ mascot }: { mascot: AgentMascot }) {
  return (
    <EmptyMedia>
      <AgentOrb color={AGENT_COLORS[AGENT_MASCOTS.indexOf(mascot)]!} className="size-20" />
    </EmptyMedia>
  );
}
