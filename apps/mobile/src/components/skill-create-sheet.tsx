import { common } from "@agora/core/i18n";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Alert, BottomSheet, Button, Separator, Typography, useToast } from "heroui-native";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import { withTap } from "@/lib/haptics";
import { defineMessages, tr } from "@/lib/i18n";
import type { SkillRequest } from "@/lib/types";

/* apps/web/src/components/SkillCreateDialog.tsx, as a bottom sheet. */

const messages = defineMessages({
  en: {
    title: (name: string) => `Skill ${name}`,
    shared: "Every bot will be able to use it.",
    approve: "Approve",
    approved: "Skill shared with every bot",
  },
  fr: {
    title: (name: string) => `Skill ${name}`,
    shared: "Tous les bots pourront s'en servir.",
    approve: "Valider",
    approved: "Skill partagé avec tous les bots",
  },
});

/** Skill written by a bot: the admin reads its SKILL.md before sharing it with every bot. */
export function SkillCreateSheet({ request, onClose }: { request: SkillRequest | null; onClose: () => void }) {
  const t = messages;
  const c = tr(common);
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { toast } = useToast();
  const approve = useMutation({
    mutationFn: (id: string) => api<SkillRequest>(`/skill-requests/${id}/approve`, { method: "POST" }),
    onSuccess: (next) => {
      qc.setQueryData(["skill-request", next.id], next);
      qc.invalidateQueries({ queryKey: ["skill-requests"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show({ variant: "success", label: t.approved });
      onClose();
    },
    onError: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  });

  return (
    <BottomSheet isOpen={!!request} onOpenChange={(open) => !open && onClose()}>
      <BottomSheet.Portal disableFullWindowOverlay>
        <BottomSheet.Overlay />
        <BottomSheet.Content snapPoints={["85%"]} enableDynamicSizing={false} enableOverDrag={false} contentContainerClassName="h-full">
          {request && (
            <>
              <View className="gap-1 pb-3">
                <BottomSheet.Title>{t.title(request.name)}</BottomSheet.Title>
                <BottomSheet.Description>
                  {request.description} {t.shared}
                </BottomSheet.Description>
              </View>
              <View className="min-h-0 flex-1">
                <BottomSheetScrollView contentContainerClassName="py-3">
                  <Typography.Code selectable>{request.content}</Typography.Code>
                </BottomSheetScrollView>
              </View>
              <Separator />
              <View className="gap-2 pt-3" style={{ paddingBottom: insets.bottom + 8 }}>
                {approve.error && (
                  <Alert status="danger">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Description>{approve.error.message}</Alert.Description>
                    </Alert.Content>
                  </Alert>
                )}
                <Button size="lg" isDisabled={approve.isPending} onPress={withTap(() => approve.mutate(request.id))}>
                  {approve.isPending ? c.inProgress : request.error ? c.retry : t.approve}
                </Button>
                <Button size="lg" variant="tertiary" onPress={onClose}>
                  {c.cancel}
                </Button>
              </View>
            </>
          )}
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
