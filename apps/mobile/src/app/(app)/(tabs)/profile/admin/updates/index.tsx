import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Link, Stack } from "expo-router";
import { Alert, Button, ListGroup, PressableFeedback, Spinner, Typography } from "heroui-native";
import { View } from "react-native";
import { AdminGate, ErrorAlert, InfoPopover, Intro, LoadingRows, PressableRow, Section, SettingsScroll, SwitchRow, useAdminToast } from "@/components/admin/ui";
import { stepText, updatesMessages, dateTime } from "@/components/admin/updates-messages";
import { confirmAction } from "@/components/confirm-action";
import { RunStatusChip } from "@/components/admin/updates";
import { api } from "@/lib/api";
import { updatesQuery, type UpdateRun, type UpdateSettings, type UpdateStep } from "@/lib/admin";
import { tr } from "@/lib/i18n";
import { OptionPicker } from "@/components/menus";
import { RefreshIcon } from "@/components/icons";
import { headerIcon } from "@/components/header-button";
import { withTap } from "@/lib/haptics";

/* apps/web/src/components/admin/Updates.tsx */

const isMajor = (from: string, to: string) => from.split(".")[0] !== to.split(".")[0];

export default function Updates() {
  return (
    <>
      <Stack.Screen.Title>{updatesMessages.title}</Stack.Screen.Title>
      <AdminGate>
        <UpdatesScreen />
      </AdminGate>
    </>
  );
}

function UpdatesScreen() {
  const t = updatesMessages;
  const c = tr(common);
  const qc = useQueryClient();
  const toast = useAdminToast();
  const { data, error, refetch } = useQuery({
    ...updatesQuery,
    // Refreshes during an update.
    refetchInterval: (q) => (q.state.data?.history?.[0]?.status === "running" || q.state.data?.running ? 2000 : 30_000),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: updatesQuery.queryKey });
  const check = useMutation({ mutationFn: () => api("/admin/updates/check", { method: "POST" }), onError: (e) => toast.failed(e), onSettled: refresh });
  const apply = useMutation({
    mutationFn: (b: { target: "hermes" | "app"; version: string }) => api("/admin/updates/apply", { method: "POST", body: JSON.stringify(b) }),
    onSuccess: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    onError: (e) => toast.failed(e),
    onSettled: refresh,
  });
  const settings = useMutation({
    mutationFn: (b: Partial<UpdateSettings>) => api("/admin/updates/settings", { method: "PUT", body: JSON.stringify(b) }),
    onMutate: (b) => qc.setQueryData(updatesQuery.queryKey, (d) => d && { ...d, settings: d.settings && { ...d.settings, ...b } }),
    onError: (e) => toast.failed(e),
    onSettled: refresh,
  });
  const unreject = useMutation({
    mutationFn: (b: { target: string; version: string }) => api(`/admin/updates/rejected/${b.target}/${b.version}`, { method: "DELETE" }),
    onError: (e) => toast.failed(e),
    onSettled: refresh,
  });

  if (!data) return <SettingsScroll onRefresh={refetch}>{error ? <ErrorAlert error={error} /> : <LoadingRows rows={4} avatar={false} />}</SettingsScroll>;

  const current = data.history?.[0]?.status === "running" ? data.history[0] : null;
  const busy = !!data.running || !!current;
  const time = dateTime();

  return (
    <>
      {!data.unavailable && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button icon={headerIcon.refresh} iconRenderingMode="template" accessibilityLabel={t.checkNow} disabled={check.isPending || busy} onPress={withTap(() => check.mutate())} />
        </Stack.Toolbar>
      )}
      <SettingsScroll onRefresh={refetch}>
        <Intro>{t.intro}</Intro>

        {busy &&
          (current ? (
            <Link href={{ pathname: "/profile/admin/updates/[runId]", params: { runId: current.id } }} asChild>
              <PressableFeedback animation={{ scale: { value: 0.995 } }}>
                <Progress title={t.updatingTo(current.target === "hermes" ? "Hermes" : "Agora", current.to)} step={current.steps.at(-1)} />
              </PressableFeedback>
            </Link>
          ) : (
            <Progress title={t.updatingTo(data.running!.target === "hermes" ? "Hermes" : "Agora", data.running!.to)} />
          ))}

        <Section title={t.versions} footer={data.unavailable}>
          <VersionRow
            title="Agora"
            current={data.server.app}
            detail={data.server.commit ? t.commit(data.server.commit) : undefined}
            available={data.available?.app ?? []}
            rejected={data.rejected?.app ?? []}
            disabled={busy || !!data.unavailable}
            onApply={async (v) =>
              (await confirmAction({ title: t.confirmApp(v), action: t.updateAction, destructive: false })) && apply.mutate({ target: "app", version: v })
            }
            onRetry={(v) => unreject.mutate({ target: "app", version: v })}
            note={(v) => (isMajor(data.server.app, v) ? t.majorNote : undefined)}
 />
          <VersionRow
            title={t.hermesCore}
            current={data.current?.hermes ?? data.server.hermes}
            available={data.available?.hermes ?? []}
            rejected={data.rejected?.hermes ?? []}
            disabled={busy || !!data.unavailable}
            onApply={async (v) =>
              (await confirmAction({ title: t.confirmHermes(v), action: t.updateAction, destructive: false })) && apply.mutate({ target: "hermes", version: v })
            }
            onRetry={(v) => unreject.mutate({ target: "hermes", version: v })}
 />
        </Section>

        {!data.unavailable && (
          <>
            <Section
              title={t.autoUpdates}
              help={t.parisTime}
              footer={data.lastCheck ? t.lastCheck(time.format(new Date(data.lastCheck))).trim() : undefined}
              action={
                <Button size="sm" variant="ghost" isDisabled={check.isPending || busy} onPress={withTap(() => check.mutate())}>
                  {check.isPending ? c.inProgress : t.checkNow}
                </Button>
              }
 >
              <SwitchRow title={t.autoHermes} value={!!data.settings?.autoHermes} onChange={(autoHermes) => settings.mutate({ autoHermes })} />
              <SwitchRow title={t.autoApp} value={!!data.settings?.autoApp} onChange={(autoApp) => settings.mutate({ autoApp })} />
              <ListGroup.Item disabled>
                <ListGroup.ItemContent>
                  <ListGroup.ItemTitle>{t.window}</ListGroup.ItemTitle>
                </ListGroup.ItemContent>
                <ListGroup.ItemSuffix>
                  <View className="flex-row items-center gap-1">
                    <HourSelect label={t.windowStart} value={data.settings?.windowStart ?? 3} onChange={(h) => settings.mutate({ windowStart: h })} />
                    <Typography.Paragraph color="muted">–</Typography.Paragraph>
                    <HourSelect label={t.windowEnd} value={data.settings?.windowEnd ?? 5} onChange={(h) => settings.mutate({ windowEnd: h })} />
                  </View>
                </ListGroup.ItemSuffix>
              </ListGroup.Item>
            </Section>

            <Section title={t.history} footer={data.history?.length ? undefined : t.noHistory}>
              {data.history?.map((run) => <RunRow key={run.id} run={run} />)}
            </Section>
          </>
        )}
      </SettingsScroll>
    </>
  );
}

/** An update in progress: its last step, refreshed every 2 seconds. */
function Progress({ title, step }: { title: string; step?: UpdateStep }) {
  return (
    <Alert status="accent">
      <Alert.Indicator>
        <Spinner size="sm" />
      </Alert.Indicator>
      <Alert.Content>
        <Alert.Title>{title}</Alert.Title>
        {step ? <Alert.Description numberOfLines={2}>{stepText(step)}</Alert.Description> : null}
      </Alert.Content>
    </Alert>
  );
}

function VersionRow(props: {
  title: string;
  current: string;
  detail?: string;
  available: string[];
  rejected: string[];
  disabled: boolean;
  onApply: (v: string) => void;
  onRetry: (v: string) => void;
  note?: (v: string) => string | undefined;
}) {
  const t = updatesMessages;
  const latest = props.available.at(-1);
  const rejected = !!latest && props.rejected.includes(latest);
  const note = latest ? props.note?.(latest) : undefined;
  return (
    <ListGroup.Item disabled>
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle>
          {props.title} {props.current}
        </ListGroup.ItemTitle>
        <ListGroup.ItemDescription>
          {latest ? `${t.available}${latest}${props.available.length > 1 ? t.others(props.available.length - 1) : ""}${rejected ? ` · ${t.rejected}` : ""}` : t.upToDate}
          {props.detail ? ` · ${props.detail}` : ""}
        </ListGroup.ItemDescription>
      </ListGroup.ItemContent>
      {latest && (
        <ListGroup.ItemSuffix>
          <View className="flex-row items-center gap-1">
            {!!note && <InfoPopover title={`${props.title} ${latest}`} description={note} />}
            {rejected ? (
              <Button size="sm" variant="secondary" onPress={withTap(() => props.onRetry(latest))}>
                {t.allowRetry}
              </Button>
            ) : (
              <Button size="sm" isDisabled={props.disabled} onPress={withTap(() => props.onApply(latest))}>
                {t.update}
              </Button>
            )}
          </View>
        </ListGroup.ItemSuffix>
      )}
    </ListGroup.Item>
  );
}

function HourSelect({ label, value, onChange }: { label: string; value: number; onChange: (h: number) => void }) {
  const t = updatesMessages;
  const hours = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: t.hour(h) }));
  return (
    <OptionPicker value={String(value)} options={hours} label={label} onChange={(h) => onChange(Number(h))} />
  );
}

function RunRow({ run }: { run: UpdateRun }) {
  const t = updatesMessages;
  const time = dateTime();
  return (
    <Link href={{ pathname: "/profile/admin/updates/[runId]", params: { runId: run.id } }} asChild>
      <PressableRow>
        <ListGroup.ItemContent>
          <ListGroup.ItemTitle>
            {run.target === "hermes" ? "Hermes" : "Agora"} {run.from} → {run.to}
          </ListGroup.ItemTitle>
          <ListGroup.ItemDescription>
            {t.trigger[run.trigger]} · {time.format(new Date(run.startedAt))}
          </ListGroup.ItemDescription>
        </ListGroup.ItemContent>
        <RunStatusChip status={run.status} />
        <ListGroup.ItemSuffix />
      </PressableRow>
    </Link>
  );
}
