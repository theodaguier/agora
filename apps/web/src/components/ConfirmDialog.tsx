import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useT } from "@/i18n";
import { common } from "@agora/core/i18n";
import { settle, useConfirmState } from "@/lib/confirm";

/** The single confirmation dialog, mounted once in the app shell. */
export function ConfirmHost() {
  const c = useT(common);
  const { open, shown } = useConfirmState();
  return (
    <AlertDialog open={open} onOpenChange={(open) => !open && settle(false)}>
      <AlertDialogContent>
        {shown && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{shown.title}</AlertDialogTitle>
              {shown.description && <AlertDialogDescription>{shown.description}</AlertDialogDescription>}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{c.cancel}</AlertDialogCancel>
              <AlertDialogAction variant={shown.destructive === false ? "default" : "destructive"} onClick={() => settle(true)}>
                {shown.action}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
