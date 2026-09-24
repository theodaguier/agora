import type { ChatDraft, DraftView, Drafts, DraftType, EventDraft, MailDraft, StatusTone, TaskDraft, ViewActionKind } from "@agora/core";
import { integrations } from "@agora/core/i18n";
import * as Haptics from "expo-haptics";
import { Button, Card, Chip, Input, Label, TextArea, TextField, useThemeColor, useToast } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { CheckIcon } from "@/components/icons";
import { withTap } from "@/lib/haptics";
import { tr } from "@/lib/i18n";
import { fromLocalInput, toLocalInput } from "./format";
import { toneChip } from "./tone";

/*
 * apps/web/src/components/views/DraftCard.tsx. Dates are typed as "YYYY-MM-DDTHH:mm" (no native picker yet).
 * Renders the Body and Footer of ViewCard's Card: the fields, then the answer buttons.
 */

type AnyDraft = Drafts[DraftType];

const ANSWER_TONE: Record<ViewActionKind, StatusTone> = { confirm: "success", revise: "warning", cancel: "neutral" };

const list = (s: string) =>
  s
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

export function DraftCard(props: {
  view: DraftView;
  answer?: ViewActionKind;
  canAct: boolean;
  onAnswer: (action: ViewActionKind, draft: AnyDraft, note?: string) => Promise<void> | void;
}) {
  const t = tr(integrations);
  // Only the fields edited on the card, over the bot's draft.
  const [edits, setEdits] = useState<Partial<AnyDraft>>({});
  const draft = { ...props.view.draft, ...edits } as AnyDraft;
  const [sending, setSending] = useState<ViewActionKind | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const locked = !!props.answer || !props.canAct || !!sending;
  const success = useThemeColor("success-soft-foreground");
  const { toast } = useToast();
  const answered = { confirm: t.confirmed, cancel: t.cancelled, revise: t.revised };
  const set = (patch: Partial<AnyDraft>) => setEdits((e) => ({ ...e, ...patch }));

  const answer = async (action: ViewActionKind) => {
    setSending(action);
    void Haptics.impactAsync(action === "confirm" ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    const revision = action === "revise" ? note?.trim() : undefined;
    await Promise.resolve()
      .then(() => props.onAnswer(action, draft, revision))
      .then(
        () => toast.show({ variant: action === "confirm" ? "success" : "default", label: answered[action] }),
        (error) => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          toast.show({ variant: "danger", label: error instanceof Error ? error.message : String(error) });
        },
      );
    setSending(null);
  };

  // A labelled field of the draft; read-only once answered (kept at full contrast, unlike a disabled field).
  const text = (k: string, label: string, value: string | undefined, onChange: (v: string) => void, opts: { area?: boolean; rows?: number } = {}) => (
    <TextField key={k}>
      <Label>{label}</Label>
      {opts.area ? (
        <TextArea
          variant="secondary"
          value={value ?? ""}
          editable={!locked}
          numberOfLines={opts.rows ?? 5}
          onChangeText={onChange} />
      ) : (
        <Input variant="secondary" value={value ?? ""} editable={!locked} onChangeText={onChange} />
      )}
    </TextField>
  );

  const fields = () => {
    switch (props.view.type) {
      case "mail": {
        const d = draft as MailDraft;
        return (
          <>
            {text("to", t.to, d.to.join(", "), (v) => set({ to: list(v) }))}
            {(!!d.cc?.length || !locked) && text("cc", t.cc, d.cc?.join(", "), (v) => set({ cc: list(v) }))}
            {text("subject", t.subject, d.subject, (v) => set({ subject: v }))}
            {text("body", t.body, d.body, (v) => set({ body: v }), { area: true, rows: 8 })}
          </>
        );
      }
      case "calendar": {
        const d = draft as EventDraft;
        return (
          <>
            {text("title", t.title, d.title, (v) => set({ title: v }))}
            {text("start", t.start, toLocalInput(d.start), (v) => set({ start: fromLocalInput(v) }))}
            {text("end", t.end, toLocalInput(d.end), (v) => set({ end: fromLocalInput(v) || undefined }))}
            {text("location", t.location, d.location, (v) => set({ location: v }))}
            {text("attendees", t.attendees, d.attendees?.join(", "), (v) => set({ attendees: list(v) }))}
            {(!!d.description || !locked) && text("description", t.description, d.description, (v) => set({ description: v }), { area: true, rows: 3 })}
          </>
        );
      }
      case "chat": {
        const d = draft as ChatDraft;
        return (
          <>
            {text("channel", t.channel, d.channel, (v) => set({ channel: v }))}
            {text("text", t.message, d.text, (v) => set({ text: v }), { area: true, rows: 4 })}
          </>
        );
      }
      case "tasks": {
        const d = draft as TaskDraft;
        return (
          <>
            {text("title", t.title, d.title, (v) => set({ title: v }))}
            {(!!d.description || !locked) && text("description", t.description, d.description, (v) => set({ description: v }), { area: true, rows: 3 })}
            {text("assignee", t.assignee, d.assignee, (v) => set({ assignee: v }))}
            {text("due", t.due, d.due, (v) => set({ due: v }))}
            {text("project", t.project, d.project, (v) => set({ project: v }))}
          </>
        );
      }
    }
  };

  return (
    <>
      <Card.Body className="gap-3">{fields()}</Card.Body>
      {props.answer ? (
        <Card.Footer className="items-start">
          <Chip size="md" variant="soft" color={toneChip[ANSWER_TONE[props.answer]]}>
            {props.answer === "confirm" && <CheckIcon size={14} color={success} />}
            <Chip.Label>{answered[props.answer]}</Chip.Label>
          </Chip>
        </Card.Footer>
      ) : (
        props.canAct &&
        (note === null ? (
          <Card.Footer className="gap-2">
            <Button isDisabled={!!sending} onPress={() => answer("confirm")}>
              {props.view.confirm || t.confirm}
            </Button>
            <View className="flex-row gap-2">
              <Button className="flex-1" variant="secondary" isDisabled={!!sending} onPress={withTap(() => setNote(""))}>
                {t.revise}
              </Button>
              <Button className="flex-1" variant="tertiary" isDisabled={!!sending} onPress={() => answer("cancel")}>
                {t.cancel}
              </Button>
            </View>
          </Card.Footer>
        ) : (
          <Card.Footer className="gap-3">
            <TextField>
              <Label>{t.revise}</Label>
              <TextArea
                autoFocus
                variant="secondary"
                placeholder={t.revisePlaceholder}
                value={note}
                maxLength={2000}
                numberOfLines={2}
                onChangeText={setNote} />
            </TextField>
            <View className="flex-row gap-2">
              <Button className="flex-1" isDisabled={!!sending || !note.trim()} onPress={() => answer("revise")}>
                {t.sendRevision}
              </Button>
              <Button className="flex-1" variant="tertiary" isDisabled={!!sending} onPress={withTap(() => setNote(null))}>
                {t.cancel}
              </Button>
            </View>
          </Card.Footer>
        ))
      )}
    </>
  );
}
