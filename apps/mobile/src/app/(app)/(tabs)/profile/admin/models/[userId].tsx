import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Stack, useLocalSearchParams } from "expo-router";
import { Alert, Typography } from "heroui-native";
import { useState } from "react";
import { modelsMessages, modelsSummary, providersFor } from "@/components/admin/models-summary";
import { AdminGate, ErrorAlert, LinkRow, LoadingRows, SearchBox, Section, SettingsScroll, SwitchRow, useAdminToast } from "@/components/admin/ui";
import { api } from "@/lib/api";
import { adminModelsQuery, adminUsersQuery, modelKey, providerName, type AdminModels } from "@/lib/admin";
import { MenuButton, TapMenu } from "@/components/menus";
import { modelName } from "@agora/core";
import { simple } from "@agora/core/i18n";
import { tr } from "@/lib/i18n";
import { EmptyState } from "@/components/empty-state";
import { SearchIcon } from "@/components/icons";

/* apps/web/src/components/admin/Models.tsx `UserModels` popover, as a screen: providers as sections, one switch per model. */

/** Under a model's name: its id when it has a label, and whether it reasons. */
function modelDescription(m: { id: string; label?: string | null; reasoning?: boolean }, reasoning: string) {
  const parts = [m.label ? m.id : null, m.reasoning ? reasoning : null].filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

export default function UserModels() {
  const t = modelsMessages;
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const qc = useQueryClient();
  const toast = useAdminToast();
  const users = useQuery(adminUsersQuery);
  const models = useQuery(adminModelsQuery);
  const [q, setQ] = useState("");
  const user = users.data?.find((u) => u.id === userId);

  const save = useMutation({
    mutationFn: (blocked: string[]) => api(`/admin/users/${encodeURIComponent(userId)}/models`, { method: "PUT", body: JSON.stringify({ blocked }) }),
    onMutate: (blocked) => {
      Haptics.selectionAsync();
      qc.setQueryData<AdminModels>(adminModelsQuery.queryKey, (d) => d && { ...d, blocked: { ...d.blocked, [userId]: blocked } });
    },
    onError: (e) => toast.failed(e),
    // The conversations' model picker updates too.
    onSettled: () => Promise.all([qc.invalidateQueries({ queryKey: adminModelsQuery.queryKey }), qc.invalidateQueries({ queryKey: ["models"] })]),
  });

  const data = models.data;
  const providers = data ? providersFor(data, userId) : [];
  const blocked = new Set(data?.blocked[userId] ?? []);
  /** Allows (allowed) or forbids these models for the employee. */
  const set = (ids: string[], allowed: boolean) => {
    const next = new Set(blocked);
    for (const id of ids) {
      if (allowed) next.delete(id);
      else next.add(id);
    }
    save.mutate([...next]);
  };
  // Their default model: the one their conversations start on, among those still allowed.
  const setDefault = useMutation({
    mutationFn: (model: string | null) => api(`/admin/users/${encodeURIComponent(userId)}/default-model`, { method: "PUT", body: JSON.stringify({ model }) }),
    onMutate: (model) => {
      Haptics.selectionAsync();
      qc.setQueryData<AdminModels>(adminModelsQuery.queryKey, (d) => {
        if (!d) return d;
        const defaults = { ...d.defaults };
        if (model) defaults[userId] = model;
        else delete defaults[userId];
        return { ...d, defaults };
      });
    },
    onError: (e) => toast.failed(e),
    onSettled: () => Promise.all([qc.invalidateQueries({ queryKey: adminModelsQuery.queryKey }), qc.invalidateQueries({ queryKey: adminUsersQuery.queryKey }), qc.invalidateQueries({ queryKey: ["models"] })]),
  });
  const current = data?.defaults?.[userId] ?? null;
  const labelOf = (key: string) => {
    const [provider, id] = key.split("::") as [string, string];
    const m = providers.find((p) => p.provider === provider)?.models.find((x) => x.id === id);
    return m?.label ?? modelName(id);
  };
  const idsOf = new Map(providers.map((p) => [p.provider, p.models.map((m) => modelKey(p.provider, m.id))]));
  const everyId = [...idsOf.values()].flat();
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (...texts: string[]) => words.every((w) => texts.join(" ").toLowerCase().includes(w));
  const shown = providers
    .map((p) => {
      const name = providerName(p.provider);
      return { ...p, name, models: p.models.filter((m) => matches(m.id, m.label ?? "", name, p.provider)) };
    })
    .filter((p) => p.models.length > 0);

  return (
    <>
      <Stack.Screen.Title>{user?.name ?? t.title}</Stack.Screen.Title>
      {data && everyId.length > 0 && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.View>
            <MenuButton
              icon="ellipsis"
              label={t.title}
              actions={[
                { label: t.allowAll, icon: "checkmark.circle", disabled: everyId.every((id) => !blocked.has(id)), onPress: () => set(everyId, true) },
                { label: t.blockAll, icon: "nosign", destructive: true, disabled: everyId.every((id) => blocked.has(id)), onPress: () => set(everyId, false) },
              ]}
            />
          </Stack.Toolbar.View>
        </Stack.Toolbar>
      )}
      <AdminGate>
        <SettingsScroll onRefresh={() => Promise.all([users.refetch(), models.refetch()])}>
          {models.isError ? (
            <ErrorAlert title={t.listFailed} error={models.error} />
          ) : !data ? (
            <LoadingRows rows={5} avatar={false} />
          ) : (
            <>
              <SearchBox value={q} onChange={setQ} placeholder={t.search} />
              {words.length === 0 && (
                <Section title={tr(simple).defaultModel} footer={tr(simple).defaultModelHint}>
                  <TapMenu
                    accessibilityLabel={tr(simple).defaultModel}
                    actions={[
                      { label: tr(simple).agentDefault, checked: !current, onPress: () => current && setDefault.mutate(null) },
                      ...providers.map((p) => ({
                        title: providerName(p.provider),
                        actions: p.models
                          .filter((m) => !blocked.has(modelKey(p.provider, m.id)))
                          .map((m) => {
                            const key = modelKey(p.provider, m.id);
                            return { label: m.label ?? m.id, checked: key === current, onPress: () => key !== current && setDefault.mutate(key) };
                          }),
                      })),
                    ]}
                  >
                    <LinkRow title={tr(simple).defaultModel} value={current ? labelOf(current) : tr(simple).agentDefault} pointerEvents="none" />
                  </TapMenu>
                </Section>
              )}
              <Typography.Paragraph type="body-sm" color="muted" className="px-4">
                {modelsSummary(providers, blocked)}
              </Typography.Paragraph>
              {shown.length === 0 && (
                <EmptyState icon={SearchIcon} description={t.noMatch} />
              )}
              {shown.map((p) => {
                const all = idsOf.get(p.provider) ?? [];
                const on = all.every((id) => !blocked.has(id));
                return (
                  <Section key={p.provider} title={p.name}>
                    {words.length === 0 && <SwitchRow title={t.allOf(p.name)} value={on} onChange={(allowed) => set(all, allowed)} />}
                    {p.models.map((m) => {
                      const id = modelKey(p.provider, m.id);
                      return (
                        <SwitchRow
                          key={id}
                          title={m.label ?? m.id}
                          description={modelDescription(m, t.reasoning)}
                          value={!blocked.has(id)}
                          onChange={(allowed) => set([id], allowed)}
 />
                      );
                    })}
                  </Section>
                );
              })}
              {data.unreachable > 0 && (
                <Alert status="warning">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>{t.unreachable(data.unreachable)}</Alert.Title>
                  </Alert.Content>
                </Alert>
              )}
            </>
          )}
        </SettingsScroll>
      </AdminGate>
    </>
  );
}
