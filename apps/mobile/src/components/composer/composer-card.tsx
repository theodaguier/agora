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
 * (screens/code-session.tsx) are the same, so the two screens read as the same chat. Figma « Mobile —
 * ChatGPT 1:1 »: ChatGPT's floating pill, white with a soft shadow and no border. What goes with the
 * message (a reply, files) sits on top inside it; then one row: the caller's tools (the "+") on the
 * left, the field, dictation and send (or stop) on the right. It grows with the text, buttons at the bottom.
 */

export function ComposerCard({ header, children, tools, trailing }: { header?: ReactNode; children: ReactNode; tools?: ReactNode; trailing?: ReactNode }) {
  return (
    <Surface variant="transparent" className="rounded-[26px] bg-field p-0" style={{ borderCurve: "continuous", boxShadow: "0 6px 28px rgba(0, 0, 0, 0.10)" }}>
      {!!header && <View className="gap-1 px-2 pt-2">{header}</View>}
      <View className="flex-row items-end px-1.5 py-1.5">
        {tools}
        <View className="min-w-0 flex-1">{children}</View>
        {trailing}
      </View>
    </Surface>
  );
}

/**
 * The pill's field: part of it rather than a field inside it (no fill, no border, no shadow, no focus
 * outline: it is always the one being typed in). At the messages' size (17 pt), six lines, then it scrolls.
 */
export const ComposerInput = forwardRef<InputRef, ComponentProps<typeof Input>>(function ComposerInput(props, ref) {
  return (
    <Input
      ref={ref}
      multiline
      background={null}
      className="max-h-[152px] min-h-9 border-transparent bg-transparent px-1.5 pt-2 pb-2 text-body shadow-none ios:focus:outline-transparent android:focus:border-transparent"
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
      <Button isIconOnly size="sm" variant="primary" accessibilityLabel={stop.label} isDisabled={stop.pending} onPress={withTap(stop.onPress)} className="rounded-full">
        {stop.pending ? <Spinner size="sm" /> : <StopIcon className="size-4 text-accent-foreground" />}
      </Button>
    );
  }
  return (
    // Figma « Mobile — ChatGPT 1:1 »: always the black round button, faded until there is something to send.
    <Button isIconOnly size="sm" variant="primary" accessibilityLabel={label} accessibilityState={{ disabled: !canSend }} onPress={onSend} className={canSend ? "rounded-full" : "rounded-full opacity-25"}>
      <ArrowUpIcon className="size-[18px] text-accent-foreground" strokeWidth={2.25} />
    </Button>
  );
}
