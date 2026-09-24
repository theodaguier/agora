import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { Chip, ListGroup, SkeletonGroup, Spinner, Typography } from "heroui-native";
import { View } from "react-native";
import { RoutineRow } from "@/components/agents/routine-row";
import { conversationTitle } from "@/components/participants";
import { ToolIcon } from "@/components/icons";
import { PressableItem, Section, SectionNote } from "@/components/people/section";
import { useMe } from "@/components/server-scope";
import { defineMessages } from "@/lib/i18n";
import { agentActivityQuery, type AgentActivity } from "@/lib/profile";
import { conversationsQuery, routinesQuery } from "@/lib/queries";

/* BotActivity of apps/web/src/components/ProfileSheet.tsx, and the routines of RightPanel.tsx */

const messages = defineMessages({
  en: {
    now: "Right now",
    idle: "Not working on anything right now.",
    elsewhere: "Working in a conversation you're not part of.",
    alsoElsewhere: (n: number) => (n === 1 ? "And in another conversation you're not part of." : `And in ${n} other conversations you're not part of.`),
    using: "Using",
    writing: "Writing a reply",
    routines: "Routines",
    noRoutines: "No routines in your conversations.",
    noRoutinesHere: "No routines.",
    conversation: "Conversation",
    routinesHelp: "What's a routine?",
    routinesHelpBody: "A task the bot runs by itself on a schedule, in a conversation: a morning summary, a weekly check… Tap one to change its name or schedule.",
  },
  fr: {
    now: "En ce moment",
    idle: "Ne travaille sur rien en ce moment.",
    elsewhere: "Travaille dans une conversation dont tu ne fais pas partie.",
    alsoElsewhere: (n: number) =>
      n === 1 ? "Et dans une autre conversation dont tu ne fais pas partie." : `Et dans ${n} autres conversations dont tu ne fais pas partie.`,
    using: "Utilise",
    writing: "Rédige une réponse",
    routines: "Routines",
    noRoutines: "Aucune routine dans tes conversations.",
    noRoutinesHere: "Aucune routine.",
    conversation: "Conversation",
    routinesHelp: "C'est quoi, une routine ?",
    routinesHelpBody: "Une tâche que le bot lance tout seul à heure fixe, dans une conversation : un résumé du matin, un point hebdomadaire… Touche-la pour changer son nom ou sa planification.",
  },
});

const routinesHelp = { title: messages.routinesHelp, description: messages.routinesHelpBody, label: messages.routinesHelp };

/** Title of one of your conversations, by id. */
function useConversationTitle() {
  const me = useMe();
  const { data: conversations = [] } = useQuery(conversationsQuery);
  return (id: string) => {
    const c = conversations.find((x) => x.id === id);
    return c ? conversationTitle(c, me.id) : null;
  };
}

/** What the bot is doing right now and the routines it runs, in your conversations only. */
export function AgentActivity({ agentId }: { agentId: string }) {
  const t = messages;
  const { data: activity } = useQuery(agentActivityQuery(agentId));
  const titleOf = useConversationTitle();
  if (!activity)
    return (
      <SkeletonGroup isLoading isSkeletonOnly className="gap-3">
        <SkeletonGroup.Item className="ms-2 h-4 w-24 rounded-md" />
        <SkeletonGroup.Item className="h-14 w-full rounded-2xl" />
        <SkeletonGroup.Item className="ms-2 mt-3 h-4 w-20 rounded-md" />
        <SkeletonGroup.Item className="h-14 w-full rounded-2xl" />
      </SkeletonGroup>
    );
  return (
    <>
      <Section title={t.now} inset="ml-12" footer={activity.turns.length > 0 && activity.elsewhere > 0 ? t.alsoElsewhere(activity.elsewhere) : undefined}>
        {activity.turns.length ? (
          activity.turns.map((turn) => <TurnRow key={`${turn.conversationId}:${turn.startedAt}`} turn={turn} title={titleOf(turn.conversationId)} />)
        ) : (
          <SectionNote>{activity.elsewhere ? t.elsewhere : t.idle}</SectionNote>
        )}
      </Section>
      <Section title={t.routines} help={routinesHelp} inset="ml-12">
        {activity.routines.length ? (
          activity.routines.map((r) => (
            <RoutineRow key={r.id} agentId={agentId} conversationId={r.conversationId} routine={r} conversation={titleOf(r.conversationId)} />
          ))
        ) : (
          <SectionNote>{t.noRoutines}</SectionNote>
        )}
      </Section>
    </>
  );
}

function TurnRow({ turn, title }: { turn: AgentActivity["turns"][number]; title: string | null }) {
  const t = messages;
  return (
    <Link href={{ pathname: "/c/[conversationId]", params: { conversationId: turn.conversationId } }} asChild>
      <PressableItem>
        <ListGroup.ItemPrefix>
          <Spinner size="sm" />
        </ListGroup.ItemPrefix>
        <ListGroup.ItemContent className="gap-1">
          <ListGroup.ItemTitle numberOfLines={1}>
            {title ?? t.conversation}
          </ListGroup.ItemTitle>
          {turn.tool ? (
            <View className="flex-row items-center gap-1.5">
              <Typography type="body-sm" color="muted">
                {t.using}
              </Typography>
              <Chip size="sm" variant="secondary" color="default">
                <ToolIcon name={turn.tool} className="size-3.5 text-foreground" />
                <Chip.Label>{turn.tool}</Chip.Label>
              </Chip>
            </View>
          ) : (
            <ListGroup.ItemDescription>{t.writing}</ListGroup.ItemDescription>
          )}
        </ListGroup.ItemContent>
        <ListGroup.ItemSuffix />
      </PressableItem>
    </Link>
  );
}

/** The routines of one conversation with the bot (the web's side panel of a direct conversation). */
export function ConversationRoutines({ agentId, conversationId }: { agentId: string; conversationId: string }) {
  const { data: routines = [] } = useQuery(routinesQuery(conversationId));
  return (
    <Section title={messages.routines} help={routinesHelp} inset="ml-12">
      {routines.length ? (
        routines.map((r) => <RoutineRow key={r.id} agentId={agentId} conversationId={conversationId} routine={r} mentionable />)
      ) : (
        <SectionNote>{messages.noRoutinesHere}</SectionNote>
      )}
    </Section>
  );
}
