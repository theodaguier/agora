import { Avatar } from "heroui-native";
import { View } from "react-native";
import { PersonAvatar } from "@/components/conversation-avatar";
import type { TaskAssignee } from "@/lib/tasks";
import { cn } from "@/lib/utils";

const FACES = 3;

/**
 * Who works on the task, as overlapping HeroUI avatars (apps/web/src/components/TaskList.tsx `Participants`),
 * composed like HeroUI's avatar group example: a background-colored ring, and a "+N" Avatar for the rest.
 */
export function AssigneeFaces({ assignees, size = 24 }: { assignees: TaskAssignee[]; size?: number }) {
  const face = size + 4;
  return (
    <View className="flex-row items-center" accessibilityLabel={assignees.map((a) => a.name).join(", ")}>
      {assignees.slice(0, FACES).map((a, i) => (
        <PersonAvatar key={a.id} person={a} size={face} className={cn("border-2 border-background", i > 0 && "-ms-2")} />
      ))}
      {assignees.length > FACES && (
        <Avatar alt="" size="sm" variant="soft" color="default" className="-ms-2 border-2 border-background" style={{ width: face, height: face }}>
          <Avatar.Fallback>+{assignees.length - FACES}</Avatar.Fallback>
        </Avatar>
      )}
    </View>
  );
}
