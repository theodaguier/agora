import { cn } from "@/lib/utils";
import { mascot } from "@/lib/agent-avatar";

/**
 * Figma « Avatar agent »: the bot's clay mascot, the one of its colour, cut out on a disc that follows the theme.
 */
export function AgentAvatar({ agent, className }: { agent: { avatar: { color: string; shape?: string } }; className?: string }) {
  return (
    <img
      src={mascot(agent.avatar.color).head}
      alt=""
      aria-hidden
      draggable={false}
      className={cn("shrink-0 rounded-full bg-mascot object-cover", className ?? "size-10")}
    />
  );
}
