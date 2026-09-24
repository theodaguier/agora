import { common } from "@agora/core/i18n";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Stack, useLocalSearchParams } from "expo-router";
import { Button, ListGroup, SkeletonGroup, Typography, useToast } from "heroui-native";
import { Linking, ScrollView, View } from "react-native";
import { CommonConversations } from "@/components/people/common-conversations";
import { ProfileHeader } from "@/components/people/profile-header";
import { PressableItem, Section } from "@/components/people/section";
import { TaskSection } from "@/components/people/task-section";
import { WorkingOn } from "@/components/people/working-on";
import { useMe } from "@/components/server-scope";
import { withTap } from "@/lib/haptics";
import { defineMessages, locale, tr } from "@/lib/i18n";
import { useOpenDirect } from "@/lib/profile";
import { userProfileQuery } from "@/lib/queries";
import { dateFormat } from "@/lib/intl";

/* apps/web/src/components/ProfileSheet.tsx (Profile) and PersonPanel.tsx */

const messages = defineMessages({
  en: {
    unavailable: "Profile unavailable.",
    noTasks: "No tasks.",
    message: "Message",
    openFailed: "Couldn't open the conversation.",
    email: "Email",
    memberSince: "Member since",
    about: "About",
    tasks: "Tasks",
  },
  fr: {
    unavailable: "Profil indisponible.",
    noTasks: "Aucune tâche.",
    message: "Écrire",
    openFailed: "Impossible d'ouvrir la conversation.",
    email: "Email",
    memberSince: "Membre depuis",
    about: "À propos",
    tasks: "Tâches",
  },
});

/** A colleague's profile (or yours): who they are, what they work on, the conversations you share, their tasks. */
export default function PersonProfile() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const me = useMe();
  const self = userId === me.id;
  const { data: person, error, refetch } = useQuery(userProfileQuery(userId));
  const open = useOpenDirect();
  const { toast } = useToast();
  const t = messages;
  const c = tr(common);

  return (
    <>
      <Stack.Screen options={{ title: "", headerTransparent: true, headerShadowVisible: false }} />
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
        ) : !person ? (
          <SkeletonGroup isLoading isSkeletonOnly className="items-center gap-3 pt-2">
            <SkeletonGroup.Item className="size-24 rounded-full" />
            <SkeletonGroup.Item className="h-6 w-44 rounded-md" />
            <SkeletonGroup.Item className="h-4 w-28 rounded-md" />
            <SkeletonGroup.Item className="mt-4 h-11 w-full rounded-full" />
          </SkeletonGroup>
        ) : (
          <>
            <ProfileHeader
              p={{ kind: "user", person }}
              name={person.name}
              subtitle={[person.title, person.username && `@${person.username}`].filter(Boolean).join(" · ")}
            >
              {/* The contact card's actions: write to them, email them. */}
              {!self && (
                <View className="mt-4 w-full flex-row gap-2">
                  <Button
                    className="flex-1"
                    isDisabled={open.isPending}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      open.mutate({ userId: person.id }, { onError: () => toast.show({ variant: "danger", label: t.openFailed }) });
                    }}
                  >
                    {t.message}
                  </Button>
                  <Button className="flex-1" variant="secondary" onPress={withTap(() => Linking.openURL(`mailto:${person.email}`))}>
                    {t.email}
                  </Button>
                </View>
              )}
            </ProfileHeader>

            <WorkingOn userId={userId} />

            {!!person.bio && (
              <Section title={t.about}>
                <ListGroup.Item disabled>
                  <ListGroup.ItemContent>
                    <Typography>{person.bio}</Typography>
                  </ListGroup.ItemContent>
                </ListGroup.Item>
              </Section>
            )}

            <Section>
              <PressableItem key="email" onPress={() => Linking.openURL(`mailto:${person.email}`)}>
                <ListGroup.ItemContent>
                  <ListGroup.ItemDescription>{t.email}</ListGroup.ItemDescription>
                  <ListGroup.ItemTitle numberOfLines={1}>{person.email}</ListGroup.ItemTitle>
                </ListGroup.ItemContent>
                <ListGroup.ItemSuffix />
              </PressableItem>
              <ListGroup.Item key="since" disabled>
                <ListGroup.ItemContent>
                  <ListGroup.ItemDescription>{t.memberSince}</ListGroup.ItemDescription>
                  <ListGroup.ItemTitle>
                    {dateFormat(locale, { month: "long", year: "numeric" }).format(new Date(person.createdAt))}
                  </ListGroup.ItemTitle>
                </ListGroup.ItemContent>
              </ListGroup.Item>
            </Section>

            {!self && <CommonConversations userId={userId} />}

            <TaskSection title={t.tasks} empty={t.noTasks} userId={userId} />
          </>
        )}
      </ScrollView>
    </>
  );
}
