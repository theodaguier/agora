import { useMutation, useQueryClient, type QueryClient, type UseMutationResult } from "@tanstack/react-query";
import { useId, useState } from "react";
import { FormLabel } from "@/components/FormLabel";
import { MoreIcon } from "@/components/icons";
import { OptionSelect } from "@/components/Pickers";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";
import { api, conversationPath } from "@/lib/api";
import type { Routine } from "@/lib/queries";
import { parseFrequency, scheduleOf, weekdays, type Frequency } from "@/lib/routines";

const messages = defineMessages({
  en: {
    editRoutine: "Edit routine",
    name: "Name",
    frequency: "Frequency",
    modes: { daily: "Every day", weekdays: "Weekdays", weekly: "Some days", custom: "Custom" } as Record<Frequency["mode"], string>,
    time: "Time",
    days: "Days",
    expr: "Schedule",
    exprHint: "Cron expression (0 9 * * *) or Hermes syntax: every 2h, every monday 9am…",
    failed: "Couldn't save the routine.",
    deleteTitle: "Delete this routine?",
    deleteBody: (name: string) => `“${name}” will no longer run. This can't be undone.`,
    deleting: "Deleting…",
    actions: "Routine actions",
    mention: "Mention in the conversation",
    pause: "Pause",
    resume: "Resume",
  },
  fr: {
    editRoutine: "Modifier la routine",
    name: "Nom",
    frequency: "Fréquence",
    modes: { daily: "Tous les jours", weekdays: "En semaine", weekly: "Certains jours", custom: "Personnalisée" },
    time: "Heure",
    days: "Jours",
    expr: "Planification",
    exprHint: "Expression cron (0 9 * * *) ou syntaxe Hermes : every 2h, every monday 9am…",
    failed: "Enregistrement impossible.",
    deleteTitle: "Supprimer cette routine ?",
    deleteBody: (name: string) => `« ${name} » ne s'exécutera plus. Action irréversible.`,
    deleting: "Suppression…",
    actions: "Actions de la routine",
    mention: "Mentionner dans la conversation",
    pause: "Mettre en pause",
    resume: "Reprendre",
  },
});

const routinePath = (conversationId: string, id: string) => conversationPath(conversationId, `/routines/${encodeURIComponent(id)}`);

/** The conversation's routine list, and the bot activity (profile sheet) that lists them too. */
const refreshRoutines = (qc: QueryClient, conversationId: string) =>
  Promise.all([
    qc.invalidateQueries({ queryKey: ["routines", conversationId] }),
    qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "agent" && q.queryKey[2] === "activity" }),
  ]);

export function RoutineDialog({
  conversationId,
  routine,
  open,
  onOpenChange,
}: {
  conversationId: string;
  routine: Routine;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && <RoutineForm conversationId={conversationId} routine={routine} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function RoutineForm({ conversationId, routine, onDone }: { conversationId: string; routine: Routine; onDone: () => void }) {
  const qc = useQueryClient();
  const t = useT(messages);
  const c = useT(common);
  const id = useId();
  const initial = parseFrequency(routine);
  const [mode, setMode] = useState<Frequency["mode"]>(initial.mode);
  const [time, setTime] = useState(initial.mode === "custom" ? "09:00" : initial.time);
  const [days, setDays] = useState<number[]>(initial.mode === "weekly" ? initial.days : [1]);
  const [expr, setExpr] = useState(initial.mode === "custom" ? initial.expr : "");

  const frequency: Frequency = mode === "custom" ? { mode, expr } : mode === "weekly" ? { mode, time, days } : { mode, time };
  const schedule = scheduleOf(frequency);
  const original = scheduleOf(initial);

  const save = useMutation({
    mutationFn: (body: { name?: string; schedule?: string }) =>
      api<Routine>(routinePath(conversationId, routine.id), { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: async () => {
      await refreshRoutines(qc, conversationId);
      onDone();
    },
  });

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        const name = String(new FormData(e.currentTarget).get("name")).trim();
        save.mutate({
          ...(name !== routine.name && { name }),
          ...(schedule !== original && { schedule }),
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>{t.editRoutine}</DialogTitle>
      </DialogHeader>
      <FieldGroup className="gap-4">
        <Field>
          <FormLabel htmlFor={`${id}-name`} required>
            {t.name}
          </FormLabel>
          <Input id={`${id}-name`} name="name" required maxLength={120} autoFocus defaultValue={routine.name} />
        </Field>
        <Field>
          <FormLabel htmlFor={`${id}-mode`} required>
            {t.frequency}
          </FormLabel>
          <OptionSelect
            id={`${id}-mode`}
            value={mode}
            onValueChange={(v) => setMode(v as Frequency["mode"])}
            options={(["daily", "weekdays", "weekly", "custom"] as const).map((m) => ({ value: m, label: t.modes[m] }))}
          />
        </Field>
        {mode === "weekly" && (
          <Field>
            <FormLabel required>{t.days}</FormLabel>
            <ToggleGroup
              multiple
              variant="outline"
              size="sm"
              spacing={1}
              className="flex-wrap"
              value={days.map(String)}
              onValueChange={(v) => v.length && setDays(v.map(Number))}
            >
              {weekdays("short").map((d) => (
                <ToggleGroupItem key={d.value} value={String(d.value)} className="capitalize">
                  {d.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
        )}
        {mode === "custom" ? (
          <Field>
            <FormLabel htmlFor={`${id}-expr`} required>
              {t.expr}
            </FormLabel>
            <Input id={`${id}-expr`} required maxLength={120} value={expr} onChange={(e) => setExpr(e.target.value)} className="font-mono" />
            <FieldDescription>{t.exprHint}</FieldDescription>
          </Field>
        ) : (
          <Field>
            <FormLabel htmlFor={`${id}-time`} required>
              {t.time}
            </FormLabel>
            <Input id={`${id}-time`} type="time" required value={time} onChange={(e) => setTime(e.target.value)} className="w-32" />
          </Field>
        )}
      </FieldGroup>
      {save.error && (
        <p role="alert" className="text-[13px] text-destructive">
          {save.error.message || t.failed}
        </p>
      )}
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>{c.cancel}</DialogClose>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? c.saving : c.save}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function DeleteRoutineDialog({
  conversationId,
  routine,
  open,
  onOpenChange,
}: {
  conversationId: string;
  routine: Routine;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const t = useT(messages);
  const c = useT(common);
  const remove = useMutation({
    mutationFn: () => api(routinePath(conversationId, routine.id), { method: "DELETE" }),
    onSuccess: async () => {
      await refreshRoutines(qc, conversationId);
      onOpenChange(false);
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t.deleteTitle}</DialogTitle>
          <DialogDescription>{t.deleteBody(routine.name)}</DialogDescription>
        </DialogHeader>
        {remove.error && (
          <p role="alert" className="text-[13px] text-destructive">
            {remove.error.message || t.failed}
          </p>
        )}
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>{c.cancel}</DialogClose>
          <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
            {remove.isPending ? t.deleting : c.delete}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Pause or resume. */
export function useToggleRoutine(conversationId: string, routine: Routine) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<Routine>(routinePath(conversationId, routine.id), { method: "PATCH", body: JSON.stringify({ enabled: !routine.enabled }) }),
    onSettled: () => refreshRoutines(qc, conversationId),
  });
}

/** "…" menu of a routine: mention (when there is a composer), edit, pause/resume, delete. */
export function RoutineActions({
  conversationId,
  routine,
  toggle,
  onMention,
}: {
  conversationId: string;
  routine: Routine;
  toggle: UseMutationResult<Routine, Error, void>;
  onMention?: () => void;
}) {
  const t = useT(messages);
  const c = useT(common);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t.actions} className="text-muted-foreground" />}>
          <MoreIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {onMention && (
            <>
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={onMention}>{t.mention}</DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setEditing(true)}>{c.edit}</DropdownMenuItem>
            <DropdownMenuItem disabled={toggle.isPending} onClick={() => toggle.mutate()}>
              {routine.enabled ? t.pause : t.resume}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setDeleting(true)}>
              {c.delete}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <RoutineDialog conversationId={conversationId} routine={routine} open={editing} onOpenChange={setEditing} />
      <DeleteRoutineDialog conversationId={conversationId} routine={routine} open={deleting} onOpenChange={setDeleting} />
    </>
  );
}
