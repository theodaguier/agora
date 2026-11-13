import type { BotWebhook } from "@agora/core";
import { agentTriggers } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ListGroup, Switch } from "heroui-native";
import { AdminGate, ErrorAlert, Intro, LoadingRows, RowMenu, Section, SettingTile, SettingsRow, SettingsScroll, useAdminToast } from "@/components/admin/ui";
import { confirmAction } from "@/components/confirm-action";
import { headerIcon } from "@/components/header-button";
import { GlobeIcon } from "@/components/icons";
import { agentTriggerHref, agentTriggersQuery } from "@/lib/agents-admin";
import { api } from "@/lib/api";
import { haptic, withTap } from "@/lib/haptics";
import { locale, tr } from "@/lib/i18n";
import { dateFormat } from "@/lib/intl";

/* apps/web/src/components/admin/AgentWebhooks.tsx: the list; its dialog is the trigger screen. */

export default function AgentTriggersScreen() {
  const { agentId } = useLocalSearchParams<{ agentId: string }>();
  const router = useRouter();
  const t = tr(agentTriggers);
  return (
    <>
      <Stack.Screen.Title>{t.title}</Stack.Screen.Title>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon={headerIcon.plus} iconRenderingMode="template" accessibilityLabel={t.add} onPress={withTap(() => router.push(agentTriggerHref(agentId)))} />
      </Stack.Toolbar>
      <AdminGate>
        <Triggers agentId={agentId} />
      </AdminGate>
    </>
  );
}

function Triggers({ agentId }: { agentId: string }) {
  const t = tr(agentTriggers);
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useAdminToast();
  const query = agentTriggersQuery(agentId);
  const { data, isPending, error, refetch } = useQuery(query);
  const when = dateFormat(locale, { dateStyle: "short", timeStyle: "short" });
  const refresh = () => qc.invalidateQueries({ queryKey: query.queryKey });
  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => api(`/agents/${agentId}/webhooks/${id}`, { method: "PATCH", body: JSON.stringify({ enabled }) }),
    onMutate: ({ id, enabled }) => qc.setQueryData<BotWebhook[]>(query.queryKey, (xs) => xs?.map((x) => (x.id === id ? { ...x, enabled } : x))),
    onError: (e) => toast.failed(e),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/agents/${agentId}/webhooks/${id}`, { method: "DELETE" }),
    onSuccess: () => toast.deleted(),
    onError: (e) => toast.failed(e),
    onSettled: refresh,
  });

  return (
    <SettingsScroll onRefresh={refetch}>
      <Intro>{t.intro}</Intro>
      <ErrorAlert error={error} />
      {isPending ? (
        <LoadingRows rows={2} avatar={false} />
      ) : data?.length ? (
        <Section>
          {data.map((hook) => (
            <RowMenu
              key={hook.id}
              actions={[
                { label: t.edit, icon: "pencil", onPress: () => router.push(agentTriggerHref(agentId, hook.id)) },
                {
                  label: t.delete,
                  icon: "trash",
                  destructive: true,
                  onPress: async () => {
                    if (await confirmAction({ title: t.deleteTitle(hook.name), description: t.deleteBody, action: t.delete })) remove.mutate(hook.id);
                  },
                },
              ]}
            >
              {/* A tap edits it; the switch turns it on or off. */}
              <ListGroup.Item onPress={withTap(() => router.push(agentTriggerHref(agentId, hook.id)))} accessibilityRole="button" accessibilityLabel={hook.name}>
                <SettingTile icon={GlobeIcon} />
                <ListGroup.ItemContent>
                  <ListGroup.ItemTitle numberOfLines={1}>{hook.name}</ListGroup.ItemTitle>
                  <ListGroup.ItemDescription numberOfLines={1}>
                    {hook.lastStatus && hook.lastReceivedAt ? t.last(t.status[hook.lastStatus], when.format(new Date(hook.lastReceivedAt))) : t.never}
                  </ListGroup.ItemDescription>
                  <ListGroup.ItemDescription numberOfLines={1}>{t.runsAs(hook.owner)}</ListGroup.ItemDescription>
                </ListGroup.ItemContent>
                <ListGroup.ItemSuffix>
                  <Switch
                    isSelected={hook.enabled}
                    accessibilityLabel={hook.name}
                    onSelectedChange={(enabled) => (haptic.select(), toggle.mutate({ id: hook.id, enabled }))}
                  />
                </ListGroup.ItemSuffix>
              </ListGroup.Item>
            </RowMenu>
          ))}
        </Section>
      ) : (
        !error && (
          <Section>
            <SettingsRow label={t.empty} />
          </Section>
        )
      )}
    </SettingsScroll>
  );
}
