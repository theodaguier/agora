import { Button, Input, Spinner, Surface, type InputRef } from "heroui-native";
import { forwardRef, type ComponentProps, type ReactNode } from "react";
import { View } from "react-native";
import { ArrowUpIcon, MicIcon, StopIcon } from "@/components/icons";
import { withTap } from "@/lib/haptics";
import { defineMessages } from "@/lib/i18n";

const messages = defineMessages({
  en: { dictate: "Dictate", stopDictation: "Stop dictation" },
  fr: { dictate: "Dicter", stopDictation: "Arrêter la dictée" },
});

/*
 * The one composer of the app: a conversation's (components/composer.tsx) and a code session's
 * (screens/code-session.tsx) are the same card, so the two screens read as the same chat. A card with
 * a hairline, what goes with the message on top, the field across its width, then one toolbar: the
 * paperclip and the caller's own tools on the left, dictation and send (or stop) on the right.
 */

export function ComposerCard({ header, children, tools, trailing }: { header?: ReactNode; children: ReactNode; tools?: ReactNode; trailing?: ReactNode }) {
  return (
    <Surface variant="transparent" className="rounded-xl border border-field-border bg-field p-0" style={{ borderCurve: "continuous" }}>
      {!!header && <View className="gap-1 px-1.5 pt-1.5">{header}</View>}
      {children}
      <View className="flex-row items-center gap-1 px-1.5 pb-1.5">
        {tools}
        <View className="flex-1" />
        {trailing}
      </View>
    </Surface>
  );
}

/**
 * The card's field: part of the card rather than a field inside it (no fill, no border, no shadow, no
 * focus outline: it is always the one being typed in). At the messages' size, six lines, then it scrolls.
 */
export const ComposerInput = forwardRef<InputRef, ComponentProps<typeof Input>>(function ComposerInput(props, ref) {
  return (
    <Input
      ref={ref}
      multiline
      background={null}
      className="max-h-[152px] min-h-11 border-transparent bg-transparent px-3.5 pt-3 pb-1 text-body shadow-none ios:focus:outline-transparent android:focus:border-transparent"
      {...props}
    />
  );
});

/** Dictation: the microphone, red while it listens. */
export function MicButton({ listening, onPress }: { listening: boolean; onPress: () => void }) {
  return (
    <Button isIconOnly size="sm" variant={listening ? "danger-soft" : "ghost"} accessibilityLabel={listening ? messages.stopDictation : messages.dictate} onPress={onPress}>
      <MicIcon size={20} className={listening ? "text-danger" : "text-icon"} />
    </Button>
  );
}

/** Send, in black once there is something to send; `stop` turns it into a stop while a reply runs. */
export function SendButton({
  canSend,
  label,
  onSend,
  stop,
}: {
  canSend: boolean;
  label: string;
  onSend: () => void;
  stop?: { label: string; pending?: boolean; onPress: () => void } | null;
}) {
  if (stop && !canSend) {
    return (
      <Button isIconOnly size="sm" variant="primary" accessibilityLabel={stop.label} isDisabled={stop.pending} onPress={withTap(stop.onPress)}>
        {stop.pending ? <Spinner size="sm" /> : <StopIcon className="size-4 text-accent-foreground" />}
      </Button>
    );
  }
  return (
    <Button isIconOnly size="sm" variant={canSend ? "primary" : "secondary"} accessibilityLabel={label} accessibilityState={{ disabled: !canSend }} onPress={onSend}>
      <ArrowUpIcon className={canSend ? "size-[18px] text-accent-foreground" : "size-[18px] text-subtle"} strokeWidth={2.25} />
    </Button>
  );
}
