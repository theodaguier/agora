import { guessIntegrationType } from "@agora/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ListGroup } from "heroui-native";
import { AdminGate, ErrorAlert, SettingsScroll, LoadingRows, Section, SwitchRow, useAdminToast } from "@/components/admin/ui";
import { IntegrationTile } from "@/components/marketplace/integration-type";
import {
  adminAgentsQuery,
  agentMcpQuery,
  isDefaultProfile,
  mcpTypesQuery,
  toolsetsQuery,
  withoutEmoji,
  type AgentMcp,
  type Toolset,
} from "@/lib/agents-admin";
import { api } from "@/lib/api";
import { confirmAction } from "@/components/confirm-action";
import { defineMessages } from "@/lib/i18n";
import { marketplaceHref } from "@/lib/marketplace";
import { headerIcon } from "@/components/header-button";
import { withTap } from "@/lib/haptics";

/* The "Tools" tab of apps/web/src/components/admin/AgentDetail.tsx: McpSection, then ToolsSection. */

const t = defineMessages({
  en: {
    title: "Tools",
    toolsIntro: "Tools the agent can use in the app. Applied from the next message.",
    needsConfig: " · needs configuring in Hermes",
    riskyNote: " · gives access to the server",
    riskyTitle: (tool: string) => `Turn on "${tool}" for this agent?`,
    riskyBody:
      "This tool gives the agent, and anyone who writes to it, direct access to the server: commands, files, the other agents' keys. Text planted in a web page or an attached file is enough to hijack it. Only turn it on for an agent reserved for people you trust.",
    riskyAction: "Turn on anyway",
    mcpTitle: "MCP servers",
    mcpDefault: "The default profile uses all of the instance's active MCP servers.",
    mcpIntro: "The instance's MCP servers this agent can use. Applied from the next message.",
    mcpEmpty: "No MCP servers installed.",
    mcpInstanceOff: " · turned off for the whole instance",
    addMore: "Add connectors from the Marketplace",
  },
  fr: {
    title: "Outils",
    toolsIntro: "Outils que l'agent peut utiliser dans l'app. Pris en compte dès le message suivant.",
    needsConfig: " · configuration requise côté Hermes",
    riskyNote: " · donne accès au serveur",
    riskyTitle: (tool: string) => `Activer « ${tool} » pour cet agent ?`,
    riskyBody:
      "Cet outil donne à l'agent, et à toute personne qui lui écrit, un accès direct au serveur : commandes, fichiers, clés des autres agents. Un texte piégé dans une page web ou un fichier joint suffit à le détourner. À n'activer que pour un agent réservé à des personnes de confiance.",
    riskyAction: "Activer quand même",
    mcpTitle: "Serveurs MCP",
    mcpDefault: "Le profil par défaut utilise tous les serveurs MCP actifs de l'instance.",
    mcpIntro: "Serveurs MCP de l'instance que cet agent peut utiliser. Pris en compte dès le message suivant.",
    mcpEmpty: "Aucun serveur MCP installé.",
    mcpInstanceOff: " · coupé pour toute l'instance",
    addMore: "Ajouter des connecteurs depuis le Marketplace",
  },
});

export default function AgentToolsScreen() {
  const { agentId } = useLocalSearchParams<{ agentId: string }>();
  const router = useRouter();
  const agents = useQuery(adminAgentsQuery);
  const agent = agents.data?.find((a) => a.id === agentId);
  const qc = useQueryClient();
  const toast = useAdminToast();
  const mcp = useQuery(agentMcpQuery(agentId));
  const toolsets = useQuery(toolsetsQuery(agentId));
  const types = useQuery(mcpTypesQuery).data;
  const isDefault = !!agent && isDefaultProfile(agent);
  // Until the agent is known, it may be the default profile: its switches stay locked.
  const locked = isDefault || agents.isPending;

  const toggleMcp = useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      api(`/admin/hermes/agents/${agentId}/mcp/${name}`, { method: "PUT", body: JSON.stringify({ enabled }) }),
    onMutate: ({ name, enabled }) =>
      qc.setQueryData<AgentMcp[]>(agentMcpQuery(agentId).queryKey, (xs) => xs?.map((m) => (m.name === name ? { ...m, enabled } : m))),
    onError: (e) => toast.failed(e),
    onSettled: () => qc.invalidateQueries({ queryKey: agentMcpQuery(agentId).queryKey }),
  });
  const toggleTool = useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      api(`/admin/hermes/agents/${agentId}/toolsets/${name}`, { method: "PUT", body: JSON.stringify({ enabled }) }),
    onMutate: ({ name, enabled }) =>
      qc.setQueryData<Toolset[]>(toolsetsQuery(agentId).queryKey, (xs) => xs?.map((x) => (x.name === name ? { ...x, enabled } : x))),
    onError: (e) => toast.failed(e),
    onSettled: () => qc.invalidateQueries({ queryKey: toolsetsQuery(agentId).queryKey }),
  });

  return (
    <>
      <Stack.Screen.Title>{t.title}</Stack.Screen.Title>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon={headerIcon.plus} iconRenderingMode="template" accessibilityLabel={t.addMore} onPress={withTap(() => router.push(marketplaceHref))} />
      </Stack.Toolbar>
      <AdminGate>
        <SettingsScroll onRefresh={() => Promise.all([mcp.refetch(), toolsets.refetch()])}>
          <ErrorAlert error={mcp.error ?? toolsets.error} />

          {mcp.isPending ? (
            <LoadingRows rows={2} />
          ) : (
            mcp.data && (
              <Section title={t.mcpTitle} footer={isDefault ? t.mcpDefault : t.mcpIntro}>
                {mcp.data.length === 0 ? (
                  <ListGroup.Item disabled>
                    <ListGroup.ItemContent>
                      <ListGroup.ItemDescription>{t.mcpEmpty}</ListGroup.ItemDescription>
                    </ListGroup.ItemContent>
                  </ListGroup.Item>
                ) : (
                  mcp.data.map((m) => (
                    <SwitchRow
                      key={m.name}
                      title={m.name}
                      description={`${m.url ?? m.command ?? ""}${m.instanceEnabled ? "" : t.mcpInstanceOff}`}
                      prefix={<IntegrationTile type={types?.[m.name] ?? guessIntegrationType(m.name)} size="sm" />}
                      value={m.enabled}
                      disabled={locked || !m.instanceEnabled}
                      onChange={(enabled) => toggleMcp.mutate({ name: m.name, enabled })}
                    />
                  ))
                )}
              </Section>
            )
          )}

          {toolsets.isPending ? (
            <LoadingRows rows={4} avatar={false} />
          ) : (
            toolsets.data && (
              <Section title={t.title} footer={t.toolsIntro}>
                {toolsets.data.map((x) => (
                  <SwitchRow
                    key={x.name}
                    title={withoutEmoji(x.label)}
                    description={`${x.description}${x.configured ? "" : t.needsConfig}${x.risky ? t.riskyNote : ""}`}
                    value={x.enabled}
                    onChange={async (enabled) => {
                      if (enabled && x.risky && !(await confirmAction({ title: t.riskyTitle(withoutEmoji(x.label)), description: t.riskyBody, action: t.riskyAction })))
                        return;
                      toggleTool.mutate({ name: x.name, enabled });
                    }}
                  />
                ))}
              </Section>
            )
          )}
        </SettingsScroll>
      </AdminGate>
    </>
  );
}
