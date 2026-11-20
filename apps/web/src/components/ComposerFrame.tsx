import { useImperativeHandle, useRef, type ComponentProps, type ReactNode, type Ref } from "react";
import { ArrowUpIcon, PaperclipIcon, PlusIcon, StopIcon } from "@/components/icons";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupButton } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { defineMessages, useT } from "@/i18n";
import { cn } from "@/lib/utils";

const messages = defineMessages({
  en: { more: "Attach, options", attachFiles: "Attach files", send: "Send", stop: "Stop", stopping: "Stopping…" },
  fr: { more: "Joindre, options", attachFiles: "Joindre des fichiers", send: "Envoyer", stop: "Arrêter", stopping: "Arrêt…" },
});

/*
 * The one composer frame, the same in a conversation and in a code session: a card, the field, then a
 * bar with « + » on the left (attach, and a session's repository and mode), the session's or thread's choices and the model menu on the right, and send.
 */

export function ComposerBox({ className, ...props }: ComponentProps<typeof InputGroup>) {
  return <InputGroup className={cn("rounded-xl bg-card shadow-xs dark:bg-card", className)} {...props} />;
}

/** The field's box: a mention overlay drawn over it uses the same one. */
export const composerField = "max-h-48 min-h-10 px-4 pt-3.5 pb-0 [scrollbar-gutter:stable]";

/** Attach on the left, then `start`; `end` and send on the right. Too narrow for one line: it wraps, nothing is cut. */
export function ComposerBar({ start, end }: { start?: ReactNode; end?: ReactNode }) {
  return (
    <InputGroupAddon align="block-end" className="flex-wrap">
      {start}
      <div className="ml-auto flex min-w-0 items-center gap-1">{end}</div>
    </InputGroupAddon>
  );
}

export type AttachHandle = { open: () => void };

/**
 * « + », the only thing on the bar's left, the same everywhere. Alone, it opens the file picker (also
 * opened from elsewhere, the "/" menu, through `ref`); with `menu`, a menu: attach files, then those rows
 * (a code session's repository and mode).
 */
export function AttachButton({ onFiles, disabled, menu, ref }: { onFiles: (files: FileList) => void; disabled?: boolean; menu?: ReactNode; ref?: Ref<AttachHandle> }) {
  const t = useT(messages);
  const picker = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({ open: () => picker.current?.click() }));
  return (
    <>
      <input
        ref={picker}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {menu ? (
        <DropdownMenu>
          <DropdownMenuTrigger render={<InputGroupButton size="icon-sm" aria-label={t.more} disabled={disabled} className="text-muted-foreground" />}>
            <PlusIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-64">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => picker.current?.click()}>
                <PaperclipIcon />
                {t.attachFiles}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            {menu}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <InputGroupButton size="icon-sm" aria-label={t.attachFiles} disabled={disabled} onClick={() => picker.current?.click()} className="text-muted-foreground">
          <PlusIcon />
        </InputGroupButton>
      )}
    </>
  );
}

/**
 * Send, round; greyed while there is nothing to send. With `onStop`, and nothing typed, it stops the
 * answer or the run under way instead.
 */
export function SendButton({
  canSend,
  pending,
  onStop,
  stopping,
  stopLabel,
}: {
  canSend: boolean;
  pending?: boolean;
  onStop?: () => void;
  stopping?: boolean;
  stopLabel?: string;
}) {
  const t = useT(messages);
  if (onStop && !canSend) {
    const label = stopping ? t.stopping : (stopLabel ?? t.stop);
    return (
      <InputGroupButton variant="default" size="icon-sm" className="rounded-full" aria-label={label} title={label} disabled={stopping} onClick={onStop}>
        {stopping ? <Spinner /> : <StopIcon />}
      </InputGroupButton>
    );
  }
  return (
    <InputGroupButton
      type="submit"
      variant={canSend ? "default" : "secondary"}
      size="icon-sm"
      className="rounded-full aria-disabled:text-subtle-foreground"
      aria-label={t.send}
      aria-disabled={!canSend}
    >
      {pending ? <Spinner /> : <ArrowUpIcon />}
    </InputGroupButton>
  );
}
