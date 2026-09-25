import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Stack } from "expo-router";
import { ListGroup } from "heroui-native";
import { HostClis, LocalModels, SubscriptionAccountsSection } from "@/components/admin/models";
import { modelsMessages, modelsSummary, providersFor } from "@/components/admin/models-summary";
import { Providers } from "@/components/admin/providers";
import { AdminGate, ErrorAlert, Intro, LoadingRows, PressableRow, Section, SettingsScroll } from "@/components/admin/ui";
import { PersonAvatar } from "@/components/conversation-avatar";
import { adminModelsQuery, adminUsersQuery, hostClisQuery, hostModelsQuery, providersQuery, subscriptionAccountsQuery } from "@/lib/admin";

/* apps/web/src/components/admin/Models.tsx */

export default function Models() {
  return (
    <>
      <Stack.Screen.Title>{modelsMessages.title}</Stack.Screen.Title>
      <AdminGate>
        <ModelsLists />
      </AdminGate>
    </>
  );
}

function ModelsLists() {
  const t = modelsMessages;
  const qc = useQueryClient();
  const users = useQuery(adminUsersQuery);
  const models = useQuery(adminModelsQuery);

  return (
    <SettingsScroll
      onRefresh={() =>
        Promise.all([
          users.refetch(),
          models.refetch(),
          qc.invalidateQueries({ queryKey: providersQuery.queryKey }),
          qc.invalidateQueries({ queryKey: hostModelsQuery.queryKey }),
          qc.invalidateQueries({ queryKey: hostClisQuery.queryKey }),
          qc.invalidateQueries({ queryKey: subscriptionAccountsQuery("claude").queryKey }),
          qc.invalidateQueries({ queryKey: subscriptionAccountsQuery("codex").queryKey }),
        ])
      }
 >
      <Intro>{t.text}</Intro>
      <Providers />
      {models.isError ? (
        <ErrorAlert title={t.listFailed} error={models.error} />
      ) : !models.data || !users.data ? (
        <LoadingRows rows={4} />
      ) : (
        <Section title={t.people} footer={models.data.unreachable > 0 ? t.unreachable(models.data.unreachable) : undefined}>
          {users.data.map((u) => (
            <Link key={u.id} href={{ pathname: "/profile/admin/models/[userId]", params: { userId: u.id } }} asChild>
              <PressableRow>
                <ListGroup.ItemPrefix>
                  <PersonAvatar person={u} className="size-10" />
                </ListGroup.ItemPrefix>
                <ListGroup.ItemContent>
                  <ListGroup.ItemTitle numberOfLines={1}>{u.name}</ListGroup.ItemTitle>
                  <ListGroup.ItemDescription>
                    {modelsSummary(providersFor(models.data, u.id), new Set(models.data.blocked[u.id] ?? []))}
                  </ListGroup.ItemDescription>
                </ListGroup.ItemContent>
                <ListGroup.ItemSuffix />
              </PressableRow>
            </Link>
          ))}
        </Section>
      )}
      {users.error && <ErrorAlert error={users.error} />}
      <LocalModels />
      <HostClis />
      <SubscriptionAccountsSection engine="claude" />
      <SubscriptionAccountsSection engine="codex" />
    </SettingsScroll>
  );
}
