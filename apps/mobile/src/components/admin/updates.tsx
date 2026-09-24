import { Chip } from "heroui-native";
import { updatesMessages } from "@/components/admin/updates-messages";
import type { UpdateRun } from "@/lib/admin";

/* apps/web/src/components/admin/Updates.tsx: shared parts of the updates screens. */

const chipColor = { running: "accent", succeeded: "success", rolled_back: "warning", failed: "danger" } as const;

/** The outcome of an update run, in a Chip. */
export function RunStatusChip({ status }: { status: UpdateRun["status"] }) {
  return (
    <Chip size="sm" variant="soft" color={chipColor[status]}>
      <Chip.Label>{updatesMessages.status[status]}</Chip.Label>
    </Chip>
  );
}
