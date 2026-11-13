import { sshAddress, type SshHostDto } from "@agora/core";
import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useRouter, type Href } from "expo-router";
import { ListGroup, Typography } from "heroui-native";
import { AdminGate, ErrorAlert, Intro, LoadingRows, PressableRow, RowMenu, Section, SettingTile, SettingsScroll, useAdminToast } from "@/components/admin/ui";
import { machineHref, machinesMessages, probeState, sshStatusQuery, useTestMachine } from "@/components/admin/machines";
import { confirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { headerIcon } from "@/components/header-button";
import { ServerIcon } from "@/components/icons";
import { api } from "@/lib/api";
import { sshHostsQuery } from "@/lib/admin";
import { ageLabel } from "@/lib/dates";
import { withTap } from "@/lib/haptics";
import { tr } from "@/lib/i18n";

/* apps/web/src/components/admin/Machines.tsx: the list; its dialog is the machine screen. */

export default function MachinesScreen() {
  const router = useRouter();
  const t = machinesMessages;
  return (
    <>
      <Stack.Screen.Title>{t.title}</Stack.Screen.Title>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon={headerIcon.plus} iconRenderingMode="template" accessibilityLabel={t.add} onPress={withTap(() => router.push(machineHref() as Href))} />
      </Stack.Toolbar>
      <AdminGate>
        <Machines />
      </AdminGate>
    </>
  );
}

function Machines() {
  const t = machinesMessages;
  const c = tr(common);
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useAdminToast();
  const hosts = useQuery(sshHostsQuery);
  const invalidate = () => qc.invalidateQueries({ queryKey: sshHostsQuery.queryKey });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/admin/ssh/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => toast.deleted(),
    onError: (e) => toast.failed(e),
    onSettled: invalidate,
  });
  const forget = useMutation({
    mutationFn: (id: string) => api(`/admin/ssh/${encodeURIComponent(id)}/forget-host-key`, { method: "POST" }),
    onSuccess: () => toast.success(t.forgot),
    onError: (e) => toast.failed(e),
    onSettled: invalidate,
  });
  const test = useTestMachine();
  const { data: status } = useQuery({ ...sshStatusQuery, enabled: !!hosts.data?.length });

  // The web's facts: its address, the bots left out, when it was last used.
  const facts = (h: SshHostDto) =>
    [sshAddress(h), h.excludedAgentIds.length ? t.someBots(h.excludedAgentIds.length) : null, h.lastUsedAt && t.usedAgo(ageLabel(new Date(h.lastUsedAt)))]
      .filter(Boolean)
      .join(", ");
  // Its live state once its key is in place; before that, the next step (amber: waiting on you).
  const state = (h: SshHostDto) => (h.hostKeyFingerprint ? probeState(status?.[h.id]) : { label: t.untested, className: "text-warning" });

  return (
    <SettingsScroll onRefresh={hosts.refetch}>
      <Intro>{t.text}</Intro>
      <ErrorAlert error={hosts.error} />
      {hosts.isPending ? (
        <LoadingRows rows={3} avatar={false} />
      ) : hosts.data?.length ? (
        <Section title={t.listTitle} footer={t.hint}>
          {hosts.data.map((h) => (
            <RowMenu
              key={h.id}
              actions={[
                { label: t.edit, icon: "pencil", onPress: () => router.push(machineHref(h.id) as Href) },
                { label: t.test, icon: "checkmark.circle", disabled: test.isPending, onPress: () => test.mutate(h.id) },
                ...(h.hostKeyFingerprint
                  ? [
                      {
                        label: t.forget,
                        icon: "arrow.clockwise" as const,
                        onPress: async () => {
                          if (await confirmAction({ title: t.forgetTitle(h.name), description: t.forgetText, action: t.forget })) forget.mutate(h.id);
                        },
                      },
                    ]
                  : []),
                {
                  label: c.delete,
                  icon: "trash",
                  destructive: true,
                  onPress: async () => {
                    if (await confirmAction({ title: t.removeTitle(h.name), description: t.removeText, action: c.delete })) remove.mutate(h.id);
                  },
                },
              ]}
            >
              <PressableRow onPress={() => router.push(machineHref(h.id) as Href)}>
                <SettingTile icon={ServerIcon} />
                <ListGroup.ItemContent>
                  <ListGroup.ItemTitle numberOfLines={1}>{h.name}</ListGroup.ItemTitle>
                  <Typography.Paragraph type="body-sm" numberOfLines={1} className={state(h).className}>
                    {state(h).label}
                  </Typography.Paragraph>
                  <ListGroup.ItemDescription numberOfLines={1}>{facts(h)}</ListGroup.ItemDescription>
                </ListGroup.ItemContent>
                <ListGroup.ItemSuffix />
              </PressableRow>
            </RowMenu>
          ))}
        </Section>
      ) : (
        !hosts.error && <EmptyState icon={ServerIcon} title={t.emptyTitle} description={t.empty} />
      )}
    </SettingsScroll>
  );
}
