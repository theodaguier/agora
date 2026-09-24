import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { Typography } from "heroui-native";
import { useState } from "react";
import { useSaveAccess } from "@/components/admin/access";
import { accessMessages, accessSummary, agentSpec } from "@/components/admin/access-summary";
import { AdminGate, ErrorAlert, LoadingRows, SearchBox, Section, SettingsScroll, SwitchRow } from "@/components/admin/ui";
import { AgentAvatar } from "@/components/agent-avatar";
import { adminAgentsQuery, adminUsersQuery } from "@/lib/admin";
import { MenuButton } from "@/components/menus";

/* apps/web/src/components/admin/Access.tsx `UserAccess` popover, as a screen: one switch per agent. */

export default function UserAccess() {
  const t = accessMessages;
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const users = useQuery(adminUsersQuery);
  const agents = useQuery(adminAgentsQuery);
  const save = useSaveAccess();
  const [q, setQ] = useState("");
  const user = users.data?.find((u) => u.id === userId);
  const all = agents.data ?? [];
  const granted = new Set(user?.agents);
  const everything = !!user && all.length > 0 && all.every((a) => granted.has(a.id));
  const shown = all.filter((a) => a.name.toLowerCase().includes(q.trim().toLowerCase()));
  const set = (agentIds: string[]) => user && save.mutate([{ userId: user.id, agentIds }]);

  return (
    <>
      <Stack.Screen.Title>{user?.name ?? t.title}</Stack.Screen.Title>
      {user && all.length > 0 && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.View>
            <MenuButton
              icon="ellipsis"
              label={t.agents}
              actions={[
                { label: t.allOn, icon: "checkmark.circle", disabled: everything, onPress: () => set(all.map((a) => a.id)) },
                { label: t.allOff, icon: "xmark.circle", destructive: true, disabled: user.agents.length === 0, onPress: () => set([]) },
              ]}
            />
          </Stack.Toolbar.View>
        </Stack.Toolbar>
      )}
      <AdminGate>
        <SettingsScroll onRefresh={() => Promise.all([users.refetch(), agents.refetch()])}>
          {all.length > 0 && <SearchBox value={q} onChange={setQ} placeholder={t.search} />}
          {!user || !agents.data ? (
            users.error || agents.error ? (
              <ErrorAlert error={users.error ?? agents.error} />
            ) : (
              <LoadingRows rows={4} />
            )
          ) : shown.length === 0 ? (
            <Typography.Paragraph type="body-sm" color="muted" align="center" className="px-4 py-8">{q ? t.noMatch : t.noAgents}</Typography.Paragraph>
          ) : (
            <Section title={t.agents} footer={accessSummary(user, all)}>
              {shown.map((a) => {
                const on = granted.has(a.id);
                return (
                  <SwitchRow
                    key={a.id}
                    title={a.name}
                    value={on}
                    prefix={<AgentAvatar agent={agentSpec(a)} size={32} />}
                    onChange={(next) => set(next ? [...user.agents.filter((x) => x !== a.id), a.id] : user.agents.filter((x) => x !== a.id))}
 />
                );
              })}
            </Section>
          )}
        </SettingsScroll>
      </AdminGate>
    </>
  );
}
