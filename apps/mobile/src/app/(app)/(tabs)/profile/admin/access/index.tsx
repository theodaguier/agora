import { useQuery } from "@tanstack/react-query";
import { Link, Stack } from "expo-router";
import { ListGroup, Tabs, Typography } from "heroui-native";
import { useState } from "react";
import { AgentStack } from "@/components/admin/access";
import { accessMessages, accessSummary, agentSpec } from "@/components/admin/access-summary";
import { AdminGate, ErrorAlert, Intro, LoadingRows, PressableRow, Section, SettingsScroll } from "@/components/admin/ui";
import { AgentAvatar } from "@/components/agent-avatar";
import { PersonAvatar } from "@/components/conversation-avatar";
import { adminAgentsQuery, adminUsersQuery } from "@/lib/admin";
import { haptic } from "@/lib/haptics";

/* apps/web/src/components/admin/Access.tsx: by person (like the web) or by agent. */

export default function Access() {
  return (
    <>
      <Stack.Screen.Title>{accessMessages.title}</Stack.Screen.Title>
      <AdminGate>
        <AccessLists />
      </AdminGate>
    </>
  );
}

function AccessLists() {
  const t = accessMessages;
  const [view, setView] = useState("people");
  const users = useQuery(adminUsersQuery);
  const agents = useQuery(adminAgentsQuery);
  const error = users.error ?? agents.error;
  const ready = users.data && agents.data;

  return (
    <SettingsScroll onRefresh={() => Promise.all([users.refetch(), agents.refetch()])}>
      <Intro>{t.text}</Intro>
      <Tabs value={view} onValueChange={(v) => (haptic.select(), setView(v))}>
        <Tabs.List className="w-full">
          <Tabs.Indicator />
          <Tabs.Trigger value="people" className="flex-1">
            <Tabs.Label>{t.people}</Tabs.Label>
          </Tabs.Trigger>
          <Tabs.Trigger value="agents" className="flex-1">
            <Tabs.Label>{t.agents}</Tabs.Label>
          </Tabs.Trigger>
        </Tabs.List>
      </Tabs>

      {!ready ? (
        error ? (
          <ErrorAlert error={error} />
        ) : (
          <LoadingRows rows={4} />
        )
      ) : view === "people" ? (
        <Section>
          {users.data.map((u) => (
            <Link key={u.id} href={{ pathname: "/profile/admin/access/user/[userId]", params: { userId: u.id } }} asChild>
              <PressableRow>
                <ListGroup.ItemPrefix>
                  <PersonAvatar person={u} className="size-10" />
                </ListGroup.ItemPrefix>
                <ListGroup.ItemContent>
                  <ListGroup.ItemTitle numberOfLines={1}>{u.name}</ListGroup.ItemTitle>
                  <ListGroup.ItemDescription>{accessSummary(u, agents.data)}</ListGroup.ItemDescription>
                </ListGroup.ItemContent>
                <AgentStack agents={agents.data.filter((a) => u.agents.includes(a.id))} />
                <ListGroup.ItemSuffix />
              </PressableRow>
            </Link>
          ))}
        </Section>
      ) : agents.data.length === 0 ? (
        <Typography.Paragraph type="body-sm" color="muted" align="center" className="px-4 py-8">{t.noAgents}</Typography.Paragraph>
      ) : (
        <Section>
          {agents.data.map((a) => {
            const n = users.data.filter((u) => u.agents.includes(a.id)).length;
            const total = users.data.length;
            return (
              <Link key={a.id} href={{ pathname: "/profile/admin/access/agent/[agentId]", params: { agentId: a.id } }} asChild>
                <PressableRow>
                  <ListGroup.ItemPrefix>
                    <AgentAvatar agent={agentSpec(a)} size={40} />
                  </ListGroup.ItemPrefix>
                  <ListGroup.ItemContent>
                    <ListGroup.ItemTitle numberOfLines={1}>{a.name}</ListGroup.ItemTitle>
                    <ListGroup.ItemDescription>{n === 0 ? t.nobody : n === total ? t.everyone : t.somePeople(n, total)}</ListGroup.ItemDescription>
                  </ListGroup.ItemContent>
                  <ListGroup.ItemSuffix />
                </PressableRow>
              </Link>
            );
          })}
        </Section>
      )}
    </SettingsScroll>
  );
}
