import * as Haptics from "expo-haptics";
import { common } from "@agora/core/i18n";
import { Button, ListGroup, Select, Separator, Switch } from "heroui-native";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { PersonAvatar } from "@/components/conversation-avatar";
import { DayPicker } from "@/components/profile/native-pickers";
import { useMe } from "@/components/server-scope";
import { defineMessages, tr } from "@/lib/i18n";
import { usePeople } from "@/lib/people";
import { formatDueDate, fromDay, toDay, useTaskPatch, type Task, type TaskPriority, type TaskStatus } from "@/lib/tasks";
import { priorityMessages, statusMessages, TASK_PRIORITIES, TASK_STATUSES } from "@/lib/task-status";

/*
 * The settings-like rows of the task sheets (Reminders' details): HeroUI Selects for the status
 * and the priority, a switch and a month calendar of HeroUI buttons for the due date.
 */

const messages = defineMessages({
  en: { due: "Due date", noDue: "No due date", day: "Day", people: "Working on it", change: "Change" },
  fr: { due: "Échéance", noDue: "Pas d'échéance", day: "Jour", people: "Sur la tâche", change: "Modifier" },
});

/**
 * A HeroUI Select listing `options`, its trigger a ghost button showing the current value. Dialog
 * presentation: the task sheets are native form sheets, where a popover would be shifted.
 */
function OptionSelect<T extends string>({
  value,
  options,
  onChange,
  disabled,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  label: string;
}) {
  const selected = options.find((o) => o.value === value);
  return (
    <Select
      presentation="dialog"
      isDisabled={disabled}
      value={selected}
      onValueChange={(v) => {
        const option = Array.isArray(v) ? v[0] : v;
        if (!option || option.value === value) return;
        void Haptics.selectionAsync();
        onChange(option.value as T);
      }}
    >
      <Select.Trigger variant="unstyled" asChild>
        <Button size="sm" variant="ghost" isDisabled={disabled} accessibilityLabel={label}>
          <Select.Value placeholder={label} />
          <Select.TriggerIndicator />
        </Button>
      </Select.Trigger>
      <Select.Portal>
        <Select.Overlay />
        <Select.Content presentation="dialog">
          <Select.ListLabel>{label}</Select.ListLabel>
          {options.map((o) => (
            <Select.Item key={o.value} value={o.value} label={o.label} />
          ))}
        </Select.Content>
      </Select.Portal>
    </Select>
  );
}

export function StatusRow({ value, onChange, disabled }: { value: TaskStatus; onChange: (status: TaskStatus) => void; disabled?: boolean }) {
  return (
    <ListGroup.Item disabled className="py-2">
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle>{statusMessages.status}</ListGroup.ItemTitle>
      </ListGroup.ItemContent>
      <ListGroup.ItemSuffix>
        <OptionSelect
          label={statusMessages.status}
          value={value}
          disabled={disabled}
          onChange={onChange}
          options={TASK_STATUSES.map((s) => ({ value: s, label: statusMessages.label[s] }))}
        />
      </ListGroup.ItemSuffix>
    </ListGroup.Item>
  );
}

export function PriorityRow({ value, onChange, disabled }: { value: TaskPriority; onChange: (priority: TaskPriority) => void; disabled?: boolean }) {
  return (
    <ListGroup.Item disabled className="py-2">
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle>{priorityMessages.priority}</ListGroup.ItemTitle>
      </ListGroup.ItemContent>
      <ListGroup.ItemSuffix>
        <OptionSelect
          label={priorityMessages.priority}
          value={value}
          disabled={disabled}
          onChange={onChange}
          options={TASK_PRIORITIES.map((p) => ({ value: p, label: priorityMessages.label[p] }))}
        />
      </ListGroup.ItemSuffix>
    </ListGroup.Item>
  );
}

/** Due date: the switch turns it on (today) or removes it, the calendar changes the day. */
export function DueRow({ value, onChange, disabled }: { value: string | null; onChange: (day: string | null) => void; disabled?: boolean }) {
  return (
    <>
      <ListGroup.Item disabled className="py-2">
        <ListGroup.ItemContent>
          <ListGroup.ItemTitle>{messages.due}</ListGroup.ItemTitle>
          <ListGroup.ItemDescription>{value ? formatDueDate(value) : messages.noDue}</ListGroup.ItemDescription>
        </ListGroup.ItemContent>
        <ListGroup.ItemSuffix>
          <Switch isSelected={!!value} isDisabled={disabled} onSelectedChange={(on) => onChange(on ? toDay(new Date()) : null)} />
        </ListGroup.ItemSuffix>
      </ListGroup.Item>
      {value && !disabled && (
        <>
          <Separator className="mx-4" />
          <ListGroup.Item disabled className="py-2">
            <ListGroup.ItemContent>
              <ListGroup.ItemTitle>{messages.day}</ListGroup.ItemTitle>
            </ListGroup.ItemContent>
            <ListGroup.ItemSuffix>
              {/* HeroUI has no date picker: the shared Select of days, from the saved day if it is past. */}
              <DayPicker value={fromDay(value)} from={fromDay(value < toDay(new Date()) ? value : toDay(new Date()))} label={messages.due} onChange={(d) => onChange(toDay(d))} />
            </ListGroup.ItemSuffix>
          </ListGroup.Item>
        </>
      )}
    </>
  );
}

/**
 * "Change" under the task's people: a multiple Select of the colleagues, in the task sheet itself
 * (never a sheet over the sheet). Each check is saved at once; there is always one left.
 */
export function AssigneesRow({ task }: { task: Task }) {
  const me = useMe();
  const people = usePeople();
  const save = useTaskPatch(task.id);
  // What's checked right now, ahead of the refetch.
  const [picked, setPicked] = useState<string[] | null>(null);
  const ids = picked ?? task.assignees.map((a) => a.id);
  const assigned = new Set(ids);
  const label = (p: { id: string; name: string }) => (p.id === me.id ? `${p.name} (${tr(common).you})` : p.name);
  const options = people.map((p) => ({ value: p.id, label: label(p) }));
  return (
    <Select
      presentation="dialog"
      selectionMode="multiple"
      value={options.filter((o) => assigned.has(o.value))}
      onValueChange={(v) => {
        const next = v.flatMap((o) => (o ? [o.value] : []));
        if (!next.length) return;
        void Haptics.selectionAsync();
        setPicked(next);
        save.mutate({ assigneeIds: next });
      }}
    >
      <Select.Trigger variant="unstyled" asChild>
        <ListGroup.Item>
          <ListGroup.ItemContent>
            <ListGroup.ItemTitle className="font-normal text-link">{messages.change}</ListGroup.ItemTitle>
          </ListGroup.ItemContent>
        </ListGroup.Item>
      </Select.Trigger>
      <Select.Portal>
        <Select.Overlay />
        <Select.Content presentation="dialog">
          <Select.ListLabel>{messages.people}</Select.ListLabel>
          <ScrollView className="max-h-96">
            {people.map((p) => (
              <Select.Item key={p.id} value={p.id} label={label(p)} disabled={save.isPending || (ids.length === 1 && ids[0] === p.id)}>
                <View className="flex-1 flex-row items-center gap-3">
                  <PersonAvatar person={p} size={28} />
                  <Select.ItemLabel />
                </View>
                <Select.ItemIndicator />
              </Select.Item>
            ))}
          </ScrollView>
        </Select.Content>
      </Select.Portal>
    </Select>
  );
}
