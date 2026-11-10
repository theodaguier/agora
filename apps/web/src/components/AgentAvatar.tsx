import { AgentOrb } from "@/components/AgentOrb";

/** Figma « Avatar agent »: the bot's orb, the one of its colour. */
export function AgentAvatar({ agent, className }: { agent: { avatar: { color: string; shape?: string } }; className?: string }) {
  return <AgentOrb color={agent.avatar.color} className={className ?? "size-10"} />;
}
