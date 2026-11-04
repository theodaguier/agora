import type { ChatDraft, DraftView, Drafts, DraftType, EventDraft, MailDraft, StatusTone, TaskDraft, ViewActionKind } from "@agora/core";
import { integrations } from "@agora/core/i18n";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { BlockFooter, StatusLine } from "./block";
import { fromLocalInput, toLocalInput } from "./format";

type AnyDraft = Drafts[DraftType];

const ANSWER_TONE: Record<ViewActionKind, StatusTone> = { confirm: "success", revise: "warning", cancel: "neutral" };

const list = (s: string) =>
  s
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * Draft proposed by a bot (mail, event, message, task): editable in place, then
 * confirmed or cancelled. The bot carries it out itself once it gets the answer.
 */
export function DraftCard(props: {
  view: DraftView;
  /** The employee's answer, once given (read-only then). */
  answer?: ViewActionKind;
  canAct: boolean;
  /** `note`: what to change, when asking the bot for a new version. */
  onAnswer: (action: ViewActionKind, draft: AnyDraft, note?: string) => Promise<void> | void;
}) {
  const t = useT(integrations);
  const [draft, setDraft] = useState<AnyDraft>(props.view.draft);
  const [sending, setSending] = useState<ViewActionKind | null>(null);
  // Asking for changes: the note typed for the bot (null = closed).
  const [note, setNote] = useState<string | null>(null);
  const locked = !!props.answer || !props.canAct || !!sending;
  const set = (patch: Partial<AnyDraft>) => setDraft((d) => ({ ...d, ...patch }) as AnyDraft);
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;

  const answer = async (action: ViewActionKind) => {
    setSending(action);
    try {
      await props.onAnswer(action, draft, action === "revise" ? note?.trim() : undefined);
    } finally {
      setSending(null);
    }
  };

  /**
   * One field of the draft. `cell`: one of the columns of a row split in two or three (laid out by
   * the caller). `bare`: the label is only read out, the text being the draft itself (a mail's body, a message).
   */
  const text = (
    k: string,
    label: string,
    value: string | undefined,
    onChange: (v: string) => void,
    opts: { area?: boolean; rows?: number; type?: string; bare?: boolean } = {},
  ) => (
    <Field key={k}>
      <FieldLabel htmlFor={id(k)} className={cn(opts.bare && "sr-only")}>
        {label}
      </FieldLabel>
      {opts.area ? (
        <Textarea id={id(k)} value={value ?? ""} readOnly={locked} rows={opts.rows ?? 5} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input id={id(k)} type={opts.type} value={value ?? ""} readOnly={locked} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  );

  const fields = () => {
    switch (props.view.type) {
      case "mail": {
        const d = draft as MailDraft;
        return (
          <>
            {text("to", t.to, d.to.join(", "), (v) => set({ to: list(v) }))}
            {(d.cc?.length || !locked) && text("cc", t.cc, d.cc?.join(", "), (v) => set({ cc: list(v) }))}
            {text("subject", t.subject, d.subject, (v) => set({ subject: v }))}
            {text("body", t.body, d.body, (v) => set({ body: v }), { area: true, rows: 8, bare: true })}
          </>
        );
      }
      case "calendar": {
        const d = draft as EventDraft;
        return (
          <>
            {text("title", t.title, d.title, (v) => set({ title: v }))}
            <div className="grid gap-4 sm:grid-cols-2">
              {text("start", t.start, toLocalInput(d.start), (v) => set({ start: fromLocalInput(v) }), { type: "datetime-local" })}
              {text("end", t.end, toLocalInput(d.end), (v) => set({ end: fromLocalInput(v) || undefined }), { type: "datetime-local" })}
            </div>
            {text("location", t.location, d.location, (v) => set({ location: v }))}
            {text("attendees", t.attendees, d.attendees?.join(", "), (v) => set({ attendees: list(v) }))}
            {(d.description || !locked) && text("description", t.description, d.description, (v) => set({ description: v }), { area: true, rows: 3 })}
          </>
        );
      }
      case "chat": {
        const d = draft as ChatDraft;
        return (
          <>
            {text("channel", t.channel, d.channel, (v) => set({ channel: v }))}
            {text("text", t.message, d.text, (v) => set({ text: v }), { area: true, rows: 4, bare: true })}
          </>
        );
      }
      case "tasks": {
        const d = draft as TaskDraft;
        return (
          <>
            {text("title", t.title, d.title, (v) => set({ title: v }))}
            {(d.description || !locked) && text("description", t.description, d.description, (v) => set({ description: v }), { area: true, rows: 3 })}
            <div className="grid gap-4 sm:grid-cols-3">
              {text("assignee", t.assignee, d.assignee, (v) => set({ assignee: v }))}
              {text("due", t.due, d.due, (v) => set({ due: v }), { type: "date" })}
              {text("project", t.project, d.project, (v) => set({ project: v }))}
            </div>
          </>
        );
      }
    }
  };

  const revising = props.canAct && !props.answer && note !== null;

  return (
    <>
      <CardContent className="flex flex-col gap-4">
        <FieldGroup>{fields()}</FieldGroup>
        {props.answer && (
          <StatusLine tone={ANSWER_TONE[props.answer]}>{{ confirm: t.confirmed, cancel: t.cancelled, revise: t.revised }[props.answer]}</StatusLine>
        )}
        {revising && (
          <form
            id={id("revise")}
            onSubmit={(e) => {
              e.preventDefault();
              if (note.trim()) answer("revise");
            }}
          >
            <Textarea
                autoFocus
                aria-label={t.revise}
                placeholder={t.revisePlaceholder}
                value={note}
                maxLength={2000}
                rows={2}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    if (note.trim()) answer("revise");
                  }
                  if (e.key === "Escape") setNote(null);
                }}
              />
          </form>
        )}
      </CardContent>
      {props.canAct &&
        !props.answer &&
        (revising ? (
          <BlockFooter>
            <Button type="button" variant="secondary" disabled={!!sending} onClick={() => setNote(null)}>
              {t.cancel}
            </Button>
            <Button type="submit" form={id("revise")} disabled={!!sending || !note?.trim()}>
              {t.sendRevision}
            </Button>
          </BlockFooter>
        ) : (
          <BlockFooter>
            <Button variant="secondary" className="mr-auto" disabled={!!sending} onClick={() => answer("cancel")}>
              {t.cancel}
            </Button>
            <Button variant="secondary" disabled={!!sending} onClick={() => setNote("")}>
              {t.revise}
            </Button>
            <Button disabled={!!sending} onClick={() => answer("confirm")}>
              {props.view.confirm || t.confirm}
            </Button>
          </BlockFooter>
        ))}
    </>
  );
}
