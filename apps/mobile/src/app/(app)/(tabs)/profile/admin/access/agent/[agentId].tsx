import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { Typography } from "heroui-native";
import { useState } from "react";
import { useSaveAccess } from "@/components/admin/access";
import { accessMessages } from "@/components/admin/access-summary";
import { AdminGate, ErrorAlert, LoadingRows, SearchBox, Section, SettingsScroll, SwitchRow } from "@/components/admin/ui";
import { PersonAvatar } from "@/components/conversation-avatar";
import { adminAgentsQuery, adminUsersQuery } from "@/lib/admin";
import { MenuButton } from "@/components/menus";

/* Access seen from one agent: who can use it. Same API as the web (each employee's agent list). */

export default function AgentAccess() {
  const t = accessMessages;
  const { agentId } = useLocalSearchParams<{ agentId: string }>();
  const users = useQuery(adminUsersQuery);
  const agents = useQuery(adminAgentsQuery);
  const save = useSaveAccess();
  const [q, setQ] = useState("");
  const agent = agents.data?.find((a) => a.id === agentId);
  const people = users.data ?? [];
  const shown = people.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (userId: string, on: boolean) => {
    const u = people.find((x) => x.id === userId);
    if (u) save.mutate([{ userId, agentIds: on ? [...u.agents.filter((x) => x !== agentId), agentId] : u.agents.filter((x) => x !== agentId) }]);
  };
  const setAll = (on: boolean) =>
    save.mutate(
      people
        .filter((u) => u.agents.includes(agentId) !== on)
        .map((u) => ({ userId: u.id, agentIds: on ? [...u.agents, agentId] : u.agents.filter((x) => x !== agentId) })),
    );
  const n = people.filter((u) => u.agents.includes(agentId)).length;

  return (
    <>
      <Stack.Screen.Title>{agent?.name ?? t.title}</Stack.Screen.Title>
      {agent && people.length > 0 && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.View>
            <MenuButton
              icon="ellipsis"
              label={t.people}
              actions={[
                { label: t.allPeopleOn, icon: "checkmark.circle", disabled: n === people.length, onPress: () => setAll(true) },
                { label: t.allPeopleOff, icon: "xmark.circle", destructive: true, disabled: n === 0, onPress: () => setAll(false) },
              ]}
            />
          </Stack.Toolbar.View>
        </Stack.Toolbar>
      )}
      <AdminGate>
        <SettingsScroll onRefresh={() => Promise.all([users.refetch(), agents.refetch()])}>
          {people.length > 0 && <SearchBox value={q} onChange={setQ} placeholder={t.searchPeople} />}
          {!agent || !users.data ? (
            users.error || agents.error ? (
              <ErrorAlert error={users.error ?? agents.error} />
            ) : (
              <LoadingRows rows={4} />
            )
          ) : shown.length === 0 ? (
            <Typography.Paragraph type="body-sm" color="muted" align="center" className="px-4 py-8">{t.noMatch}</Typography.Paragraph>
          ) : (
            <Section title={t.people} footer={n === 0 ? t.nobody : n === people.length ? t.everyone : t.somePeople(n, people.length)}>
              {shown.map((u) => (
                <SwitchRow
                  key={u.id}
                  title={u.name}
                  description={u.email}
                  value={u.agents.includes(agentId)}
                  prefix={<PersonAvatar person={u} className="size-8" />}
                  onChange={(on) => toggle(u.id, on)}
 />
              ))}
            </Section>
          )}
        </SettingsScroll>
      </AdminGate>
    </>
  );
}
