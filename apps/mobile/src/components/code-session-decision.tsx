import { OTHER_ANSWER, questionAnswer, type CodeApproval, type CodeBotQuestion, type CodeQuestion, type CodeSession } from "@agora/core";
import { codeSessions, common } from "@agora/core/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Card, ControlField, Description, Input, Label, PressableFeedback, Radio, RadioGroup, Surface, TextArea, TextField, Typography } from "heroui-native";
import { useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useAdminToast } from "@/components/admin/ui";
import { MessageText } from "@/components/message-text";
import { answerCodeApproval, applyCodeSession, sendToCodeSession } from "@/lib/code-sessions";
import { withTap } from "@/lib/haptics";
import { tr } from "@/lib/i18n";

/*
 * apps/web/src/components/CodeSession.tsx's decisions: what a session waits for (its tool to approve, its
 * questions, its plan, its question to its bot), in the session's stream or `inline` inside its card in the
 * thread (one card, no box in a box). The way to decide comes last: the refusal on the left, the main
 * answer on the right.
 */

/** Code or a command, in its grey block; a long one scrolls inside it. */
export function CodeBlock({ text, maxHeight = 288 }: { text: string; maxHeight?: number }) {
  return (
    <Surface variant="secondary" className="p-0">
      <ScrollView nestedScrollEnabled style={{ maxHeight }} contentContainerClassName="px-3 py-2">
        <Typography type="code" selectable>
          {text}
        </Typography>
      </ScrollView>
    </Surface>
  );
}

/** The frame of a decision: a card of its own in the session, or `inline` its parts only (the card in the thread). */
function DecisionShell({ inline, label, title, description, children, footer }: { inline?: boolean; label: string; title: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode }) {
  const head = (
    <View className="gap-0.5">
      {typeof title === "string" ? (
        <Typography type="body-sm" weight="medium">
          {title}
        </Typography>
      ) : (
        title
      )}
      {!!description && (
        <Typography type="body-sm" color="muted">
          {description}
        </Typography>
      )}
    </View>
  );
  const foot = !!footer && <View className="flex-row flex-wrap items-center gap-2">{footer}</View>;
  if (inline) {
    return (
      <View accessibilityRole="summary" accessibilityLabel={label} className="gap-3">
        {head}
        {children}
        {foot}
      </View>
    );
  }
  return (
    <Card accessibilityLabel={label}>
      <View className="gap-3">
        <Card.Body className="gap-3">
          {head}
          {children}
        </Card.Body>
        {!!footer && <Card.Footer className="flex-row flex-wrap items-center gap-2">{footer}</Card.Footer>}
      </View>
    </Card>
  );
}

/** What a session waits for, whichever it is: its tool to approve, its questions, its plan, or its question to its bot. */
export function SessionDecision({ conversationId, session, canAnswer, inline }: { conversationId: string; session: CodeSession; canAnswer: boolean; inline?: boolean }) {
  const approval = session.approval;
  if (!approval && !session.question) return null;
  return (
    <View className="gap-4">
      {approval?.kind === "question" && approval.questions ? (
        <QuestionBlock conversationId={conversationId} session={session} approval={approval} questions={approval.questions} canAnswer={canAnswer} inline={inline} />
      ) : approval?.kind === "plan" ? (
        <PlanBlock conversationId={conversationId} session={session} approval={approval} canAnswer={canAnswer} inline={inline} />
      ) : (
        approval && <ApprovalBlock conversationId={conversationId} session={session} approval={approval} canAnswer={canAnswer} inline={inline} />
      )}
      {session.question && <BotQuestionBlock conversationId={conversationId} session={session} question={session.question} canAnswer={canAnswer} inline={inline} />}
    </View>
  );
}

function ApprovalBlock({ conversationId, session, approval, canAnswer, inline }: { conversationId: string; session: CodeSession; approval: CodeApproval; canAnswer: boolean; inline?: boolean }) {
  const t = tr(codeSessions);
  const c = tr(common);
  const qc = useQueryClient();
  const toast = useAdminToast();
  const answer = useMutation({
    mutationFn: (choice: CodeApproval["choices"][number]) => answerCodeApproval(conversationId, session.id, approval.id, { choice }),
    onSuccess: (s) => applyCodeSession(qc, s),
    onError: (e) => toast.failed(e),
  });
  // Refuse on the left; the other answers on the right, the main one (its first choice) last.
  const [first, ...others] = approval.choices.filter((ch) => ch !== "deny");
  const button = (choice: CodeApproval["choices"][number], variant: "primary" | "outline" | "danger-soft") => (
    <Button key={choice} size="sm" variant={variant} isDisabled={answer.isPending} onPress={withTap(() => answer.mutate(choice))}>
      {answer.isPending && answer.variables === choice ? c.inProgress : t.choices[choice]}
    </Button>
  );
  return (
    <DecisionShell
      inline={inline}
      label={t.asks}
      title={
        <Typography type="body-sm" weight="medium">
          {t.asks} <Typography type="code">{approval.tool}</Typography>
        </Typography>
      }
      description={approval.title}
      footer={
        canAnswer ? (
          <>
            {approval.choices.includes("deny") && button("deny", "danger-soft")}
            <View className="flex-1 flex-row flex-wrap justify-end gap-2">
              {others.map((ch) => button(ch, "outline"))}
              {first && button(first, "primary")}
            </View>
          </>
        ) : (
          <Typography type="body-sm" color="muted">
            {t.waitingOwner}
          </Typography>
        )
      }
    >
      {!!approval.detail && <CodeBlock text={approval.detail} maxHeight={160} />}
    </DecisionShell>
  );
}

/**
 * Its question to the bot that started it (ask_bot): the question is the title, who it's for and what
 * happens without an answer one grey line; each option one plain row that answers on a tap (no radio,
 * no « Autre »: the field below answers otherwise).
 */
function BotQuestionBlock({ conversationId, session, question, canAnswer, inline }: { conversationId: string; session: CodeSession; question: CodeBotQuestion; canAnswer: boolean; inline?: boolean }) {
  const t = tr(codeSessions);
  const qc = useQueryClient();
  const toast = useAdminToast();
  const answer = useMutation({
    mutationFn: (text: string) => sendToCodeSession(conversationId, session.id, text),
    onSuccess: (s) => {
      applyCodeSession(qc, s);
      toast.success(t.question.answered);
    },
    onError: (e) => toast.failed(e),
  });
  const options = question.options ?? [];
  const help = !canAnswer ? t.botQuestion.waiting(question.bot) : options.length ? t.botQuestion.pick(question.bot, options[0]!.label) : t.botQuestion.help(question.bot);
  return (
    <DecisionShell inline={inline} label={question.text} title={<MessageText text={question.text} />} description={help}>
      {!!question.context && <MessageText text={question.context} />}
      {options.length > 0 && (
        <View className="-mx-1.5 gap-0.5">
          {options.map((o) => (
            <PressableFeedback
              key={o.label}
              isDisabled={!canAnswer || answer.isPending}
              accessibilityRole="button"
              onPress={withTap(() => answer.mutate(o.label))}
              className="rounded-lg px-1.5 py-2"
            >
              <PressableFeedback.Highlight />
              <Typography type="body-sm" weight="medium">
                {o.label}
              </Typography>
              {!!o.description && (
                <Typography type="body-sm" color="muted">
                  {o.description}
                </Typography>
              )}
            </PressableFeedback>
          ))}
        </View>
      )}
    </DecisionShell>
  );
}

type Choice = { picked: string[]; other: string };

const answerOf = (c: Choice | undefined) => (c ? questionAnswer(c.picked, c.other) : "");

/**
 * Its engine's questions (AskUserQuestion), as in its terminal: each with its options, one or several to
 * pick, and « Autre » for an answer of one's own. The run waits for the answers.
 */
function QuestionBlock({
  conversationId,
  session,
  approval,
  questions,
  canAnswer,
  inline,
}: {
  conversationId: string;
  session: CodeSession;
  approval: CodeApproval;
  questions: CodeQuestion[];
  canAnswer: boolean;
  inline?: boolean;
}) {
  const t = tr(codeSessions);
  const c = tr(common);
  const qc = useQueryClient();
  const toast = useAdminToast();
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const answer = useMutation({
    mutationFn: (skip: boolean) =>
      answerCodeApproval(
        conversationId,
        session.id,
        approval.id,
        skip ? { choice: "deny" } : { choice: "once", answers: Object.fromEntries(questions.map((q) => [q.question, answerOf(choices[q.question])])) },
      ),
    onSuccess: (s, skip) => {
      applyCodeSession(qc, s);
      if (!skip) toast.success(t.question.answered);
    },
    onError: (e) => toast.failed(e),
  });
  const set = (question: string, change: Partial<Choice>) =>
    setChoices((all) => ({ ...all, [question]: { ...(all[question] ?? { picked: [], other: "" }), ...change } }));
  const complete = questions.every((q) => answerOf(choices[q.question]));
  const title = questions.length > 1 ? t.question.titleMany(questions.length) : t.question.title;
  return (
    <DecisionShell
      inline={inline}
      label={title}
      title={title}
      description={!canAnswer ? t.waitingOwner : undefined}
      footer={
        canAnswer && (
          <>
            <Button size="sm" variant="ghost" isDisabled={answer.isPending} onPress={withTap(() => answer.mutate(true))}>
              {answer.isPending && answer.variables ? c.inProgress : t.question.skip}
            </Button>
            <View className="flex-1" />
            <Button size="sm" variant="primary" isDisabled={!complete || answer.isPending} onPress={withTap(() => answer.mutate(false))}>
              {answer.isPending && !answer.variables ? c.inProgress : t.question.answer}
            </Button>
          </>
        )
      }
    >
      {questions.map((q) => {
        const picked = choices[q.question]?.picked ?? [];
        const options = [...q.options.map((o) => ({ value: o.label, label: o.label, description: o.description })), { value: OTHER_ANSWER, label: t.question.other, description: undefined }];
        const text = (o: (typeof options)[number]) => (
          <View className="flex-1">
            <Label>{o.label}</Label>
            {!!o.description && <Description>{o.description}</Description>}
          </View>
        );
        return (
          <View key={q.question} className="gap-2">
            {/* Its short tag above, then the question alone. */}
            <View className="gap-0.5">
              {!!q.header && (
                <Typography type="body-xs" color="muted">
                  {q.header}
                </Typography>
              )}
              <Typography type="body-sm" weight="medium">
                {q.question}
              </Typography>
            </View>
            {q.multiSelect ? (
              <View className="gap-2">
                {options.map((o) => (
                  <ControlField
                    key={o.value}
                    isDisabled={!canAnswer}
                    isSelected={picked.includes(o.value)}
                    onSelectedChange={(on) => set(q.question, { picked: on ? [...picked, o.value] : picked.filter((p) => p !== o.value) })}
                  >
                    {text(o)}
                    <ControlField.Indicator variant="checkbox" />
                  </ControlField>
                ))}
              </View>
            ) : (
              <RadioGroup value={picked[0]} isDisabled={!canAnswer} onValueChange={(v) => set(q.question, { picked: [v] })} className="gap-2">
                {options.map((o) => (
                  <RadioGroup.Item key={o.value} value={o.value}>
                    {text(o)}
                    <Radio />
                  </RadioGroup.Item>
                ))}
              </RadioGroup>
            )}
            {picked.includes(OTHER_ANSWER) && (
              <Input
                autoFocus
                accessibilityLabel={t.question.other}
                placeholder={t.question.otherPlaceholder}
                value={choices[q.question]?.other ?? ""}
                onChangeText={(other) => set(q.question, { other })}
              />
            )}
          </View>
        );
      })}
    </DecisionShell>
  );
}

/**
 * The plan written in plan mode (ExitPlanMode): read whole, then approved (it starts, in the mode it had
 * before planning) or sent back with what to change (it keeps planning).
 */
function PlanBlock({ conversationId, session, approval, canAnswer, inline }: { conversationId: string; session: CodeSession; approval: CodeApproval; canAnswer: boolean; inline?: boolean }) {
  const t = tr(codeSessions);
  const c = tr(common);
  const qc = useQueryClient();
  const toast = useAdminToast();
  const [feedback, setFeedback] = useState("");
  const answer = useMutation({
    mutationFn: (approve: boolean) =>
      answerCodeApproval(conversationId, session.id, approval.id, approve ? { choice: "once" } : { choice: "deny", feedback: feedback.trim() }),
    onSuccess: (s, approve) => {
      applyCodeSession(qc, s);
      setFeedback("");
      toast.success(approve ? t.plan.approved : t.plan.sentBack);
    },
    onError: (e) => toast.failed(e),
  });
  return (
    <DecisionShell
      inline={inline}
      label={t.plan.title}
      title={t.plan.title}
      description={t.plan.help}
      footer={
        canAnswer ? (
          <>
            <View className="flex-1" />
            <Button size="sm" variant="outline" isDisabled={answer.isPending} onPress={withTap(() => answer.mutate(false))}>
              {answer.isPending && !answer.variables ? c.inProgress : t.plan.revise}
            </Button>
            <Button size="sm" variant="primary" isDisabled={answer.isPending || !!feedback.trim()} onPress={withTap(() => answer.mutate(true))}>
              {answer.isPending && answer.variables ? c.inProgress : t.plan.approve}
            </Button>
          </>
        ) : (
          <Typography type="body-sm" color="muted">
            {t.waitingOwner}
          </Typography>
        )
      }
    >
      {!!approval.plan && <MessageText text={approval.plan} />}
      {canAnswer && (
        <TextField>
          <TextArea value={feedback} onChangeText={setFeedback} accessibilityLabel={t.plan.feedback} placeholder={t.plan.feedbackPlaceholder} />
        </TextField>
      )}
    </DecisionShell>
  );
}
