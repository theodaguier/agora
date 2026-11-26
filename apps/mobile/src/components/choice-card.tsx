import { Card, PressableFeedback, Typography } from "heroui-native";
import { useState } from "react";
import { TextInput, View } from "react-native";
import { useCSSVariable } from "uniwind";
import { ArrowUpIcon, ChatQuestionIcon, CheckIcon } from "@/components/icons";
import { BlockHeader, blockCard } from "@/components/views/block";
import { haptic, withTap } from "@/lib/haptics";
import { defineMessages } from "@/lib/i18n";
import type { Choices } from "@/lib/types";
import { cn } from "@/lib/utils";

/*
 * apps/web/src/components/ChoiceCard.tsx; Figma « Blocs de réponse », mobile (« Autorisation et choix »).
 * The question under its icon, its answers as plain rows (a tap answers), then a field for one's own.
 * No A–D keyboard shortcuts on a phone, so no letters either.
 */

const messages = defineMessages({
  en: { dismiss: "Dismiss question", options: "Suggested answers", placeholder: "Or type your answer", own: "Your own answer", send: "Send" },
  fr: { dismiss: "Ignorer la question", options: "Réponses proposées", placeholder: "Ou écris ta réponse", own: "Votre propre réponse", send: "Envoyer" },
});

/** Multiple-choice question asked by the bot: picking an option answers it, or a free-form answer. */
export function ChoiceCard(props: { choices: Choices; onAnswer: (text: string) => void; onDismiss: () => void }) {
  const { choices, onAnswer, onDismiss } = props;
  const [picked, setPicked] = useState("");
  const [custom, setCustom] = useState("");
  const placeholder = useCSSVariable("--field-placeholder") as string | undefined;
  const t = messages;

  const pick = (label: string) => {
    haptic.select();
    setPicked(label);
    onAnswer(label);
  };
  const text = custom.trim();
  const submit = () => {
    if (text) onAnswer(text);
  };

  return (
    <Card className={cn(blockCard, "gap-0 overflow-hidden px-0 py-0")}>
      <View className="px-3.5 pt-3">
        <BlockHeader icon={<ChatQuestionIcon size={18} className="text-muted" />} title={choices.question} description={choices.hint} onClose={onDismiss} closeLabel={t.dismiss} />
      </View>

      <View accessibilityRole="radiogroup" accessibilityLabel={t.options} className="py-1.5">
        {choices.options.map((o) => (
          <PressableFeedback
            key={o.label}
            onPress={() => pick(o.label)}
            accessibilityRole="radio"
            accessibilityState={{ checked: picked === o.label }}
            accessibilityLabel={o.label}
            className="flex-row items-center gap-3 px-4 py-2"
          >
            <View className="min-w-0 flex-1">
              <Typography className="text-subheadline text-foreground">{o.label}</Typography>
              {!!o.description && <Typography className="text-subheadline text-muted">{o.description}</Typography>}
            </View>
            {picked === o.label && <CheckIcon size={18} className="text-foreground" />}
          </PressableFeedback>
        ))}
      </View>

      <View className="px-4 pb-4 pt-1">
        <View className="h-10 flex-row items-center rounded-[10px] border border-border pl-3 pr-1">
          <TextInput
            value={custom}
            onChangeText={setCustom}
            onSubmitEditing={submit}
            returnKeyType="send"
            submitBehavior="blurAndSubmit"
            placeholder={t.placeholder}
            placeholderTextColor={placeholder}
            accessibilityLabel={t.own}
            className="h-full flex-1 text-subheadline text-foreground"
          />
          <PressableFeedback
            onPress={withTap(submit)}
            isDisabled={!text}
            accessibilityRole="button"
            accessibilityLabel={t.send}
            accessibilityState={{ disabled: !text }}
            className={cn("size-7 items-center justify-center rounded-md bg-foreground", !text && "opacity-30")}
          >
            <ArrowUpIcon size={16} className="text-background" />
          </PressableFeedback>
        </View>
      </View>
    </Card>
  );
}
