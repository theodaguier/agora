import { Button, Card, Checkbox, Description, FieldError, Input, Label, ListGroup, TextArea, TextField } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { CheckIcon } from "@/components/icons";
import { BlockGroup, BlockHeader, blockCard } from "@/components/views/block";
import { haptic, withTap } from "@/lib/haptics";
import { defineMessages } from "@/lib/i18n";
import type { Questions } from "@/lib/types";

/* apps/web/src/components/QuestionsCard.tsx */

const messages = defineMessages({
  en: {
    title: "A few questions",
    count: (n: number) => `${n} questions`,
    dismiss: "Dismiss questions",
    ignore: "Dismiss",
    other: "Other answer",
    otherLabel: (label: string) => `${label}: other answer`,
    answer: "Your answer",
    required: "Answer required.",
    submit: "Send answers",
  },
  fr: {
    title: "Quelques questions",
    count: (n: number) => `${n} questions`,
    dismiss: "Ignorer les questions",
    ignore: "Ignorer",
    other: "Autre réponse",
    otherLabel: (label: string) => `${label} : autre réponse`,
    answer: "Ta réponse",
    required: "Réponse attendue.",
    submit: "Envoyer les réponses",
  },
});

type Answer = { picked: string[]; other: string };

/** Bot form: several questions, answers sent back in a single message. */
export function QuestionsCard(props: { questions: Questions; onAnswer: (text: string) => void; onDismiss: () => void }) {
  const { questions, onAnswer, onDismiss } = props;
  const [answers, setAnswers] = useState<Answer[]>(() => questions.questions.map(() => ({ picked: [], other: "" })));
  const [tried, setTried] = useState(false);
  const t = messages;

  const set = (i: number, fn: (a: Answer) => Answer) => setAnswers((as) => as.map((a, j) => (j === i ? fn(a) : a)));
  const valueOf = (a: Answer) => [...a.picked, a.other.trim()].filter(Boolean);
  const missing = questions.questions.map((q, i) => q.required && !valueOf(answers[i]!).length);
  const n = questions.questions.length;

  const submit = () => {
    setTried(true);
    if (missing.some(Boolean)) return;
    const lines = questions.questions
      .map((q, i) => {
        const v = valueOf(answers[i]!);
        return v.length ? `**${q.label}**\n${v.join(", ")}` : null;
      })
      .filter(Boolean);
    onAnswer(lines.join("\n\n"));
  };

  return (
    <Card className={blockCard}>
      <BlockHeader title={questions.title ?? t.title} description={n > 1 ? t.count(n) : undefined} onClose={onDismiss} closeLabel={t.dismiss} />

      <Card.Body className="gap-5">
        {questions.questions.map((q, i) => {
          const a = answers[i]!;
          const invalid = !!(tried && missing[i]);
          return (
            <TextField key={`q${i}`} isRequired={q.required} isInvalid={invalid} className="gap-2">
              <Label>
                <Label.Text classNames={{ text: "text-sm", asterisk: "text-muted" }}>{q.label}</Label.Text>
              </Label>
              {!!q.hint && <Description isInvalid={false}>{q.hint}</Description>}

              {q.type === "single" && (
                <View accessibilityRole="radiogroup" accessibilityLabel={q.label}>
                  <BlockGroup>
                    {q.options.map((o) => {
                      const on = a.picked[0] === o.label;
                      return (
                        <ListGroup.Item
                          key={o.label}
                          onPress={() => (haptic.select(), set(i, (x) => ({ ...x, picked: [o.label] })))}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: on }}
                          accessibilityLabel={o.label}
                          className="px-3.5 py-3"
                        >
                          <ListGroup.ItemContent>
                            <ListGroup.ItemTitle>{o.label}</ListGroup.ItemTitle>
                            {!!o.description && <ListGroup.ItemDescription>{o.description}</ListGroup.ItemDescription>}
                          </ListGroup.ItemContent>
                          {on && (
                            <ListGroup.ItemSuffix>
                              <CheckIcon size={18} className="text-foreground" />
                            </ListGroup.ItemSuffix>
                          )}
                        </ListGroup.Item>
                      );
                    })}
                  </BlockGroup>
                </View>
              )}

              {q.type === "multi" && (
                <BlockGroup inset="ml-[48px]">
                  {q.options.map((o) => {
                    const on = a.picked.includes(o.label);
                    const toggle = (next: boolean) =>
                      (haptic.select(), set(i, (x) => ({ ...x, picked: next ? [...x.picked, o.label] : x.picked.filter((p) => p !== o.label) })));
                    return (
                      <ListGroup.Item
                        key={o.label}
                        onPress={() => toggle(!on)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        accessibilityLabel={o.label}
                        className="items-start px-3.5 py-3"
                      >
                        <ListGroup.ItemPrefix className="pt-0.5">
                          <Checkbox isSelected={on} onSelectedChange={toggle} isInvalid={false} />
                        </ListGroup.ItemPrefix>
                        <ListGroup.ItemContent>
                          <ListGroup.ItemTitle>{o.label}</ListGroup.ItemTitle>
                          {!!o.description && <ListGroup.ItemDescription>{o.description}</ListGroup.ItemDescription>}
                        </ListGroup.ItemContent>
                      </ListGroup.Item>
                    );
                  })}
                </BlockGroup>
              )}

              {q.type === "text" ? (
                <TextArea
                  value={a.other}
                  onChangeText={(other) => set(i, (x) => ({ ...x, other }))}
                  placeholder={t.answer}
                  accessibilityLabel={q.label}
                  numberOfLines={3}
                  className="rounded-[14px]"
                />
              ) : (
                <Input
                  value={a.other}
                  onChangeText={(other) => set(i, (x) => ({ ...x, other }))}
                  placeholder={t.other}
                  accessibilityLabel={t.otherLabel(q.label)}
                  isInvalid={false} />
              )}
              <FieldError>{t.required}</FieldError>
            </TextField>
          );
        })}
      </Card.Body>

      <Card.Footer className="gap-1">
        <Button onPress={withTap(submit)}>{t.submit}</Button>
        <Button variant="ghost" onPress={withTap(onDismiss)}>
          {t.ignore}
        </Button>
      </Card.Footer>
    </Card>
  );
}
