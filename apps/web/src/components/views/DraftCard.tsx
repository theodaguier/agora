import type { ChatDraft, DraftView, Drafts, DraftType, EventDraft, MailDraft, StatusTone, TaskDraft, ViewActionKind } from "@agora/core";
import { integrations } from "@agora/core/i18n";
import { useId, useState } from "react";
import { CheckIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupTextarea } from "@/components/ui/input-group";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { fromLocalInput, toLocalInput } from "./format";
import { toneBadge } from "./tone";

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

  const text = (k: string, label: string, value: string | undefined, onChange: (v: string) => void, opts: { area?: boolean; rows?: number; type?: string } = {}) => (
    <InputGroup key={k} className="h-auto bg-background dark:bg-background">
      <InputGroupAddon align={opts.area ? "block-start" : "inline-start"} className={opts.area ? "pb-0" : "min-w-16 justify-start"}>
        <label htmlFor={id(k)} className="text-xs text-muted-foreground">
          {label}
        </label>
      </InputGroupAddon>
      {opts.area ? (
        <InputGroupTextarea
          id={id(k)}
          value={value ?? ""}
          readOnly={locked}
          rows={opts.rows ?? 5}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-0 leading-relaxed"
        />
      ) : (
        <InputGroupInput id={id(k)} type={opts.type} value={value ?? ""} readOnly={locked} onChange={(e) => onChange(e.target.value)} />
      )}
    </InputGroup>
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
            {text("body", t.body, d.body, (v) => set({ body: v }), { area: true, rows: 8 })}
          </>
        );
      }
      case "calendar": {
        const d = draft as EventDraft;
        return (
          <>
            {text("title", t.title, d.title, (v) => set({ title: v }))}
            <div className="grid gap-2 sm:grid-cols-2">
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
            {text("text", t.message, d.text, (v) => set({ text: v }), { area: true, rows: 4 })}
          </>
        );
      }
      case "tasks": {
        const d = draft as TaskDraft;
        return (
          <>
            {text("title", t.title, d.title, (v) => set({ title: v }))}
            {(d.description || !locked) && text("description", t.description, d.description, (v) => set({ description: v }), { area: true, rows: 3 })}
            <div className="grid gap-2 sm:grid-cols-3">
              {text("assignee", t.assignee, d.assignee, (v) => set({ assignee: v }))}
              {text("due", t.due, d.due, (v) => set({ due: v }), { type: "date" })}
              {text("project", t.project, d.project, (v) => set({ project: v }))}
            </div>
          </>
        );
      }
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <FieldGroup className="gap-2">{fields()}</FieldGroup>
      {props.answer ? (
        <div>
          <Badge variant="secondary" className={cn("font-normal", toneBadge[ANSWER_TONE[props.answer]])}>
            {props.answer === "confirm" && <CheckIcon data-icon="inline-start" />}
            {{ confirm: t.confirmed, cancel: t.cancelled, revise: t.revised }[props.answer]}
          </Badge>
        </div>
      ) : (
        props.canAct &&
        (note === null ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!!sending} onClick={() => answer("confirm")}>
              {props.view.confirm || t.confirm}
            </Button>
            <Button size="sm" variant="secondary" disabled={!!sending} onClick={() => setNote("")}>
              {t.revise}
            </Button>
            <Button size="sm" variant="ghost" disabled={!!sending} onClick={() => answer("cancel")}>
              {t.cancel}
            </Button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (note.trim()) answer("revise");
            }}
          >
            <InputGroup className="h-auto bg-background dark:bg-background">
              <InputGroupTextarea
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
                className="min-h-0"
              />
            </InputGroup>
            <div className="flex gap-2">
              <Button size="sm" type="submit" disabled={!!sending || !note.trim()}>
                {t.sendRevision}
              </Button>
              <Button size="sm" type="button" variant="ghost" disabled={!!sending} onClick={() => setNote(null)}>
                {t.cancel}
              </Button>
            </div>
          </form>
        ))
      )}
    </div>
  );
}
