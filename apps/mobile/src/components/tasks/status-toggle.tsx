import * as Haptics from "expo-haptics";
import { Checkbox } from "heroui-native";
import { defineMessages } from "@/lib/i18n";
import type { TaskStatus } from "@/lib/tasks";

const messages = defineMessages({
  en: { reopen: "Move back to to-do", complete: "Mark as done" },
  fr: { reopen: "Remettre à faire", complete: "Marquer comme terminée" },
});

/**
 * The task's HeroUI checkbox: checked when done. A tap completes the task, or moves a done one
 * back to to-do (the web's checkbox); "in progress" is told by the row's chip.
 */
export function StatusToggle({ status, disabled, onChange }: { status: TaskStatus; disabled?: boolean; onChange: (status: TaskStatus) => void }) {
  const done = status === "done";
  return (
    <Checkbox
      hitSlop={10}
      isSelected={done}
      isDisabled={disabled}
      accessibilityLabel={done ? messages.reopen : messages.complete}
      onSelectedChange={(checked) => {
        if (checked) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        else void Haptics.selectionAsync();
        onChange(checked ? "done" : "todo");
      }}
    />
  );
}
