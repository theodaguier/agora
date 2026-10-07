import { RequiredMark } from "@/components/FormLabel";
import { CloseIcon } from "@/components/icons";
import { type ReactNode, useState } from "react";
import { CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BlockCard, BlockFooter } from "@/components/views/block";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
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
    placeholder: "Your answer",
  },
  fr: {
    title: "Quelques questions",
    dismiss: "Ignorer les questions",
    other: "Autre réponse",
    otherLabel: (label: string) => `${label} : autre réponse`,
    required: "Réponse attendue.",
    submit: "Envoyer les réponses",
    placeholder: "Ta réponse",
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
      <BlockCard className="max-w-full">
        <CardHeader>
          <CardTitle className="font-semibold">{questions.title ?? t.title}</CardTitle>
          <CardAction>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={t.dismiss} onClick={onDismiss} className="-mr-2 -mt-1">
              <CloseIcon />
            </Button>
          </CardAction>
        </CardHeader>

        <CardContent>
          <FieldGroup className="gap-5">
            {contentKeys(questions.questions, (q) => q.label).map(([key, q], i) => {
              const a = answers[i]!;
              const picked = new Set(a.picked);
              const id = `q${i}`;
              const invalid = tried && missing[i];
              const other = (
                <Input
                  value={a.other}
                  onChange={(e) => set(i, (x) => ({ ...x, other: e.target.value }))}
                  placeholder={t.other}
                  aria-label={t.otherLabel(q.label)}
                  className="rounded-none border-0 bg-transparent px-3.5 focus-visible:ring-0"
                />
              );
              return (
                <FieldSet key={key} data-invalid={invalid || undefined} className="gap-2.5">
                  <FieldLegend variant="label" className="mb-2.5">
                    {q.label}
                    {q.required && <RequiredMark className="ml-1 text-muted-foreground" />}
                  </FieldLegend>
                  {q.hint && <FieldDescription className="text-[13px]">{q.hint}</FieldDescription>}

                  {q.type === "single" && (
                    <RadioGroup
                      value={a.picked[0] ?? ""}
                      onValueChange={(v) => set(i, (x) => ({ ...x, picked: v ? [String(v)] : [] }))}
                      className={group}
                    >
                      {q.options.map((o, k) => (
                        <Option key={o.label} id={`${id}-${k}`} label={o.label} description={o.description}>
                          <RadioGroupItem value={o.label} id={`${id}-${k}`} />
                        </Option>
                      ))}
                      {other}
                    </RadioGroup>
                  )}

                  {q.type === "multi" && (
                    <div className={group}>
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
                      {other}
                    </div>
                  )}

                  {q.type === "text" && (
                    <Textarea
                      value={a.other}
                      onChange={(e) => set(i, (x) => ({ ...x, other: e.target.value }))}
                      aria-label={q.label}
                      aria-invalid={invalid || undefined}
                      placeholder={t.placeholder}
                      rows={2}
                      className="rounded-[10px] border-border bg-transparent px-3.5 py-2.5"
                    />
                  )}
                  {invalid && <FieldError>{t.required}</FieldError>}
                </FieldSet>
              );
            })}
          </FieldGroup>
        </CardContent>

        <BlockFooter>
          <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
            {t.dismiss}
          </Button>
          <Button type="submit" size="sm">
            {t.submit}
          </Button>
        </BlockFooter>
      </BlockCard>
    </form>
  );
}

/** The bordered group of a question's answers, a line between each. */
const group = "gap-0 divide-y divide-border overflow-hidden rounded-[10px] border";

/** One answer, a row of the group: the control on the left, the whole row is its label. */
function Option({ id, label, description, children }: { id: string; label: string; description?: string; children: ReactNode }) {
  return (
    <Field orientation="horizontal" className="relative gap-3 px-3.5 py-2.5 transition-colors hover:bg-muted/50 has-data-checked:bg-muted">
      {children}
      <FieldContent className="gap-0">
        <FieldLabel htmlFor={id} className="after:absolute after:inset-0">
          {label}
        </FieldLabel>
        {description && <FieldDescription className="text-[13px] leading-snug">{description}</FieldDescription>}
      </FieldContent>
    </Field>
  );
}
