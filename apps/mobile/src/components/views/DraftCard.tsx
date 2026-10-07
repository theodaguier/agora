import type { ChatDraft, DraftView, Drafts, DraftType, EventDraft, MailDraft, StatusTone, TaskDraft, ViewActionKind } from "@agora/core";
import { integrations } from "@agora/core/i18n";
import * as Haptics from "expo-haptics";
import { Button, Card, Input, Label, ListGroup, TextArea, TextField, Typography, useToast } from "heroui-native";
import { useState } from "react";
import { withTap } from "@/lib/haptics";
import { tr } from "@/lib/i18n";
import { fromLocalInput, toLocalInput } from "./format";
import { BlockGroup, StatusLine } from "./block";

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

  // A row of the draft's group: its label then its value, editable in place; read-only once answered
  // (kept at full contrast, unlike a disabled field). An `area` (a message's body) takes the full row.
  const text = (k: string, label: string, value: string | undefined, onChange: (v: string) => void, opts: { area?: boolean; rows?: number } = {}) =>
    opts.area ? (
      <ListGroup.Item key={k} accessible={false} className="px-3.5 py-2">
        <TextArea
          value={value ?? ""}
          editable={!locked}
          numberOfLines={opts.rows ?? 5}
          placeholder={label}
          accessibilityLabel={label}
          onChangeText={onChange}
          className="min-h-0 flex-1 border-0 bg-transparent px-0 py-1 shadow-none"
        />
      </ListGroup.Item>
    ) : (
      <ListGroup.Item key={k} accessible={false} className="items-center gap-3 px-3.5 py-0.5">
        <Typography type="body-sm" color="muted" className="w-[88px]">
          {label}
        </Typography>
        <Input
          value={value ?? ""}
          editable={!locked}
          accessibilityLabel={label}
          onChangeText={onChange}
          className="min-h-10 flex-1 border-0 bg-transparent px-0 font-medium shadow-none"
        />
      </ListGroup.Item>
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
      <Card.Body>
        <BlockGroup>{fields()}</BlockGroup>
      </Card.Body>
      {props.answer ? (
        <Card.Footer>
          <StatusLine tone={ANSWER_TONE[props.answer]} label={answered[props.answer]} />
        </Card.Footer>
      ) : (
        props.canAct &&
        (note === null ? (
          <Card.Footer className="gap-2">
            <Button isDisabled={!!sending} onPress={() => answer("confirm")}>
              {props.view.confirm || t.confirm}
            </Button>
            <Button variant="secondary" isDisabled={!!sending} onPress={withTap(() => setNote(""))}>
              {t.revise}
            </Button>
            <Button variant="ghost" isDisabled={!!sending} onPress={() => answer("cancel")}>
              {t.cancel}
            </Button>
          </Card.Footer>
        ) : (
          <Card.Footer className="gap-2">
            <TextField>
              <Label>{t.revise}</Label>
              <TextArea
                autoFocus
                placeholder={t.revisePlaceholder}
                value={note}
                maxLength={2000}
                numberOfLines={2}
                onChangeText={setNote}
                className="rounded-[14px]" />
            </TextField>
            <Button isDisabled={!!sending || !note.trim()} onPress={() => answer("revise")}>
              {t.sendRevision}
            </Button>
            <Button variant="ghost" isDisabled={!!sending} onPress={withTap(() => setNote(null))}>
              {t.cancel}
            </Button>
          </Card.Footer>
        ))
      )}
    </>
  );
}
