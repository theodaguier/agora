import { cn } from "@/lib/utils";
import { avatarShapes, type AvatarShape } from "@/lib/agent-avatar";

/** Small colored creature, one shape and one color per agent. */
export function AgentAvatar({ agent, className }: { agent: { avatar: { shape: AvatarShape; color: string } }; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("shrink-0", className ?? "size-10")} aria-hidden>
      <path d={avatarShapes[agent.avatar.shape] ?? avatarShapes.bean} fill={agent.avatar.color} />
      <ellipse cx="12.5" cy="17.5" rx="1.5" ry="2.1" fill="#141414" />
      <ellipse cx="19.5" cy="17.5" rx="1.5" ry="2.1" fill="#141414" />
    </svg>
  );
}
