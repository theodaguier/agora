import { common } from "@agora/core/i18n";
import { Button, Dialog } from "heroui-native";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { haptic } from "@/lib/haptics";
import { tr } from "@/lib/i18n";
import { setConfirmPresenter, type ConfirmRequest } from "@/components/confirm-action";

/* apps/web/src/components/ConfirmDialog.tsx, as HeroUI's Dialog. */

/** The dialog of confirmAction(), mounted once by the signed-in layout (inside HeroUI's portal host). */
export function ConfirmHost() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const pending = useRef<ConfirmRequest | null>(null);

  const settle = (confirmed: boolean) => {
    pending.current?.resolve(confirmed);
    pending.current = null;
    setIsOpen(false);
  };

  useEffect(() => {
    setConfirmPresenter((next) => {
      // A new question answers the previous one with "no".
      pending.current?.resolve(false);
      pending.current = next;
      setRequest(next);
      setIsOpen(true);
    });
    return () => {
      setConfirmPresenter(null);
      pending.current?.resolve(false);
      pending.current = null;
    };
  }, []);

  const destructive = request?.destructive !== false;
  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && settle(false)}>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content>
          <View className="mb-8 gap-1.5">
            <Dialog.Title>{request?.title}</Dialog.Title>
            {!!request?.description && <Dialog.Description>{request.description}</Dialog.Description>}
          </View>
          {/* HeroUI's dialog example: the action, then Cancel, stacked full width. */}
          <View className="gap-3">
            <Button variant={destructive ? "danger" : "primary"} onPress={() => (haptic.tap(), settle(true))}>
              {request?.action}
            </Button>
            <Button variant="tertiary" onPress={() => (haptic.tap(), settle(false))}>
              {tr(common).cancel}
            </Button>
          </View>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
