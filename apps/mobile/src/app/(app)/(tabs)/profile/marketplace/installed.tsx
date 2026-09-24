import type { IntegrationType } from "@agora/core";
import { common, integrations } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Stack } from "expo-router";
import { Button, LinkButton, ListGroup, Switch, Typography } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { confirmAction } from "@/components/confirm-action";
import { AdminGate, SettingsScroll, LoadingRows, RowMenu, Section } from "@/components/admin/ui";
import { InitialTile, IntegrationTile } from "@/components/marketplace/integration-type";
import { integrationTypeSubmenu } from "@/components/marketplace/integration-type-menu";
import { RestartBanner } from "@/components/marketplace/restart-banner";
import { SkillCreateSheet } from "@/components/skill-create-sheet";
import { ToggleRow, useFeedback } from "@/components/profile/settings";
import { agentsHref } from "@/lib/agents-admin";
import { api } from "@/lib/api";
import { haptic, withTap } from "@/lib/haptics";
import { defineMessages, tr } from "@/lib/i18n";
import { flagRestart, mcpServersQuery, pluginsQuery } from "@/lib/marketplace";
import type { McpRequest, SkillRequest } from "@/lib/types";

/* apps/web/src/components/marketplace/Installed.tsx */

const t = defineMessages({
  en: {
    title: "Installed",
    skillRequests: "Skills requested by bots",
    mcpRequests: "Connectors requested by bots",
    reject: "Decline",
    approve: "Approve",
    review: "Review",
    stdioWarning: "Command runs on the Hermes machine.",
    mcpServers: "MCP connectors",
    noServers: "No connectors installed.",
    remove: "Remove",
    removeConfirm: (name: string) => `Remove the “${name}” connector?`,
    removeBody: "Bots will lose access to its tools. Its secrets stay in Hermes's .env.",
    removeAction: "Remove",
    menuHint: "Touch and hold a connector to change its type or remove it.",
    plugins: "Active plugins",
    noPlugins: "No plugins enabled.",
    skillsHint: "Skills are installed per agent: find them in Administration › Agents › Skills.",
    removed: (name: string) => `“${name}” removed`,
    approved: "Request approved",
    declined: "Request declined",
  },
  fr: {
    title: "Installés",
    skillRequests: "Skills demandés par les bots",
    mcpRequests: "Connecteurs demandés par les bots",
    reject: "Refuser",
    approve: "Valider",
    review: "Relire",
    stdioWarning: "Commande exécutée sur la machine Hermes.",
    mcpServers: "Connecteurs MCP",
    noServers: "Aucun connecteur installé.",
    remove: "Retirer",
    removeConfirm: (name: string) => `Retirer le connecteur « ${name} » ?`,
    removeBody: "Les bots perdront l'accès à ses outils. Ses secrets restent dans le .env de Hermes.",
    removeAction: "Retirer",
    menuHint: "Maintiens le doigt sur un connecteur pour changer son type ou le retirer.",
    plugins: "Plugins actifs",
    noPlugins: "Aucun plugin activé.",
    skillsHint: "Les skills s'installent par agent : retrouve-les dans Administration › Agents › Skills.",
    removed: (name: string) => `« ${name} » retiré`,
    approved: "Demande validée",
    declined: "Demande refusée",
  },
});

export default function InstalledScreen() {
  return (
    <>
      <Stack.Screen.Title>{t.title}</Stack.Screen.Title>
      <AdminGate>
        <Installed />
      </AdminGate>
    </>
  );
}

function Installed() {
  const c = tr(common);
  const types = tr(integrations).types;
  const qc = useQueryClient();
  // Outcomes and failures are HeroUI Toasts.
  const feedback = useFeedback();
  const decided = (_: unknown, { approve }: { approve: boolean }) => feedback.saved(approve ? t.approved : t.declined);
  const servers = useQuery(mcpServersQuery);
  const plugins = useQuery(pluginsQuery);
  const requests = useQuery({ queryKey: ["mcp-requests"], queryFn: () => api<McpRequest[]>("/mcp-requests") });
  const pending = (requests.data ?? []).filter((r) => r.status === "pending");
  const skillRequests = useQuery({ queryKey: ["skill-requests"], queryFn: () => api<SkillRequest[]>("/skill-requests") });
  const pendingSkills = (skillRequests.data ?? []).filter((r) => r.status === "pending");
  const [reviewing, setReviewing] = useState<SkillRequest | null>(null);

  const decideSkill = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => api(`/skill-requests/${id}/${approve ? "approve" : "reject"}`, { method: "POST" }),
    onSuccess: decided,
    onError: feedback.failed,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["skill-requests"] });
      qc.invalidateQueries({ queryKey: ["skill-request"] });
    },
  });
  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => api(`/mcp-requests/${id}/${approve ? "approve" : "reject"}`, { method: "POST" }),
    onSuccess: decided,
    onError: feedback.failed,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["mcp-requests"] });
      qc.invalidateQueries({ queryKey: ["mcp-request"] });
      qc.invalidateQueries({ queryKey: ["hermes"] });
    },
  });
  const changed = () => {
    flagRestart();
    qc.invalidateQueries({ queryKey: ["hermes"] });
  };
  const toggleMcp = useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      api(`/admin/hermes/mcp/servers/${name}/enabled`, { method: "PUT", body: JSON.stringify({ enabled }) }),
    onSuccess: changed,
    onError: feedback.failed,
  });
  const removeMcp = useMutation({
    mutationFn: (name: string) => api(`/admin/hermes/mcp/servers/${name}`, { method: "DELETE" }),
    onSuccess: (_, name) => {
      changed();
      feedback.saved(t.removed(name));
    },
    onError: feedback.failed,
  });
  const setType = useMutation({
    mutationFn: ({ name, type }: { name: string; type: IntegrationType }) =>
      api(`/admin/hermes/mcp/servers/${name}/type`, { method: "PUT", body: JSON.stringify({ type }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hermes", "mcp"] }),
    onError: feedback.failed,
  });
  const togglePlugin = useMutation({
    mutationFn: ({ name, enable }: { name: string; enable: boolean }) =>
      api(`/admin/hermes/plugins/${encodeURIComponent(name)}/${enable ? "enable" : "disable"}`, { method: "POST" }),
    onSuccess: changed,
    onError: feedback.failed,
  });

  const enabledPlugins = (plugins.data ?? []).filter((p) => /^enabled/i.test(p.status));

  /** Decline / Approve under a request, full width on a phone. */
  const decision = (onDecide: (approve: boolean) => void, busy: boolean, approveLabel = t.approve) => (
    <View className="flex-row gap-2 pt-2">
      <Button variant="secondary" size="sm" className="flex-1" isDisabled={busy} onPress={withTap(() => onDecide(false))}>
        {t.reject}
      </Button>
      <Button size="sm" className="flex-1" isDisabled={busy} onPress={withTap(() => onDecide(true))}>
        {approveLabel}
      </Button>
    </View>
  );

  return (
    <SettingsScroll
      onRefresh={() => Promise.all([servers.refetch(), plugins.refetch(), requests.refetch(), skillRequests.refetch()])}
    >
      <RestartBanner />

      {pendingSkills.length > 0 && (
        <Section title={t.skillRequests}>
          {pendingSkills.map((r) => (
            <ListGroup.Item key={r.id} className="items-start">
              <ListGroup.ItemPrefix>
                <InitialTile name={r.name} />
              </ListGroup.ItemPrefix>
              <ListGroup.ItemContent className="gap-0.5">
                <ListGroup.ItemTitle>{r.name}</ListGroup.ItemTitle>
                {!!(r.kind === "create" ? r.description : r.reason) && (
                  <ListGroup.ItemDescription>{r.kind === "create" ? r.description : r.reason}</ListGroup.ItemDescription>
                )}
                {r.kind !== "create" && (
                  <Typography.Code color="muted" truncate>
                    {r.identifier}
                  </Typography.Code>
                )}
                {!!r.error && (
                  <Typography.Paragraph type="body-xs" className="text-danger">
                    {r.error}
                  </Typography.Paragraph>
                )}
                {decision(
                  (approve) => (approve && r.kind === "create" ? setReviewing(r) : decideSkill.mutate({ id: r.id, approve })),
                  decideSkill.isPending,
                  r.error ? c.retry : r.kind === "create" ? t.review : t.approve,
                )}
              </ListGroup.ItemContent>
            </ListGroup.Item>
          ))}
        </Section>
      )}
      <SkillCreateSheet request={reviewing} onClose={() => setReviewing(null)} />

      {pending.length > 0 && (
        <Section title={t.mcpRequests}>
          {pending.map((r) => (
            <ListGroup.Item key={r.id} className="items-start">
              <ListGroup.ItemPrefix>
                <IntegrationTile type={r.type} server={r.name} />
              </ListGroup.ItemPrefix>
              <ListGroup.ItemContent className="gap-0.5">
                <ListGroup.ItemTitle>{r.title}</ListGroup.ItemTitle>
                {!!r.description && <ListGroup.ItemDescription>{r.description}</ListGroup.ItemDescription>}
                <Typography.Code color="muted" truncate>
                  {r.url ?? r.command}
                </Typography.Code>
                {r.transport === "stdio" && (
                  <Typography.Paragraph type="body-xs" className="text-warning">
                    {t.stdioWarning}
                  </Typography.Paragraph>
                )}
                {decision((approve) => decide.mutate({ id: r.id, approve }), decide.isPending)}
              </ListGroup.ItemContent>
            </ListGroup.Item>
          ))}
        </Section>
      )}

      {servers.isPending ? (
        <LoadingRows rows={3} />
      ) : (
        <Section title={t.mcpServers} footer={servers.data?.servers.length ? t.menuHint : undefined}>
          {servers.data?.servers.length === 0 && (
            <ListGroup.Item disabled>
              <ListGroup.ItemContent>
                <ListGroup.ItemDescription>{t.noServers}</ListGroup.ItemDescription>
              </ListGroup.ItemContent>
            </ListGroup.Item>
          )}
          {servers.data?.servers.map((s) => (
            <RowMenu
              key={s.name}
              items={[integrationTypeSubmenu(s.type, (type) => setType.mutate({ name: s.name, type }))]}
              actions={[
                {
                  label: t.remove,
                  icon: "trash",
                  destructive: true,
                  onPress: async () => {
                    if (await confirmAction({ title: t.removeConfirm(s.name), description: t.removeBody, action: t.removeAction })) removeMcp.mutate(s.name);
                  },
                },
              ]}
            >
              <ListGroup.Item
                onPress={withTap(() => toggleMcp.mutate({ name: s.name, enabled: s.enabled === false }))}
                accessibilityRole="switch"
                accessibilityState={{ checked: s.enabled !== false }}
              >
                <ListGroup.ItemPrefix>
                  <IntegrationTile type={s.type} server={s.name} />
                </ListGroup.ItemPrefix>
                <ListGroup.ItemContent>
                  <ListGroup.ItemTitle numberOfLines={1}>{s.name}</ListGroup.ItemTitle>
                  <ListGroup.ItemDescription numberOfLines={1}>{types[s.type]}</ListGroup.ItemDescription>
                  <Typography.Code color="muted" truncate>
                    {s.url ?? s.command}
                  </Typography.Code>
                </ListGroup.ItemContent>
                <ListGroup.ItemSuffix>
                  <Switch isSelected={s.enabled !== false} onSelectedChange={(enabled) => (haptic.select(), toggleMcp.mutate({ name: s.name, enabled }))} />
                </ListGroup.ItemSuffix>
              </ListGroup.Item>
            </RowMenu>
          ))}
        </Section>
      )}

      {plugins.isPending ? (
        <LoadingRows rows={2} />
      ) : (
        <Section
          title={t.plugins}
          footer={
            <Link href={agentsHref} asChild>
              <LinkButton size="sm" className="self-start px-4">
                <LinkButton.Label className="text-link">{t.skillsHint}</LinkButton.Label>
              </LinkButton>
            </Link>
          }
        >
          {plugins.data && enabledPlugins.length === 0 && (
            <ListGroup.Item disabled>
              <ListGroup.ItemContent>
                <ListGroup.ItemDescription>{t.noPlugins}</ListGroup.ItemDescription>
              </ListGroup.ItemContent>
            </ListGroup.Item>
          )}
          {enabledPlugins.map((p) => (
            <ToggleRow
              key={p.name}
              prefix={<InitialTile name={p.name} />}
              title={p.name}
              description={p.description}
              value
              disabled={togglePlugin.isPending}
              onChange={(enable) => togglePlugin.mutate({ name: p.name, enable })}
            />
          ))}
        </Section>
      )}
    </SettingsScroll>
  );
}
