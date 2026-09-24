import { common } from "@agora/core/i18n";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { BottomSheet, Button, Checkbox, ListGroup, Separator, Typography, useToast } from "heroui-native";
import { Fragment, useMemo, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ConversationAvatar } from "@/components/conversation-avatar";
import { conversationTitle } from "@/components/participants";
import { SheetSearch as Search } from "@/components/conversation/sheet-search";
import { useMe } from "@/components/server-scope";
import { forwardMessage } from "@/lib/api";
import { withTap } from "@/lib/haptics";
import { defineMessages, tr } from "@/lib/i18n";
import { conversationsQuery } from "@/lib/queries";
import type { Message } from "@/lib/types";

/* apps/web/src/components/ForwardDialog.tsx, as a bottom sheet. */

const MAX_TARGETS = 10;

const messages = defineMessages({
  en: {
    title: "Forward message",
    files: (n: number) => (n > 1 ? `${n} files` : "1 file"),
    search: "Search conversations",
    empty: "No conversation matches.",
    send: (n: number) => (n > 1 ? `Forward to ${n} conversations` : "Forward"),
    sending: "Forwarding…",
    failed: "Couldn't forward the message.",
  },
  fr: {
    title: "Transférer le message",
    files: (n: number) => (n > 1 ? `${n} fichiers` : "1 fichier"),
    search: "Rechercher une conversation",
    empty: "Aucune conversation ne correspond.",
    send: (n: number) => (n > 1 ? `Transférer à ${n} conversations` : "Transférer"),
    sending: "Transfert…",
    failed: "Transfert impossible.",
  },
});

/** Picks the conversations to forward a message to; with a single one, opens it. */
export function ForwardDialog({ conversationId, message, onClose }: { conversationId: string; message: Message | null; onClose: () => void }) {
  const t = messages;
  const tc = tr(common);
  const user = useMe();
  const qc = useQueryClient();
  const { toast } = useToast();
  const insets = useSafeAreaInsets();
  const { data: conversations = [] } = useQuery(conversationsQuery);
  const [picked, setPicked] = useState<string[]>([]);
  const pickedIds = new Set(picked);
  const [query, setQuery] = useState("");

  const close = () => {
    setPicked([]);
    setQuery("");
    forward.reset();
    onClose();
  };
  const forward = useMutation({
    mutationFn: () => forwardMessage(conversationId, message!.id, picked),
    onSuccess: async () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await qc.invalidateQueries({ queryKey: conversationsQuery.queryKey });
      const [only] = picked.length === 1 ? picked : [];
      close();
      if (only && only !== conversationId) router.push({ pathname: "/c/[conversationId]", params: { conversationId: only } });
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      toast.show({ variant: "danger", label: t.failed });
    },
  });
  const toggle = (id: string) => {
    Haptics.selectionAsync();
    setPicked((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : xs.length < MAX_TARGETS ? [...xs, id] : xs));
  };

  const files = message?.data?.attachments?.length ?? 0;
  const preview = [message?.text.replace(/\s+/g, " ").trim(), files ? t.files(files) : ""].filter(Boolean).join(" · ");
  // Filter on the title only.
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.map((c) => ({ c, title: conversationTitle(c, user.id) })).filter((r) => r.title.toLowerCase().includes(q));
  }, [conversations, user.id, query]);

  return (
    <BottomSheet isOpen={!!message} onOpenChange={(open) => !open && close()}>
      <BottomSheet.Portal disableFullWindowOverlay>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          snapPoints={["85%"]}
          enableDynamicSizing={false}
          enableOverDrag={false}
          keyboardBehavior="extend"
          contentContainerClassName="h-full"
        >
          <View className="gap-1 pb-3">
            <BottomSheet.Title>{t.title}</BottomSheet.Title>
            {!!preview && <BottomSheet.Description numberOfLines={2}>{preview}</BottomSheet.Description>}
          </View>
          <Search value={query} onChange={setQuery} placeholder={t.search} />
          <View className="min-h-0 flex-1">
          <BottomSheetScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerClassName="py-3">
            {rows.length === 0 ? (
              <Typography type="body-sm" color="muted" align="center" className="py-8">
                {t.empty}
              </Typography>
            ) : (
              <ListGroup>
                {rows.map(({ c, title }, i) => {
                  const checked = pickedIds.has(c.id);
                  return (
                    <Fragment key={c.id}>
                      {i > 0 && <Separator className="ml-16" />}
                      <ListGroup.Item onPress={() => toggle(c.id)} accessibilityRole="checkbox" accessibilityState={{ checked }}>
                        <ListGroup.ItemPrefix>
                          <ConversationAvatar conversation={c} me={user.id} className="size-9" />
                        </ListGroup.ItemPrefix>
                        <ListGroup.ItemContent>
                          <ListGroup.ItemTitle numberOfLines={1}>{title}</ListGroup.ItemTitle>
                        </ListGroup.ItemContent>
                        <ListGroup.ItemSuffix>
                          <Checkbox isSelected={checked} onSelectedChange={() => toggle(c.id)} pointerEvents="none" importantForAccessibility="no" />
                        </ListGroup.ItemSuffix>
                      </ListGroup.Item>
                    </Fragment>
                  );
                })}
              </ListGroup>
            )}
          </BottomSheetScrollView>
          </View>
          <Separator />
          <View className="gap-2 pt-3" style={{ paddingBottom: insets.bottom + 8 }}>
            <Button size="lg" isDisabled={!picked.length || forward.isPending} onPress={withTap(() => forward.mutate())}>
              {forward.isPending ? t.sending : t.send(picked.length)}
            </Button>
            <Button size="lg" variant="tertiary" onPress={close}>
              {tc.cancel}
            </Button>
          </View>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
