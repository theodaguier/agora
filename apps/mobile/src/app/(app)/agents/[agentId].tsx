import { common } from "@agora/core/i18n";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Button, SkeletonGroup, Typography, useToast } from "heroui-native";
import { ScrollView, View } from "react-native";
import { AgentActivity, ConversationRoutines } from "@/components/agents/agent-activity";
import { AgentScreen } from "@/components/agents/agent-screen";
import { ProfileHeader } from "@/components/people/profile-header";
import { TaskSection } from "@/components/people/task-section";
import { useMe } from "@/components/server-scope";
import { agentHref } from "@/lib/agents-admin";
import { defineMessages, locale, tr } from "@/lib/i18n";
import { agentProfileQuery, useOpenDirect } from "@/lib/profile";
import { SlidersIcon } from "@/components/icons";
import { headerIcon } from "@/components/header-button";
import { withTap } from "@/lib/haptics";
import { dateFormat } from "@/lib/intl";

/*
 * apps/web/src/components/ProfileSheet.tsx (BotProfile). Opened from a conversation with the bot
 * (`conversationId`), it also shows what the web's side panel (RightPanel.tsx) shows there:
 * the bot's live screen and the conversation's routines.
 */

const messages = defineMessages({
  en: {
    unavailable: "Profile unavailable.",
    message: "Message",
    openFailed: "Couldn't open the conversation.",
    botSince: (date: string) => `Bot · since ${date}`,
    botTasks: "Tasks it created",
    noBotTasks: "It hasn't created any tasks yet.",
    editBot: "Edit the bot",
  },
  fr: {
    unavailable: "Profil indisponible.",
    message: "Écrire",
    openFailed: "Impossible d'ouvrir la conversation.",
    botSince: (date: string) => `Bot · depuis ${date}`,
    botTasks: "Tâches qu'il a créées",
    noBotTasks: "Il n'a encore créé aucune tâche.",
    editBot: "Modifier le bot",
  },
});

export default function BotProfile() {
  const { agentId, conversationId } = useLocalSearchParams<{ agentId: string; conversationId?: string }>();
  const { data: agent, error, refetch } = useQuery(agentProfileQuery(agentId));
  const open = useOpenDirect();
  const { toast } = useToast();
  const c = tr(common);
  const admin = useMe().role === "admin";
  const t = messages;

  return (
    <>
      <Stack.Screen options={{ title: "", headerTransparent: true, headerShadowVisible: false }} />
      {/* Admins jump to the bot's settings (Profile › Administration › Agents). */}
      {admin && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button icon={headerIcon.sliders} iconRenderingMode="template" accessibilityLabel={t.editBot} onPress={withTap(() => router.push(agentHref(agentId)))} />
        </Stack.Toolbar>
      )}
      <ScrollView contentInsetAdjustmentBehavior="automatic" className="bg-background" contentContainerClassName="gap-6 px-4 pb-12">
        {error ? (
          <View className="items-center gap-4 py-12">
            <Typography color="muted" align="center">
              {t.unavailable}
            </Typography>
            <Button variant="secondary" onPress={withTap(() => refetch())}>
              {c.retry}
            </Button>
          </View>
        ) : !agent ? (
          <SkeletonGroup isLoading isSkeletonOnly className="items-center gap-3 pt-2">
            <SkeletonGroup.Item className="size-24 rounded-full" />
            <SkeletonGroup.Item className="h-6 w-44 rounded-md" />
            <SkeletonGroup.Item className="h-4 w-28 rounded-md" />
            <SkeletonGroup.Item className="mt-4 h-11 w-full rounded-full" />
          </SkeletonGroup>
        ) : (
          <>
            <ProfileHeader
              p={{ kind: "agent", agent }}
              name={agent.name}
              subtitle={t.botSince(dateFormat(locale, { month: "long", year: "numeric" }).format(new Date(agent.createdAt)))}
            >
              {/* You may write to it, once it's configured. */}
              {agent.access && !agent.onboarding && (
                <View className="mt-4 w-full">
                  <Button
                    isDisabled={open.isPending}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      open.mutate({ agentId: agent.id }, { onError: () => toast.show({ variant: "danger", label: t.openFailed }) });
                    }}
                  >
                    {t.message}
                  </Button>
                </View>
              )}
            </ProfileHeader>

            {conversationId ? (
              <>
                <View className="gap-1.5">
                  <AgentScreen conversationId={conversationId} agentName={agent.name} />
                </View>
                <ConversationRoutines agentId={agentId} conversationId={conversationId} />
              </>
            ) : (
              <AgentActivity agentId={agentId} />
            )}

            <TaskSection title={t.botTasks} empty={t.noBotTasks} agentId={agentId} />
          </>
        )}
      </ScrollView>
    </>
  );
}
