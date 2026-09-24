import { common } from "@agora/core/i18n";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { ListGroup, useToast } from "heroui-native";
import { mentionInComposer } from "@/components/agents/routine-mention";
import { confirmAction } from "@/components/confirm-action";
import { ClockIcon } from "@/components/icons";
import { dividerLabel } from "@/lib/dates";
import { defineMessages, tr } from "@/lib/i18n";
import { useDeleteRoutine, useToggleRoutine } from "@/lib/profile";
import type { Routine } from "@/lib/queries";
import { scheduleLabel } from "@/lib/routines";
import { MenuButton } from "@/components/menus";
import { PressableItem } from "@/components/people/section";

/* RoutineItem of apps/web/src/components/RightPanel.tsx / ProfileSheet.tsx, and RoutineActions of RoutineDialog.tsx */

const messages = defineMessages({
  en: {
    next: (when: string) => `Next: ${when}`,
    paused: "Paused",
    failed: "Action failed.",
    actions: "Routine actions",
    mention: "Mention in the conversation",
    pause: "Pause",
    resume: "Resume",
    deleteTitle: "Delete this routine?",
    deleteBody: (name: string) => `“${name}” will no longer run. This can't be undone.`,
    pausedDone: "Routine paused",
    resumedDone: "Routine resumed",
    deletedDone: "Routine deleted",
  },
  fr: {
    next: (when: string) => `Prochaine : ${when.charAt(0).toLowerCase()}${when.slice(1)}`,
    paused: "En pause",
    failed: "Action impossible.",
    actions: "Actions de la routine",
    mention: "Mentionner dans la conversation",
    pause: "Mettre en pause",
    resume: "Reprendre",
    deleteTitle: "Supprimer cette routine ?",
    deleteBody: (name: string) => `« ${name} » ne s'exécutera plus. Action irréversible.`,
    pausedDone: "Routine mise en pause",
    resumedDone: "Routine reprise",
    deletedDone: "Routine supprimée",
  },
});

/**
 * A routine: name, schedule, next run or "Paused", and the conversation it runs in when given.
 * The "…" HeroUI menu edits (sheet), pauses/resumes or deletes it (after confirmation); opened from
 * a conversation (`mentionable`), it also mentions the routine in that conversation's composer.
 */
export function RoutineRow({
  agentId,
  conversationId,
  routine,
  conversation,
  mentionable,
}: {
  agentId: string;
  conversationId: string;
  routine: Routine;
  conversation?: string | null;
  mentionable?: boolean;
}) {
  const t = messages;
  const c = tr(common);
  const toggle = useToggleRoutine(conversationId, routine);
  const remove = useDeleteRoutine(conversationId, routine);
  const { toast } = useToast();
  const when = routine.enabled ? (routine.nextRunAt ? t.next(dividerLabel(new Date(routine.nextRunAt))) : null) : t.paused;
  const failed = (error: Error) => toast.show({ variant: "danger", label: error.message || t.failed });

  const toggleNow = () => {
    if (toggle.isPending) return;
    const pausing = routine.enabled;
    // mutateAsync: the toast comes even if the row re-renders or goes away meanwhile.
    toggle.mutateAsync().then(() => toast.show({ variant: "success", label: pausing ? t.pausedDone : t.resumedDone }), failed);
  };

  const edit = () =>
    router.push({ pathname: "/agents/[agentId]/routines/[routineId]", params: { agentId, routineId: routine.id, conversationId } });

  // Back to the conversation, where the composer picks the routine up as a chip.
  const mention = () => {
    Haptics.selectionAsync();
    router.dismissTo({ pathname: "/c/[conversationId]", params: { conversationId } });
    mentionInComposer(conversationId, { kind: "routine", id: routine.id, name: routine.name });
  };

  return (
    <PressableItem onPress={edit} itemClassName="items-start">
      <ListGroup.ItemPrefix className="pt-0.5">
        <ClockIcon className={routine.enabled ? "size-5 text-success" : "size-5 text-muted"} />
      </ListGroup.ItemPrefix>
      <ListGroup.ItemContent className="gap-0.5">
        <ListGroup.ItemTitle numberOfLines={2}>
          {routine.name}
        </ListGroup.ItemTitle>
        <ListGroup.ItemDescription>{[scheduleLabel(routine), when].filter(Boolean).join(" · ")}</ListGroup.ItemDescription>
        {!!conversation && (
          <ListGroup.ItemDescription numberOfLines={1}>
            {conversation}
          </ListGroup.ItemDescription>
        )}
      </ListGroup.ItemContent>
      <ListGroup.ItemSuffix>
        <MenuButton
          icon="ellipsis.circle"
          label={t.actions}
          actions={[
            mentionable && { label: t.mention, icon: "at", onPress: mention },
            mentionable && "divider",
            { label: c.edit, icon: "pencil", onPress: edit },
            { label: routine.enabled ? t.pause : t.resume, icon: routine.enabled ? "pause.circle" : "play.circle", onPress: toggleNow },
            "divider",
            {
              label: c.delete,
              icon: "trash",
              destructive: true,
              onPress: async () => {
                if (!(await confirmAction({ title: t.deleteTitle, description: t.deleteBody(routine.name), action: c.delete }))) return;
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                remove.mutateAsync().then(() => toast.show({ variant: "success", label: t.deletedDone }), failed);
              },
            },
          ]}
        />
      </ListGroup.ItemSuffix>
    </PressableItem>
  );
}
