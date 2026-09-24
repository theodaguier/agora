import { Avatar, Button, Card, CloseButton, Description, InputGroup, Label, Radio, RadioGroup, Separator, TextField } from "heroui-native";
import { Fragment, useState } from "react";
import { View } from "react-native";
import { withTap } from "@/lib/haptics";
import { defineMessages } from "@/lib/i18n";
import type { Choices } from "@/lib/types";

/* apps/web/src/components/ChoiceCard.tsx. No A–D keyboard shortcuts on a phone; the letters stay as labels. */

const messages = defineMessages({
  en: { dismiss: "Dismiss question", options: "Suggested answers", placeholder: "Type your own answer", own: "Your own answer", send: "Send" },
  fr: { dismiss: "Ignorer la question", options: "Réponses proposées", placeholder: "Saisissez votre propre réponse", own: "Votre propre réponse", send: "Envoyer" },
});

const letters = "ABCD";

/** Multiple-choice question asked by the bot: picking an option answers it, or a free-form answer. */
export function ChoiceCard(props: { choices: Choices; onAnswer: (text: string) => void; onDismiss: () => void }) {
  const { choices, onAnswer, onDismiss } = props;
  const [picked, setPicked] = useState("");
  const [custom, setCustom] = useState("");
  const t = messages;

  const pick = (label: string) => {
    setPicked(label);
    onAnswer(label);
  };
  const submit = () => {
    const text = custom.trim();
    if (text) onAnswer(text);
  };

  return (
    <Card className="w-full max-w-[92%] gap-4">
      <Card.Header className="flex-row items-start gap-3">
        <View className="min-w-0 flex-1 gap-0.5">
          <Card.Title>{choices.question}</Card.Title>
          {!!choices.hint && <Card.Description>{choices.hint}</Card.Description>}
        </View>
        <CloseButton accessibilityLabel={t.dismiss} onPress={withTap(onDismiss)} className="-mr-1 -mt-1" />
      </Card.Header>

      <Card.Body>
        <RadioGroup value={picked} onValueChange={pick} accessibilityLabel={t.options}>
          {choices.options.map((o, i) => (
            <Fragment key={o.label}>
              {i > 0 && <Separator className="my-1" />}
              <RadioGroup.Item value={o.label}>
                <Avatar alt={letters[i]!} size="sm" variant="soft" color="default">
                  <Avatar.Fallback>{letters[i]}</Avatar.Fallback>
                </Avatar>
                <View className="flex-1">
                  <Label>{o.label}</Label>
                  {!!o.description && <Description>{o.description}</Description>}
                </View>
                <Radio />
              </RadioGroup.Item>
            </Fragment>
          ))}
        </RadioGroup>
      </Card.Body>

      <Card.Footer>
        <TextField>
          <Label>{t.own}</Label>
          <InputGroup>
            <InputGroup.Input
              value={custom}
              onChangeText={setCustom}
              onSubmitEditing={submit}
              returnKeyType="send"
              submitBehavior="blurAndSubmit"
              placeholder={t.placeholder}
            />
            <InputGroup.Suffix>
              <Button variant="ghost" size="sm" isDisabled={!custom.trim()} onPress={withTap(submit)}>
                {t.send}
              </Button>
            </InputGroup.Suffix>
          </InputGroup>
        </TextField>
      </Card.Footer>
    </Card>
  );
}
