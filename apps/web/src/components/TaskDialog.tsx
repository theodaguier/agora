import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { FormLabel } from "@/components/FormLabel";
import { OptionSelect } from "@/components/Pickers";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { api, type Task, type TaskPriority } from "@/lib/api";
import { formatDueDate, fromDay, toDay } from "@/lib/dates";
import { priorityMessages, TASK_PRIORITIES } from "@/lib/task-status";
import { enUS, fr } from "react-day-picker/locale";
import { defineMessages, useLocale, useT } from "@/i18n";
import { common } from "@agora/core/i18n";

const messages = defineMessages({
  en: {
    editTask: "Edit task",
    title: "Task",
    titlePlaceholder: "What needs to be done",
    description: "Details",
    due: "Due date",
    noDue: "No due date",
    clearDue: "Remove due date",
    failed: "Couldn't save the task.",
  },
  fr: {
    editTask: "Modifier la tâche",
    title: "Tâche",
    titlePlaceholder: "Ce qu'il y a à faire",
    description: "Détails",
    due: "Échéance",
    noDue: "Pas d'échéance",
    clearDue: "Retirer l'échéance",
    failed: "Enregistrement impossible.",
  },
});

/** Edits a task you assigned (creating one goes through QuickAddTask). */
export function TaskDialog({
  open,
  onOpenChange,
  task,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">{open && <TaskForm task={task} onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function TaskForm({ task, onDone }: { task: Task; onDone: () => void }) {
  const qc = useQueryClient();
  const t = useT(messages);
  const c = useT(common);
  const p = useT(priorityMessages);
  const id = useId();
  const locale = useLocale();
  const [due, setDue] = useState<string | null>(task.dueOn ?? null);
  const [picking, setPicking] = useState(false);

  const save = useMutation({
    mutationFn: (body: { title: string; description: string; dueOn: string | null; priority: TaskPriority }) =>
      api<Task>(`/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["tasks"] });
      onDone();
    },
    meta: { success: c.saved, error: false },
  });

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        save.mutate({
          title: String(form.get("title")).trim(),
          description: String(form.get("description")).trim(),
          dueOn: due,
          priority: String(form.get("priority")) as TaskPriority,
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>{t.editTask}</DialogTitle>
        <DialogDescription>{task.assignees.map((a) => a.name).join(", ")}</DialogDescription>
      </DialogHeader>
      <FieldGroup className="gap-4">
        <Field>
          <FormLabel htmlFor={`${id}-title`} required>
            {t.title}
          </FormLabel>
          <Input id={`${id}-title`} name="title" required maxLength={200} autoFocus placeholder={t.titlePlaceholder} defaultValue={task.title} />
        </Field>
        <Field>
          <FormLabel htmlFor={`${id}-description`}>{t.description}</FormLabel>
          <Textarea id={`${id}-description`} name="description" maxLength={2000} rows={3} defaultValue={task.description} />
        </Field>
        <Field>
          <FormLabel htmlFor={`${id}-priority`}>{p.priority}</FormLabel>
          <OptionSelect
            id={`${id}-priority`}
            name="priority"
            defaultValue={task.priority}
            options={TASK_PRIORITIES.map((level) => ({ value: level, label: p.label[level] }))}
          />
        </Field>
        <Field>
          <FormLabel htmlFor={`${id}-due`}>{t.due}</FormLabel>
          <Popover open={picking} onOpenChange={setPicking}>
            <PopoverTrigger render={<Button id={`${id}-due`} type="button" variant="outline" className="justify-start font-normal" />}>
              {due ? formatDueDate(due) : <span className="text-muted-foreground">{t.noDue}</span>}
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <Calendar
                mode="single"
                locale={locale === "fr" ? fr : enUS}
                selected={due ? fromDay(due) : undefined}
                defaultMonth={due ? fromDay(due) : undefined}
                onSelect={(d) => {
                  setDue(d ? toDay(d) : null);
                  setPicking(false);
                }}
              />
              {due && (
                <div className="border-t border-border p-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setDue(null);
                      setPicking(false);
                    }}
                  >
                    {t.clearDue}
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </Field>
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
