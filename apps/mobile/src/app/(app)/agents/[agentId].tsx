import { common } from "@agora/core/i18n";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Button, SkeletonGroup, Typography, useToast } from "heroui-native";
import { ScrollView, View } from "react-native";
import { AgentActivity, ConversationRoutines } from "@/components/agents/agent-activity";
import { AgentScreen } from "@/components/agents/agent-screen";
import { Image } from "expo-image";
import { mascotOf } from "@/components/agent-avatar";
import { headerIcon } from "@/components/header-button";
import { TaskSection } from "@/components/people/task-section";
import { useMe } from "@/components/server-scope";
import { agentHref } from "@/lib/agents-admin";
import { defineMessages, locale, tr } from "@/lib/i18n";
import { agentProfileQuery, useOpenDirect } from "@/lib/profile";
import { withTap } from "@/lib/haptics";
import { dateFormat } from "@/lib/intl";
import { EmptyState } from "@/components/empty-state";
import { WarningIcon } from "@/components/icons";

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
    edit: "Edit",
  },
  fr: {
    unavailable: "Profil indisponible.",
    message: "Écrire",
    openFailed: "Impossible d'ouvrir la conversation.",
    botSince: (date: string) => `Bot · depuis ${date}`,
    botTasks: "Tâches qu'il a créées",
    noBotTasks: "Il n'a encore créé aucune tâche.",
    edit: "Modifier",
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
      {/* Opened from its conversation, the page is a sheet (Figma « Fiche de l'agent »): a close button. */}
      {!!conversationId && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button icon={headerIcon.close} iconRenderingMode="template" accessibilityLabel={c.close} onPress={withTap(() => router.back())} />
        </Stack.Toolbar>
      )}
      <ScrollView contentInsetAdjustmentBehavior="automatic" className="bg-background" contentContainerClassName="gap-6 px-4 pb-12">
        {error ? (
          <EmptyState icon={WarningIcon} description={t.unavailable} action={{ label: c.retry, onPress: () => refetch() }} />
        ) : !agent ? (
          <SkeletonGroup isLoading isSkeletonOnly className="items-center gap-3 pt-2">
            <SkeletonGroup.Item className="size-24 rounded-full" />
            <SkeletonGroup.Item className="h-6 w-44 rounded-md" />
            <SkeletonGroup.Item className="h-4 w-28 rounded-md" />
            <SkeletonGroup.Item className="mt-4 h-11 w-full rounded-full" />
          </SkeletonGroup>
        ) : (
          <>
            {/* Figma « Fiche de l'agent »: its clay portrait, its name, its actions as grey pills. */}
            <View className="flex-row items-center gap-4 pt-2">
              <Image source={mascotOf(agent.avatar.color).figure} contentFit="cover" className="size-[104px] rounded-2xl" accessibilityIgnoresInvertColors />
              <View className="min-w-0 flex-1 gap-2">
                <View className="gap-0.5">
                  <Typography.Heading type="h4" numberOfLines={1}>
                    {agent.name}
                  </Typography.Heading>
                  <Typography type="body-sm" color="muted" numberOfLines={1}>
                    {t.botSince(dateFormat(locale, { month: "long", year: "numeric" }).format(new Date(agent.createdAt)))}
                  </Typography>
                </View>
                <View className="flex-row flex-wrap gap-2">
                  {/* You may write to it, once it's configured; not from its own conversation. */}
                  {!conversationId && agent.access && !agent.onboarding && (
                    <Button
                      size="sm"
                      variant="secondary"
                      isDisabled={open.isPending}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        open.mutate({ agentId: agent.id }, { onError: () => toast.show({ variant: "danger", label: t.openFailed }) });
                      }}
                    >
                      {t.message}
                    </Button>
                  )}
                  {/* Admins jump to the bot's settings (Profile › Administration › Agents). */}
                  {admin && (
                    <Button size="sm" variant="secondary" onPress={withTap(() => router.push(agentHref(agentId)))}>
                      {t.edit}
                    </Button>
                  )}
                </View>
              </View>
            </View>

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
