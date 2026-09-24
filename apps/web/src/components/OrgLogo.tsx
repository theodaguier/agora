import { useQuery } from "@tanstack/react-query";
import { AgentAvatar } from "@/components/AgentAvatar";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { orgQuery } from "@/lib/org";
import { cn } from "@/lib/utils";

/** The organization's logo (Settings › Organization), otherwise the default mark. */
export function OrgLogo({ className }: { className?: string }) {
  const { data } = useQuery(orgQuery);
  if (!data?.image) return <AgentAvatar agent={{ avatar: { shape: "bean", color: "#9a6a4b" } }} className={className} />;
  return (
    <Avatar className={cn("size-14", className)}>
      <AvatarImage src={data.image} alt={data.name} />
    </Avatar>
  );
}
