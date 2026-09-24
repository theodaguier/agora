import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Alert, Spinner, Typography } from "heroui-native";
import { Fragment, useState } from "react";
import { confirmAction } from "@/components/confirm-action";
import { AdminGate, ErrorAlert, SettingsScroll, LoadingRows, RowMenu, SearchBox, Section, SwitchRow, useAdminToast } from "@/components/admin/ui";
import { skillsQuery, useHermesAction, type Skill } from "@/lib/agents-admin";
import { api } from "@/lib/api";
import { defineMessages } from "@/lib/i18n";
import { marketplaceHref } from "@/lib/marketplace";
import { headerIcon } from "@/components/header-button";
import { withTap } from "@/lib/haptics";

/* SkillsSection of apps/web/src/components/admin/AgentDetail.tsx */

const t = defineMessages({
  en: {
    title: "Skills",
    uninstalling: "Uninstalling in Hermes…",
    skillsTitle: "Agent skills",
    skillsHint: "Add skills from the Marketplace",
    filter: "Filter",
    uninstall: "Uninstall",
    uninstallTitle: (name: string) => `Uninstall the "${name}" skill?`,
    uninstallBody: "The bot will no longer be able to use it. You can install it again from the marketplace.",
    uninstallAction: "Uninstall",
    uninstallHint: "Touch and hold a skill you installed to uninstall it.",
    noMatch: "No skill matches.",
    uninstalled: "Skill uninstalled.",
    uninstallFailed: "Couldn't uninstall the skill.",
  },
  fr: {
    title: "Skills",
    uninstalling: "Désinstallation en cours dans Hermes…",
    skillsTitle: "Skills de l'agent",
    skillsHint: "Ajouter des skills depuis le Marketplace",
    filter: "Filtrer",
    uninstall: "Désinstaller",
    uninstallTitle: (name: string) => `Désinstaller la compétence « ${name} » ?`,
    uninstallBody: "Le bot ne pourra plus s'en servir. Tu pourras la réinstaller depuis la marketplace.",
    uninstallAction: "Désinstaller",
    uninstallHint: "Maintiens le doigt sur un skill que tu as installé pour le désinstaller.",
    noMatch: "Aucun skill ne correspond.",
    uninstalled: "Skill désinstallé.",
    uninstallFailed: "Impossible de désinstaller le skill.",
  },
});

export default function AgentSkillsScreen() {
  const { agentId } = useLocalSearchParams<{ agentId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useAdminToast();
  const query = skillsQuery(agentId);
  const [filter, setFilter] = useState("");
  const [action, setAction] = useState<string | null>(null);
  const { data: skills, isPending, error, refetch } = useQuery(query);
  const toggle = useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      api(`/admin/hermes/agents/${agentId}/skills/${encodeURIComponent(name)}`, { method: "PUT", body: JSON.stringify({ enabled }) }),
    onMutate: ({ name, enabled }) => qc.setQueryData<Skill[]>(query.queryKey, (xs) => xs?.map((s) => (s.name === name ? { ...s, enabled } : s))),
    onError: (e) => toast.failed(e),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: query.queryKey });
      // The "/" menu lists the bots' skills.
      qc.invalidateQueries({ queryKey: ["commands"] });
    },
  });
  const remove = useMutation({
    mutationFn: (name: string) => api<{ name?: string }>(`/admin/hermes/agents/${agentId}/skills/${encodeURIComponent(name)}`, { method: "DELETE" }),
    onSuccess: (r) => {
      if (r?.name) return setAction(r.name);
      toast.deleted(t.uninstalled);
      qc.invalidateQueries({ queryKey: ["commands"] });
      return qc.invalidateQueries({ queryKey: query.queryKey });
    },
    onError: (e) => toast.failed(e),
  });
  useHermesAction(action, (ok) => {
    setAction(null);
    if (ok) toast.deleted(t.uninstalled);
    else toast.failed(null, t.uninstallFailed);
    qc.invalidateQueries({ queryKey: query.queryKey });
    qc.invalidateQueries({ queryKey: ["commands"] });
  });

  const uninstall = async (s: Skill) => {
    if (await confirmAction({ title: t.uninstallTitle(s.name), description: t.uninstallBody, action: t.uninstallAction })) remove.mutate(s.name);
  };

  const list = (skills ?? []).filter((s) => `${s.name} ${s.description} ${s.category ?? ""}`.toLowerCase().includes(filter.trim().toLowerCase()));
  const removable = (s: Skill) => !!s.provenance && s.provenance !== "bundled";
  // One uninstall at a time, as the web: Hermes runs them one after the other.
  const busy = remove.isPending || !!action;

  return (
    <>
      <Stack.Screen.Title>{skills ? `${t.title} (${skills.length})` : t.title}</Stack.Screen.Title>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon={headerIcon.plus} iconRenderingMode="template" accessibilityLabel={t.skillsHint} onPress={withTap(() => router.push(marketplaceHref))} />
      </Stack.Toolbar>
      <AdminGate>
        <SettingsScroll onRefresh={refetch}>
          {!!action && (
            <Alert status="accent">
              <Alert.Indicator>
                <Spinner size="sm" />
              </Alert.Indicator>
              <Alert.Content>
                <Alert.Title>{t.uninstalling}</Alert.Title>
              </Alert.Content>
            </Alert>
          )}
          {!!skills?.length && <SearchBox value={filter} onChange={setFilter} placeholder={t.filter} />}
          <ErrorAlert error={error} />
          {isPending ? (
            <LoadingRows rows={6} avatar={false} />
          ) : list.length ? (
            <Section title={t.skillsTitle} footer={skills?.some(removable) ? t.uninstallHint : undefined}>
              {list.map((s) => {
                const row = (
                  <SwitchRow
                    title={s.category ? `${s.name} · ${s.category}` : s.name}
                    description={s.description}
                    value={s.enabled}
                    onChange={(enabled) => toggle.mutate({ name: s.name, enabled })}
                  />
                );
                return removable(s) ? (
                  <RowMenu key={s.name} actions={[{ label: t.uninstall, icon: "trash", destructive: true, disabled: busy, onPress: () => void uninstall(s) }]}>
                    {row}
                  </RowMenu>
                ) : (
                  <Fragment key={s.name}>{row}</Fragment>
                );
              })}
            </Section>
          ) : (
            !!filter && (
              <Typography.Paragraph type="body-sm" color="muted" align="center" className="px-4 py-8">
                {t.noMatch}
              </Typography.Paragraph>
            )
          )}
        </SettingsScroll>
      </AdminGate>
    </>
  );
}
