import { RequiredMark } from "@/components/FormLabel";
import { CloseIcon } from "@/components/icons";
import { type ReactNode, useState } from "react";
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { Questions } from "@/lib/api";
import { defineMessages, useT } from "@/i18n";
import { contentKeys } from "@/lib/utils";

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
  const t = useT(messages);

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
    <form
      className="w-full max-w-[min(680px,88%)]"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>{questions.title ?? t.title}</CardTitle>
          <CardAction>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={t.dismiss} onClick={onDismiss}>
              <CloseIcon />
            </Button>
          </CardAction>
        </CardHeader>

        <CardContent>
          <FieldGroup>
            {contentKeys(questions.questions, (q) => q.label).map(([key, q], i) => {
              const a = answers[i]!;
              const picked = new Set(a.picked);
              const id = `q${i}`;
              const invalid = tried && missing[i];
              return (
                <FieldSet key={key} data-invalid={invalid || undefined}>
                  <FieldLegend variant="label">
                    {q.label}
                    {q.required && <RequiredMark className="ml-1" />}
                  </FieldLegend>
                  {q.hint && <FieldDescription>{q.hint}</FieldDescription>}

                  {q.type === "single" && (
                    <RadioGroup value={a.picked[0] ?? ""} onValueChange={(v) => set(i, (x) => ({ ...x, picked: v ? [String(v)] : [] }))}>
                      {q.options.map((o, k) => (
                        <Option key={o.label} id={`${id}-${k}`} label={o.label} description={o.description}>
                          <RadioGroupItem value={o.label} id={`${id}-${k}`} />
                        </Option>
                      ))}
                    </RadioGroup>
                  )}

                  {q.type === "multi" && (
                    <FieldGroup className="gap-3">
                      {q.options.map((o, k) => (
                        <Option key={o.label} id={`${id}-${k}`} label={o.label} description={o.description}>
                          <Checkbox
                            id={`${id}-${k}`}
                            checked={picked.has(o.label)}
                            onCheckedChange={(on) =>
                              set(i, (x) => ({ ...x, picked: on ? [...x.picked, o.label] : x.picked.filter((p) => p !== o.label) }))
                            }
                          />
                        </Option>
                      ))}
                    </FieldGroup>
                  )}

                  {q.type === "text" ? (
                    <Textarea
                      value={a.other}
                      onChange={(e) => set(i, (x) => ({ ...x, other: e.target.value }))}
                      aria-label={q.label}
                      aria-invalid={invalid || undefined}
                      rows={2}
                    />
                  ) : (
                    <Input
                      value={a.other}
                      onChange={(e) => set(i, (x) => ({ ...x, other: e.target.value }))}
                      placeholder={t.other}
                      aria-label={t.otherLabel(q.label)}
                    />
                  )}
                  {invalid && <FieldError>{t.required}</FieldError>}
                </FieldSet>
              );
            })}
          </FieldGroup>
        </CardContent>

        <CardFooter className="justify-end">
          <Button type="submit">{t.submit}</Button>
        </CardFooter>
      </Card>
    </form>
  );
}

/** One answer as a shadcn choice card: the whole card is the label. */
function Option({ id, label, description, children }: { id: string; label: string; description?: string; children: ReactNode }) {
  return (
    <FieldLabel htmlFor={id}>
      <Field orientation="horizontal">
        <FieldContent>
          <FieldTitle>{label}</FieldTitle>
          {description && <FieldDescription>{description}</FieldDescription>}
        </FieldContent>
        {children}
      </Field>
    </FieldLabel>
  );
}
