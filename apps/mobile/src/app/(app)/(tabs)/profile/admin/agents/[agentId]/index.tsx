import { useQuery } from "@tanstack/react-query";
import { Link, Stack, useLocalSearchParams } from "expo-router";
import { modelName } from "@agora/core";
import { ListGroup } from "heroui-native";
import { View } from "react-native";
import { AgentAvatar } from "@/components/agent-avatar";
import { AdminGate, SettingsScroll, LoadingRows, PressableRow, Section, SettingTile } from "@/components/admin/ui";
import { BookOpenIcon, BotIcon, BrainIcon, GlobeIcon, KeyIcon, LayersIcon, PlugIcon, SparklesIcon, UserIcon, type IconComponent } from "@/components/icons";
import {
  adminAgentsQuery,
  adminUsersQuery,
  agentHref,
  agentModelQuery,
  agentTriggersQuery,
  skillsQuery,
  toolsetsQuery,
  type AdminAgent,
  type AgentSection,
} from "@/lib/agents-admin";
import { defineMessages } from "@/lib/i18n";
import { EmptyState } from "@/components/empty-state";

/* apps/web/src/components/admin/AgentDetail.tsx: the web's tabs become rows of an iOS settings screen. */

const t = defineMessages<{
  sections: Record<AgentSection, string>;
  help: Record<AgentSection, string>;
  on: (n: number, total: number) => string;
  people: (n: number, total: number) => string;
  identity: string;
  capabilities: string;
  notFound: string;
}>({
  en: {
    sections: { profile: "Profile", soul: "Personality", model: "Model", tools: "Tools", skills: "Skills", triggers: "Triggers", memory: "Memory", access: "Access" },
    help: {
      profile: "Name and avatar",
      soul: "Identity, role and tone",
      model: "",
      tools: "MCP servers and toolsets",
      skills: "",
      triggers: "Addresses that start it on their own",
      memory: "What the agent remembered",
      access: "",
    },
    on: (n, total) => `${n} of ${total} on`,
    people: (n, total) => `${n} of ${total} people`,
    identity: "Identity",
    capabilities: "Capabilities",
    notFound: "This agent no longer exists.",
  },
  fr: {
    sections: { profile: "Profil", soul: "Personnalité", model: "Modèle", tools: "Outils", skills: "Skills", triggers: "Déclencheurs", memory: "Mémoire", access: "Accès" },
    help: {
      profile: "Nom et avatar",
      soul: "Identité, rôle et ton",
      model: "",
      tools: "Serveurs MCP et outils",
      skills: "",
      triggers: "Des adresses qui le lancent tout seul",
      memory: "Ce que l'agent a retenu",
      access: "",
    },
    on: (n, total) => `${n} sur ${total} actifs`,
    people: (n, total) => `${n} personne${n > 1 ? "s" : ""} sur ${total}`,
    identity: "Identité",
    capabilities: "Capacités",
    notFound: "Cet agent n'existe plus.",
  },
});

const ICONS: Record<AgentSection, IconComponent> = {
  profile: UserIcon,
  soul: SparklesIcon,
  model: LayersIcon,
  tools: PlugIcon,
  skills: BookOpenIcon,
  triggers: GlobeIcon,
  memory: BrainIcon,
  access: KeyIcon,
};

export default function AgentScreen() {
  const { agentId } = useLocalSearchParams<{ agentId: string }>();
  const agents = useQuery(adminAgentsQuery);
  const agent = agents.data?.find((a) => a.id === agentId);
  return (
    <>
      <Stack.Screen.Title>{agent?.name ?? ""}</Stack.Screen.Title>
      <AdminGate>
        {agent ? (
          <AgentDetail agent={agent} />
        ) : agents.isPending ? (
          <SettingsScroll>
            <LoadingRows rows={4} />
          </SettingsScroll>
        ) : (
          <EmptyState icon={BotIcon} description={t.notFound} className="pt-24" />
        )}
      </AdminGate>
    </>
  );
}

function AgentDetail({ agent }: { agent: AdminAgent }) {
  const model = useQuery(agentModelQuery(agent.id));
  const toolsets = useQuery(toolsetsQuery(agent.id));
  const skills = useQuery(skillsQuery(agent.id));
  const users = useQuery(adminUsersQuery);
  const triggers = useQuery(agentTriggersQuery(agent.id));

  const value: Partial<Record<AgentSection, string>> = {
    model: model.data?.defaultModel && modelName(model.data.defaultModel),
    tools: toolsets.data && t.on(toolsets.data.filter((x) => x.enabled).length, toolsets.data.length),
    skills: skills.data && t.on(skills.data.filter((x) => x.enabled).length, skills.data.length),
    triggers: triggers.data?.length ? t.on(triggers.data.filter((x) => x.enabled).length, triggers.data.length) : undefined,
    access: users.data && t.people(users.data.filter((u) => u.agents.includes(agent.id)).length, users.data.length),
  };

  const row = (section: AgentSection) => {
    const Icon = ICONS[section];
    const detail = value[section] ?? t.help[section];
    return (
      <Link key={section} href={agentHref(agent.id, section)} asChild>
        <PressableRow>
          <SettingTile icon={Icon} />
          <ListGroup.ItemContent>
            <ListGroup.ItemTitle>{t.sections[section]}</ListGroup.ItemTitle>
            {!!detail && <ListGroup.ItemDescription numberOfLines={1}>{detail}</ListGroup.ItemDescription>}
          </ListGroup.ItemContent>
          <ListGroup.ItemSuffix />
        </PressableRow>
      </Link>
    );
  };

  return (
    <SettingsScroll onRefresh={() => Promise.all([model.refetch(), toolsets.refetch(), skills.refetch(), triggers.refetch(), users.refetch()])}>
      {/* Its avatar; its name is the header's. */}
      <View className="items-center pt-2">
        <AgentAvatar agent={{ avatar: { shape: agent.avatarShape, color: agent.avatarColor } }} size={96} />
      </View>
      <Section title={t.identity}>{(["profile", "soul", "memory"] as const).map(row)}</Section>
      <Section title={t.capabilities}>{(["model", "tools", "skills", "triggers", "access"] as const).map(row)}</Section>
    </SettingsScroll>
  );
}
