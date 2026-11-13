import { SSH_NAME, sshAuthorizeCommand, type SshHostDto } from "@agora/core";
import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { Stack, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { Button, Description, FieldError, Input, ListGroup, TextArea, Typography } from "heroui-native";
import { useState } from "react";
import { AdminGate, ErrorAlert, FieldRow, Intro, LoadingRows, Section, SettingsRow, SettingsScroll, useAdminToast } from "@/components/admin/ui";
import { machineHref, machinesMessages, probeState, sshStatusQuery, useTestMachine } from "@/components/admin/machines";
import { EmptyState } from "@/components/empty-state";
import { headerIcon } from "@/components/header-button";
import { ServerIcon } from "@/components/icons";
import { AgentTargets } from "@/components/marketplace/agent-targets";
import { api } from "@/lib/api";
import { adminAgentsQuery } from "@/lib/agents-admin";
import { sshHostsQuery, sshLogQuery } from "@/lib/admin";
import { ageLabel } from "@/lib/dates";
import { haptic, withTap } from "@/lib/haptics";
import { tr } from "@/lib/i18n";

/* MachineDialog of apps/web/src/components/admin/Machines.tsx, as a pushed screen: its key, its fields, its bots, its log. */

export default function MachineScreen() {
  const { machineId } = useLocalSearchParams<{ machineId: string }>();
  const hosts = useQuery(sshHostsQuery);
  const isNew = machineId === "new";
  const host = isNew ? undefined : hosts.data?.find((h) => h.id === machineId);
  return (
    <AdminGate>
      {!isNew && !host ? (
        <>
          <Stack.Screen.Title>{machinesMessages.title}</Stack.Screen.Title>
          <SettingsScroll onRefresh={hosts.refetch}>
            {/* Deleted meanwhile (from the web, another phone): said, not loaded forever. */}
            {hosts.error ? <ErrorAlert error={hosts.error} /> : hosts.data ? <EmptyState icon={ServerIcon} description={machinesMessages.missing} /> : <LoadingRows rows={4} avatar={false} />}
          </SettingsScroll>
        </>
      ) : (
        <MachineForm key={host?.id ?? "new"} host={host} />
      )}
    </AdminGate>
  );
}

function MachineForm({ host }: { host?: SshHostDto }) {
  const t = machinesMessages;
  const c = tr(common);
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useAdminToast();
  const { data: agents = [] } = useQuery(adminAgentsQuery);
  const initial = {
    name: host?.name ?? "",
    host: host?.host ?? "",
    port: String(host?.port ?? 22),
    username: host?.username ?? "",
    description: host?.description ?? "",
  };
  const [form, setForm] = useState(initial);
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  // Kept as the bots left out: every other bot, including one made later, reaches it.
  const [excluded, setExcluded] = useState<string[]>(host?.excludedAgentIds ?? []);
  const allowed = agents.filter((a) => !excluded.includes(a.id)).map((a) => a.id);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        host: form.host.trim(),
        port: Number(form.port),
        username: form.username.trim(),
        description: form.description,
        excludedAgentIds: excluded,
      };
      return host
        ? api<SshHostDto>(`/admin/ssh/${encodeURIComponent(host.id)}`, { method: "PATCH", body: JSON.stringify(body) })
        : api<SshHostDto>("/admin/ssh", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: async (saved) => {
      await qc.invalidateQueries({ queryKey: sshHostsQuery.queryKey });
      toast.success(host ? c.saved : t.created);
      // A new machine opens on its key: it must be added to the machine before the test.
      if (host) router.back();
      else router.replace(machineHref(saved.id) as Href);
    },
    onError: (e) => toast.failed(e),
  });

  const nameError = !!form.name && !SSH_NAME.test(form.name);
  const port = Number(form.port);
  const valid = !!form.name && !nameError && !!form.host.trim() && !!form.username.trim() && Number.isInteger(port) && port > 0 && port < 65536;
  const dirty = JSON.stringify(form) !== JSON.stringify(initial) || JSON.stringify(excluded) !== JSON.stringify(host?.excludedAgentIds ?? []);

  return (
    <>
      <Stack.Screen.Title>{host ? host.name : t.newTitle}</Stack.Screen.Title>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={headerIcon.check}
          iconRenderingMode="template"
          accessibilityLabel={save.isPending ? c.saving : host ? c.save : c.create}
          disabled={!valid || !dirty || save.isPending}
          variant="prominent"
          onPress={withTap(() => save.mutate())}
        />
      </Stack.Toolbar>
      <SettingsScroll>
        <Intro>{t.dialogText}</Intro>

        {/* Not yet reached: putting its key on the machine is the next step, first. */}
        {host && !host.hostKeyFingerprint && <PublicKey host={host} />}

        <Section>
          <FieldRow label={t.name} required invalid={nameError}>
            <Input
              variant="secondary"
              value={form.name}
              onChangeText={(v) => set("name")(v.toLowerCase())}
              maxLength={40}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
            />
            <Description hideOnInvalid>{t.nameHelp}</Description>
            <FieldError>{t.nameInvalid}</FieldError>
          </FieldRow>
          <FieldRow label={t.host} required>
            <Input variant="secondary" value={form.host} onChangeText={set("host")} autoCapitalize="none" autoCorrect={false} spellCheck={false} keyboardType="url" />
            <Description>{t.hostHelp}</Description>
          </FieldRow>
          <FieldRow label={t.port} required>
            <Input variant="secondary" value={form.port} onChangeText={(v) => set("port")(v.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={5} />
          </FieldRow>
          <FieldRow label={t.username} required>
            <Input variant="secondary" value={form.username} onChangeText={set("username")} autoCapitalize="none" autoCorrect={false} spellCheck={false} />
          </FieldRow>
          <FieldRow label={t.description} top>
            <TextArea variant="secondary" value={form.description} onChangeText={set("description")} className="min-h-20" />
            <Description>{t.descriptionHelp}</Description>
          </FieldRow>
        </Section>

        <AgentTargets legend={t.bots} hint={t.botsHelp} value={allowed} onChange={(ids) => setExcluded(agents.filter((a) => !ids.includes(a.id)).map((a) => a.id))} />

        {host?.hostKeyFingerprint && <PublicKey host={host} />}
        {host && <UsageLog host={host} />}
      </SettingsScroll>
    </>
  );
}

/** The command that puts its key on the machine, and the test that pins the machine's identity (the web's PublicKey). */
function PublicKey({ host }: { host: SshHostDto }) {
  const t = machinesMessages;
  const toast = useAdminToast();
  const test = useTestMachine();
  const { data: status } = useQuery(sshStatusQuery);
  const command = sshAuthorizeCommand(host.publicKey);
  const live = host.hostKeyFingerprint ? probeState(status?.[host.id]) : undefined;
  return (
    <Section title={t.keyTitle} footer={t.keyHelp}>
      <SettingsRow label={t.command} hint={command}>
        <Button
          size="sm"
          variant="secondary"
          onPress={withTap(async () => {
            await Clipboard.setStringAsync(command);
            haptic.success();
            toast.info(t.copied);
          })}
        >
          {t.copy}
        </Button>
      </SettingsRow>
      <ListGroup.Item disabled>
        <ListGroup.ItemContent>
          <ListGroup.ItemTitle className={host.hostKeyFingerprint ? "text-success" : "text-warning"}>{host.hostKeyFingerprint ? t.connected : t.untested}</ListGroup.ItemTitle>
          {live && (
            <ListGroup.ItemDescription numberOfLines={2} className={live.className}>
              {[live.label, live.detail].filter(Boolean).join(", ")}
            </ListGroup.ItemDescription>
          )}
        </ListGroup.ItemContent>
        <Button size="sm" variant="outline" isDisabled={test.isPending} onPress={withTap(() => test.mutate(host.id))}>
          {test.isPending ? t.testing : t.test}
        </Button>
      </ListGroup.Item>
    </Section>
  );
}

function UsageLog({ host }: { host: SshHostDto }) {
  const t = machinesMessages;
  const { data: entries, isPending } = useQuery(sshLogQuery(host.id));
  if (isPending) return <LoadingRows rows={2} avatar={false} />;
  return (
    <Section title={t.log} footer={entries?.length ? undefined : t.logEmpty}>
      {entries?.map((e) => {
        const failed = e.exitCode !== null && e.exitCode !== 0;
        return (
          <ListGroup.Item key={e.id} disabled>
            <ListGroup.ItemContent>
              <ListGroup.ItemTitle numberOfLines={1} className={e.command ? "font-mono text-sm" : undefined}>
                {e.command ?? t.session}
              </ListGroup.ItemTitle>
              <ListGroup.ItemDescription numberOfLines={1}>{[e.agentName, e.userName, ageLabel(new Date(e.at))].filter(Boolean).join(", ")}</ListGroup.ItemDescription>
              {failed && (
                <Typography.Paragraph type="body-sm" className="text-danger">
                  {t.failed(e.exitCode!)}
                </Typography.Paragraph>
              )}
            </ListGroup.ItemContent>
          </ListGroup.Item>
        );
      })}
    </Section>
  );
}
