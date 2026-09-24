import { Button, Card, Checkbox, CloseButton, ControlField, Description, FieldError, Input, Label, Radio, RadioGroup, Separator, TextArea, TextField } from "heroui-native";
import { Fragment, useState } from "react";
import { View } from "react-native";
import { haptic, withTap } from "@/lib/haptics";
import { defineMessages } from "@/lib/i18n";
import type { Questions } from "@/lib/types";

/* apps/web/src/components/QuestionsCard.tsx */

const messages = defineMessages({
  en: {
    title: "A few questions",
    dismiss: "Dismiss questions",
    other: "Other answer",
    otherLabel: (label: string) => `${label}: other answer`,
    required: "Answer required.",
    submit: "Send answers",
  },
  fr: {
    title: "Quelques questions",
    dismiss: "Ignorer les questions",
    other: "Autre réponse",
    otherLabel: (label: string) => `${label} : autre réponse`,
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
    <Card className="w-full max-w-[92%] gap-4">
      <Card.Header className="flex-row items-center gap-3">
        <Card.Title className="min-w-0 flex-1">{questions.title ?? t.title}</Card.Title>
        <CloseButton accessibilityLabel={t.dismiss} onPress={withTap(onDismiss)} className="-mr-1" />
      </Card.Header>

      <Card.Body className="gap-6">
        {questions.questions.map((q, i) => {
          const a = answers[i]!;
          const invalid = !!(tried && missing[i]);
          return (
            <TextField key={`q${i}`} isRequired={q.required} isInvalid={invalid} className="gap-2.5">
              <Label>{q.label}</Label>
              {!!q.hint && <Description isInvalid={false}>{q.hint}</Description>}

              {q.type === "single" && (
                <RadioGroup value={a.picked[0] ?? ""} onValueChange={(v) => (haptic.select(), set(i, (x) => ({ ...x, picked: v ? [v] : [] })))} isInvalid={invalid}>
                  {q.options.map((o, k) => (
                    <Fragment key={o.label}>
                      {k > 0 && <Separator className="my-1" />}
                      <RadioGroup.Item value={o.label} isInvalid={false}>
                        <View className="flex-1">
                          <Label isRequired={false}>{o.label}</Label>
                          {!!o.description && <Description>{o.description}</Description>}
                        </View>
                        <Radio />
                      </RadioGroup.Item>
                    </Fragment>
                  ))}
                </RadioGroup>
              )}

              {q.type === "multi" && (
                <View className="gap-3">
                  {q.options.map((o) => {
                    const on = a.picked.includes(o.label);
                    const toggle = (next: boolean) =>
                      (haptic.select(), set(i, (x) => ({ ...x, picked: next ? [...x.picked, o.label] : x.picked.filter((p) => p !== o.label) })));
                    return (
                      <ControlField
                        key={o.label}
                        isSelected={on}
                        onSelectedChange={toggle}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        accessibilityLabel={o.label}
                        className="items-start"
                      >
                        <ControlField.Indicator>
                          <Checkbox className="mt-0.5" />
                        </ControlField.Indicator>
                        <View className="flex-1">
                          <Label isRequired={false}>{o.label}</Label>
                          {!!o.description && <Description>{o.description}</Description>}
                        </View>
                      </ControlField>
                    );
                  })}
                </View>
              )}

              {q.type === "text" ? (
                <TextArea value={a.other} onChangeText={(other) => set(i, (x) => ({ ...x, other }))} accessibilityLabel={q.label} numberOfLines={3} />
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

      <Card.Footer>
        <Button onPress={withTap(submit)}>
          {t.submit}
        </Button>
      </Card.Footer>
    </Card>
  );
}
