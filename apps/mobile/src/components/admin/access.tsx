import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Chip } from "heroui-native";
import { View } from "react-native";
import { useAdminToast } from "@/components/admin/ui";
import { AgentAvatar } from "@/components/agent-avatar";
import { api } from "@/lib/api";
import { adminUsersQuery, type AdminAgent, type AdminUser } from "@/lib/admin";
import { agentsQuery } from "@/lib/queries";
import { agentSpec } from "@/components/admin/access-summary";

/* apps/web/src/components/admin/Access.tsx: shared parts of the access screens. */

/** Replaces the agents of one or more employees, optimistically (PUT /admin/users/:id/agents). */
export function useSaveAccess() {
  const qc = useQueryClient();
  const toast = useAdminToast();
  return useMutation({
    mutationFn: (changes: { userId: string; agentIds: string[] }[]) =>
      Promise.all(changes.map(({ userId, agentIds }) => api(`/admin/users/${encodeURIComponent(userId)}/agents`, { method: "PUT", body: JSON.stringify({ agentIds }) }))),
    onMutate: (changes) => {
      Haptics.selectionAsync();
      qc.setQueryData<AdminUser[]>(adminUsersQuery.queryKey, (xs) =>
        xs?.map((u) => {
          const change = changes.find((c) => c.userId === u.id);
          return change ? { ...u, agents: change.agentIds } : u;
        }),
      );
    },
    onError: (e) => toast.failed(e),
    onSettled: () => Promise.all([qc.invalidateQueries({ queryKey: adminUsersQuery.queryKey }), qc.invalidateQueries({ queryKey: agentsQuery.queryKey })]),
  });
}

/** Avatars shown in a row before "+n". */
const STACK = 3;

/** The employee's agents as overlapping avatars. */
export function AgentStack({ agents }: { agents: AdminAgent[] }) {
  if (!agents.length) return null;
  return (
    <View className="flex-row items-center" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {agents.slice(0, STACK).map((a, i) => (
        <View key={a.id} className={i > 0 ? "-ml-2" : undefined}>
          <AgentAvatar agent={agentSpec(a)} size={24} />
        </View>
      ))}
      {agents.length > STACK && (
        <Chip size="sm" variant="secondary" className="-ml-1">
          <Chip.Label>+{agents.length - STACK}</Chip.Label>
        </Chip>
      )}
    </View>
  );
}
