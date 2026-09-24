import { Image } from "expo-image";
import { Avatar } from "heroui-native";
import { AgentAvatar, AgentShape, useSize } from "@/components/agent-avatar";
import { cn } from "@/lib/utils";

const MARK = { avatar: { shape: "bean", color: "#9a6a4b" } } as const;

/** The organization's logo (Settings › Organization), otherwise the default mark. apps/web/src/components/OrgLogo.tsx */
export function OrgLogo({ server, image, className }: { server?: string; image?: string | null; className?: string }) {
  const size = useSize(className ?? "size-14", 56);
  if (!server || !image) return <AgentAvatar agent={MARK} className={className} size={size} />;
  return (
    <Avatar alt="" variant="soft" color="default" className={cn("shrink-0", className)} style={{ width: size, height: size }}>
      <Avatar.Image source={{ uri: `${server}${image}` }} asChild>
        <Image style={{ width: "100%", height: "100%" }} contentFit="cover" />
      </Avatar.Image>
      <Avatar.Fallback animation="disabled">
        <AgentShape agent={MARK} size={size} />
      </Avatar.Fallback>
    </Avatar>
  );
}
