import { SSH_NAME, sshAuthorizeCommand, type SshHostDto } from "@agora/core";
import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { Stack, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { Button, Description, FieldError, Input, ListGroup, TextArea } from "heroui-native";
import { useState } from "react";
import { AdminGate, ErrorAlert, FieldRow, Intro, LoadingRows, Section, SettingsRow, SettingsScroll, useAdminToast } from "@/components/admin/ui";
import { machineHref, machinesMessages, useTestMachine } from "@/components/admin/machines";
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

        {host && <PublicKey host={host} />}

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

        {host && <UsageLog host={host} />}
      </SettingsScroll>
    </>
  );
}

/** The key to add on the machine, and the test that pins its fingerprint. */
function PublicKey({ host }: { host: SshHostDto }) {
  const t = machinesMessages;
  const toast = useAdminToast();
  const test = useTestMachine();
  const copy = (text: string) =>
    withTap(async () => {
      await Clipboard.setStringAsync(text);
      haptic.success();
      toast.info(t.copied);
    });
  return (
    <Section footer={t.keyHelp}>
      <SettingsRow label={t.keyTitle} hint={host.publicKey}>
        <Button size="sm" variant="secondary" onPress={copy(host.publicKey)}>
          {t.copy}
        </Button>
      </SettingsRow>
      <SettingsRow label={t.command} hint={sshAuthorizeCommand(host.publicKey)}>
        <Button size="sm" variant="secondary" onPress={copy(sshAuthorizeCommand(host.publicKey))}>
          {t.copy}
        </Button>
      </SettingsRow>
      <SettingsRow label={host.hostKeyFingerprint ? t.verified : t.untested} hint={host.hostKeyFingerprint}>
        <Button size="sm" variant="outline" isDisabled={test.isPending} onPress={withTap(() => test.mutate(host.id))}>
          {test.isPending ? t.testing : t.test}
        </Button>
      </SettingsRow>
    </Section>
  );
}

function UsageLog({ host }: { host: SshHostDto }) {
  const t = machinesMessages;
  const { data: entries, isPending } = useQuery(sshLogQuery(host.id));
  if (isPending) return <LoadingRows rows={2} avatar={false} />;
  return (
    <Section title={t.log} footer={entries?.length ? undefined : t.logEmpty}>
      {entries?.map((e) => (
        <ListGroup.Item key={e.id} disabled>
          <ListGroup.ItemContent>
            <ListGroup.ItemTitle numberOfLines={1}>{e.command ?? t.session}</ListGroup.ItemTitle>
            <ListGroup.ItemDescription numberOfLines={1}>
              {[e.agentName, e.userName, ageLabel(new Date(e.at)), e.exitCode !== null && e.exitCode !== 0 && `exit ${e.exitCode}`].filter(Boolean).join(" · ")}
            </ListGroup.ItemDescription>
          </ListGroup.ItemContent>
        </ListGroup.Item>
      ))}
    </Section>
  );
}
