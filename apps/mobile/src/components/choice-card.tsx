import { Avatar, Button, Card, InputGroup, ListGroup, Separator, TextField } from "heroui-native";
import { Fragment, useState } from "react";
import { View } from "react-native";
import { CheckIcon, ReplyIcon } from "@/components/icons";
import { BlockHeader, blockCard } from "@/components/views/block";
import { haptic, withTap } from "@/lib/haptics";
import { defineMessages } from "@/lib/i18n";
import type { Choices } from "@/lib/types";
import { cn } from "@/lib/utils";

/* apps/web/src/components/ChoiceCard.tsx. No A–D keyboard shortcuts on a phone; the letters stay as keys. */

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
  // The free answer: a footer row until tapped, then its field in the same place.
  const [writing, setWriting] = useState(false);
  const t = messages;

  const pick = (label: string) => {
    haptic.select();
    setPicked(label);
    onAnswer(label);
  };
  const submit = () => {
    const text = custom.trim();
    if (text) onAnswer(text);
  };

  return (
    <Card className={cn(blockCard, "gap-2 overflow-hidden px-0 pb-0")}>
      <View className="px-[18px]">
        <BlockHeader title={choices.question} description={choices.hint} onClose={onDismiss} closeLabel={t.dismiss} />
      </View>

      <Card.Body>
        <ListGroup variant="transparent" accessibilityRole="radiogroup" accessibilityLabel={t.options}>
          {choices.options.map((o, i) => (
            <Fragment key={o.label}>
              {i > 0 && <Separator className="ml-[58px]" />}
              <ListGroup.Item
                onPress={() => pick(o.label)}
                accessibilityRole="radio"
                accessibilityState={{ checked: picked === o.label }}
                accessibilityLabel={o.label}
                className="px-[18px] py-2.5"
              >
                <ListGroup.ItemPrefix>
                  <Avatar alt={letters[i]!} variant="soft" color="default" className="size-7">
                    <Avatar.Fallback classNames={{ text: "text-footnote font-semibold" }}>{letters[i]}</Avatar.Fallback>
                  </Avatar>
                </ListGroup.ItemPrefix>
                <ListGroup.ItemContent>
                  <ListGroup.ItemTitle>{o.label}</ListGroup.ItemTitle>
                  {!!o.description && <ListGroup.ItemDescription>{o.description}</ListGroup.ItemDescription>}
                </ListGroup.ItemContent>
                {picked === o.label ? (
                  <ListGroup.ItemSuffix>
                    <CheckIcon size={18} className="text-foreground" />
                  </ListGroup.ItemSuffix>
                ) : (
                  <ListGroup.ItemSuffix className="opacity-60" />
                )}
              </ListGroup.Item>
            </Fragment>
          ))}
        </ListGroup>
      </Card.Body>

      <Card.Footer>
        <ListGroup className="rounded-none shadow-none">
          {writing ? (
            <View className="px-3 py-2">
              <TextField>
                <InputGroup>
                  <InputGroup.Prefix isDecorative>
                    <ReplyIcon size={18} className="text-muted" />
                  </InputGroup.Prefix>
                  <InputGroup.Input
                    autoFocus
                    value={custom}
                    onChangeText={setCustom}
                    onSubmitEditing={submit}
                    onBlur={() => !custom.trim() && setWriting(false)}
                    returnKeyType="send"
                    submitBehavior="blurAndSubmit"
                    placeholder={t.placeholder}
                    accessibilityLabel={t.own}
                  />
                  <InputGroup.Suffix>
                    <Button variant="ghost" size="sm" isDisabled={!custom.trim()} onPress={withTap(submit)}>
                      {t.send}
                    </Button>
                  </InputGroup.Suffix>
                </InputGroup>
              </TextField>
            </View>
          ) : (
            <ListGroup.Item onPress={withTap(() => setWriting(true))} accessibilityRole="button" accessibilityLabel={t.own} className="px-[18px] py-3.5">
              <ListGroup.ItemPrefix>
                <ReplyIcon size={18} className="text-muted" />
              </ListGroup.ItemPrefix>
              <ListGroup.ItemContent>
                <ListGroup.ItemDescription className="text-subheadline">{t.placeholder}</ListGroup.ItemDescription>
              </ListGroup.ItemContent>
            </ListGroup.Item>
          )}
        </ListGroup>
      </Card.Footer>
    </Card>
  );
}
