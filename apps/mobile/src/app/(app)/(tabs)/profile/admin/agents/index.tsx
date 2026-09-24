import { useQuery } from "@tanstack/react-query";
import { Link, Stack, useRouter } from "expo-router";
import { ListGroup, Typography } from "heroui-native";
import { useState } from "react";
import { AgentAvatar } from "@/components/agent-avatar";
import { AdminGate, ErrorAlert, SettingsScroll, Intro, LoadingRows, PressableRow, SearchBox, Section } from "@/components/admin/ui";
import { adminAgentsQuery, agentHref, newAgentHref, type AdminAgent } from "@/lib/agents-admin";
import { defineMessages } from "@/lib/i18n";
import { headerIcon } from "@/components/header-button";
import { withTap } from "@/lib/haptics";

/* apps/web/src/components/admin/Agents.tsx */

const t = defineMessages({
  en: {
    title: "Agents",
    text: "Each agent is a Hermes profile with its own model, tools and skills.",
    newAgent: "New agent",
    search: "Search agents",
    noMatch: "No agent matches.",
  },
  fr: {
    title: "Agents",
    text: "Chaque agent est un profil Hermes : son modèle, ses outils et ses skills lui sont propres.",
    newAgent: "Nouvel agent",
    search: "Chercher un agent",
    noMatch: "Aucun agent ne correspond.",
  },
});

export default function AgentsScreen() {
  const router = useRouter();
  return (
    <>
      <Stack.Screen.Title>{t.title}</Stack.Screen.Title>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon={headerIcon.plus} iconRenderingMode="template" accessibilityLabel={t.newAgent} onPress={withTap(() => router.push(newAgentHref))} />
      </Stack.Toolbar>
      <AdminGate>
        <Agents />
      </AdminGate>
    </>
  );
}

function Agents() {
  const [q, setQ] = useState("");
  const agents = useQuery(adminAgentsQuery);
  const list = (agents.data ?? []).filter((a) => `${a.name} ${a.hermesProfile}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <SettingsScroll onRefresh={agents.refetch}>
        <Intro>{t.text}</Intro>
        {!!agents.data?.length && <SearchBox value={q} onChange={setQ} placeholder={t.search} />}
        <ErrorAlert error={agents.error} />
        {agents.isPending ? (
          <LoadingRows rows={4} />
        ) : list.length ? (
          <Section>
            {list.map((a) => (
              <AgentRow key={a.id} agent={a} />
            ))}
          </Section>
        ) : (
          !!q && (
            <Typography.Paragraph type="body-sm" color="muted" align="center" className="px-4">
              {t.noMatch}
            </Typography.Paragraph>
          )
        )}
      </SettingsScroll>
    </>
  );
}

/** One bot: peek at its settings with a long press, open them with a tap. */
function AgentRow({ agent: a }: { agent: AdminAgent }) {
  return (
    <Link href={agentHref(a.id)} asChild>
      <Link.Trigger>
        <PressableRow>
          <ListGroup.ItemPrefix>
            <AgentAvatar agent={{ avatar: { shape: a.avatarShape, color: a.avatarColor } }} size={40} />
          </ListGroup.ItemPrefix>
          <ListGroup.ItemContent>
            <ListGroup.ItemTitle numberOfLines={1}>{a.name}</ListGroup.ItemTitle>
            <ListGroup.ItemDescription numberOfLines={1}>{a.hermesProfile}</ListGroup.ItemDescription>
          </ListGroup.ItemContent>
          <ListGroup.ItemSuffix />
        </PressableRow>
      </Link.Trigger>
      <Link.Preview />
    </Link>
  );
}
