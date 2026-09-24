import { useQuery } from "@tanstack/react-query";
import { Link, Stack, useLocalSearchParams } from "expo-router";
import { ListGroup, Typography } from "heroui-native";
import { View } from "react-native";
import { AgentAvatar } from "@/components/agent-avatar";
import { AdminGate, SettingsScroll, LoadingRows, PressableRow, Section } from "@/components/admin/ui";
import { BookOpenIcon, BrainIcon, KeyIcon, LayersIcon, PlugIcon, SparklesIcon, UserIcon, type IconComponent } from "@/components/icons";
import {
  adminAgentsQuery,
  adminUsersQuery,
  agentHref,
  agentModelQuery,
  skillsQuery,
  toolsetsQuery,
  type AdminAgent,
  type AgentSection,
} from "@/lib/agents-admin";
import { defineMessages } from "@/lib/i18n";

/* apps/web/src/components/admin/AgentDetail.tsx: the web's tabs become rows of an iOS settings screen. */

const t = defineMessages<{
  sections: Record<AgentSection, string>;
  profile: (name: string) => string;
  help: Record<AgentSection, string>;
  on: (n: number, total: number) => string;
  people: (n: number, total: number) => string;
  identity: string;
  capabilities: string;
  notFound: string;
}>({
  en: {
    sections: { profile: "Profile", soul: "Personality", model: "Model", tools: "Tools", skills: "Skills", memory: "Memory", access: "Access" },
    profile: (name) => `Hermes profile: ${name}`,
    help: {
      profile: "Name and avatar",
      soul: "Identity, role and tone",
      model: "",
      tools: "MCP servers and toolsets",
      skills: "",
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
    sections: { profile: "Profil", soul: "Personnalité", model: "Modèle", tools: "Outils", skills: "Skills", memory: "Mémoire", access: "Accès" },
    profile: (name) => `profil Hermes : ${name}`,
    help: {
      profile: "Nom et avatar",
      soul: "Identité, rôle et ton",
      model: "",
      tools: "Serveurs MCP et outils",
      skills: "",
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
          <Typography.Paragraph type="body-sm" color="muted" align="center" className="px-8 pt-24">
            {t.notFound}
          </Typography.Paragraph>
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

  const value: Partial<Record<AgentSection, string>> = {
    model: model.data?.defaultModel,
    tools: toolsets.data && t.on(toolsets.data.filter((x) => x.enabled).length, toolsets.data.length),
    skills: skills.data && t.on(skills.data.filter((x) => x.enabled).length, skills.data.length),
    access: users.data && t.people(users.data.filter((u) => u.agents.includes(agent.id)).length, users.data.length),
  };

  const row = (section: AgentSection) => {
    const Icon = ICONS[section];
    const detail = value[section] ?? t.help[section];
    return (
      <Link key={section} href={agentHref(agent.id, section)} asChild>
        <PressableRow>
          <ListGroup.ItemPrefix>
            <Icon className="size-6 text-accent" />
          </ListGroup.ItemPrefix>
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
    <SettingsScroll onRefresh={() => Promise.all([model.refetch(), toolsets.refetch(), skills.refetch(), users.refetch()])}>
      <View className="items-center gap-2 pt-2">
        <AgentAvatar agent={{ avatar: { shape: agent.avatarShape, color: agent.avatarColor } }} size={96} />
        <Typography.Paragraph type="body-sm" color="muted">
          {t.profile(agent.hermesProfile)}
        </Typography.Paragraph>
      </View>
      <Section title={t.identity}>{(["profile", "soul", "memory"] as const).map(row)}</Section>
      <Section title={t.capabilities}>{(["model", "tools", "skills", "access"] as const).map(row)}</Section>
    </SettingsScroll>
  );
}
