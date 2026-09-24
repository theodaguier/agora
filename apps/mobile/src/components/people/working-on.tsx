import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Alert, Button, LinkButton, PressableFeedback, Typography } from "heroui-native";
import { View } from "react-native";
import { useMe } from "@/components/server-scope";
import { withTap } from "@/lib/haptics";
import { defineMessages } from "@/lib/i18n";
import { userProfileQuery } from "@/lib/queries";
import { taskHref, useWorkingOn } from "@/lib/tasks";

/* apps/web/src/components/WorkingOn.tsx: one HeroUI Alert for the profiles and your own tasks screen. */

const messages = defineMessages({
  en: {
    you: (title: string) => `You're working on “${title}”`,
    them: (title: string) => `Working on “${title}”`,
    nothingYou: "Not working on anything. Start a task to show it here.",
    stop: "Stop",
    seeTasks: "See my tasks",
  },
  fr: {
    you: (title: string) => `Tu travailles sur « ${title} »`,
    them: (title: string) => `Travaille sur « ${title} »`,
    nothingYou: "Tu ne travailles sur rien. Passe une tâche en cours pour l'afficher ici.",
    stop: "Arrêter",
    seeTasks: "Voir mes tâches",
  },
});

/** Sets the task you are working on (null: nothing). */
export { useWorkingOn };

/** Title of the task someone is working on, for a discreet status line (null: nothing, or not a person). */
export function useCurrentTaskTitle(userId: string | null) {
  const { data } = useQuery({ ...userProfileQuery(userId ?? ""), enabled: !!userId });
  return userId ? (data?.currentTask?.title ?? null) : null;
}

/**
 * The task someone is working on right now, in the in-progress color; yours can be stopped.
 * `openable`: a tap opens the task. `quiet`: nothing at all when nothing is in progress (your tasks
 * screen, where the in-progress filter is right below), instead of the hint on your profile.
 */
export function WorkingOn({ userId, openable, quiet }: { userId: string; openable?: boolean; quiet?: boolean }) {
  const me = useMe();
  const router = useRouter();
  const { data } = useQuery(userProfileQuery(userId));
  const set = useWorkingOn();
  const self = userId === me.id;
  const current = data?.currentTask;
  if (!data || (!current && (!self || quiet))) return null;
  if (!current)
    return (
      <View className="items-center gap-1 px-4">
        <Typography type="body-sm" color="muted" align="center">
          {messages.nothingYou}
        </Typography>
        <LinkButton size="sm" onPress={withTap(() => router.navigate("/tasks"))}>
          {messages.seeTasks}
        </LinkButton>
      </View>
    );
  const alert = (
    <Alert status="warning">
      <Alert.Content>
        <Alert.Title numberOfLines={2}>{self ? messages.you(current.title) : messages.them(current.title)}</Alert.Title>
      </Alert.Content>
      {self && (
        <Button size="sm" variant="ghost" isDisabled={set.isPending} onPress={withTap(() => set.mutate(null))}>
          {messages.stop}
        </Button>
      )}
    </Alert>
  );
  if (!openable) return alert;
  return (
    <PressableFeedback accessibilityRole="button" onPress={withTap(() => router.push(taskHref(current.id)))}>
      {alert}
    </PressableFeedback>
  );
}
