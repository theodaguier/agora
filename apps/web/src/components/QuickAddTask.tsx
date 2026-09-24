import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { enUS, fr } from "react-day-picker/locale";
import { PersonAvatar } from "@/components/ConversationAvatar";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Command, CommandItem, CommandList } from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api, type Person, type Task, type TaskPriority } from "@/lib/api";
import { formatDueDate, fromDay, toDay } from "@/lib/dates";
import { usePeople } from "@/lib/people";
import { priorityMessages, TASK_PRIORITIES } from "@/lib/task-status";
import { defineMessages, useLocale, useT } from "@/i18n";
import { cn } from "@/lib/utils";

const messages = defineMessages({
  en: {
    placeholder: "Add a task, @someone to assign it, then Enter",
    placeholderFor: (name: string) => `Assign a task to ${name}, then Enter`,
    label: "New task",
    forYou: "For you",
    forPeople: (names: string) => `For ${names}`,
    noDue: "No due date",
    due: (date: string) => `Due ${date}`,
    clearDue: "Remove due date",
    add: "Add",
    adding: "Adding…",
    failed: "Couldn't add the task.",
  },
  fr: {
    placeholder: "Ajouter une tâche, @quelqu'un pour l'assigner, puis Entrée",
    placeholderFor: (name: string) => `Assigner une tâche à ${name}, puis Entrée`,
    label: "Nouvelle tâche",
    forYou: "Pour toi",
    forPeople: (names: string) => `Pour ${names}`,
    noDue: "Sans échéance",
    due: (date: string) => `Échéance ${date}`,
    clearDue: "Retirer l'échéance",
    add: "Ajouter",
    adding: "Ajout…",
    failed: "Ajout impossible.",
  },
});

type Candidate = Pick<Person, "id" | "name" | "image"> & { username: string };

/** "@handle" as typed: letters, digits, "." and "_" (a final "." ends the sentence). */
const TAG = /(^|\s)@([\w.]+)/g;
const handleOf = (raw: string) => raw.replace(/\.+$/, "").toLowerCase();

/** People tagged in the text, and the title without their tags. */
function parseTags(text: string, people: Candidate[]) {
  const tagged: Candidate[] = [];
  const title = text
    .replace(TAG, (whole, space: string, raw: string) => {
      const who = people.find((p) => p.username === handleOf(raw));
      if (!who) return whole;
      if (!tagged.some((t) => t.id === who.id)) tagged.push(who);
      return space;
    })
    .replace(/\s+/g, " ")
    .trim();
  return { tagged, title };
}

/** The text cut into plain runs and tags of known people, to color the tags. */
function splitTags(text: string, people: Candidate[]) {
  const parts: { text: string; tag: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(TAG)) {
    const handle = handleOf(m[2]!);
    if (!people.some((p) => p.username === handle)) continue;
    const start = m.index + m[1]!.length;
    const end = start + 1 + m[2]!.replace(/\.+$/, "").length;
    if (start > last) parts.push({ text: text.slice(last, start), tag: false });
    parts.push({ text: text.slice(start, end), tag: true });
    last = end;
  }
  if (last < text.length) parts.push({ text: text.slice(last), tag: false });
  return parts;
}

/** "@que" being typed just before the caret. */
function tagAtCaret(text: string, caret: number) {
  const m = text.slice(0, caret).match(/(^|\s)@([\w.]{0,30})$/);
  return m ? { start: caret - m[2]!.length - 1, query: m[2]!.toLowerCase() } : null;
}

/**
 * One-line task creation: type the title, Enter. "@username" assigns it to
 * that person (one task per person tagged); nobody tagged = for you, or for
 * `assignee` when set (profile panel). A due date is optional.
 */
export function QuickAddTask({ assignee }: { assignee?: { id: string; name: string } }) {
  const { user } = useRouteContext({ from: "/app" });
  const qc = useQueryClient();
  const t = useT(messages);
  const input = useRef<HTMLInputElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [due, setDue] = useState<string | null>(null);
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState<number | null>(null);

  const everyone = usePeople();
  const people = useMemo<Candidate[]>(() => everyone.map((p) => ({ id: p.id, name: p.name, image: p.image, username: p.handle })), [everyone]);

  const { tagged, title } = parseTags(text, people);
  const highlighted = tagged.length > 0;
  const targets = tagged.length ? tagged : [assignee ?? { id: user.id, name: user.name }];
  const forYou = targets.length === 1 && targets[0]!.id === user.id;

  const tag = tagAtCaret(text, caret);
  const suggestions =
    tag && dismissed !== tag.start
      ? [
          // Handle matches first, then someone whose name has a word starting with it.
          ...people.filter((p) => p.username.startsWith(tag.query)).sort((a, b) => a.username.length - b.username.length),
          ...people.filter(
            (p) =>
              !p.username.startsWith(tag.query) &&
              p.name
                .toLowerCase()
                .split(/\s+/)
                .some((w) => w.startsWith(tag.query)),
          ),
        ].slice(0, 6)
      : [];
  const current = suggestions[Math.min(active, suggestions.length - 1)];

  const complete = (p: Candidate) => {
    if (!tag) return;
    const inserted = `@${p.username} `;
    const next = text.slice(0, tag.start) + inserted + text.slice(caret);
    const at = tag.start + inserted.length;
    setText(next);
    setCaret(at);
    setActive(0);
    requestAnimationFrame(() => input.current?.setSelectionRange(at, at));
  };

  const add = useMutation({
    mutationFn: () => api<Task[]>("/tasks", { method: "POST", body: JSON.stringify({ title, assigneeIds: targets.map((p) => p.id), dueOn: due, priority }) }),
    onSuccess: async () => {
      setText("");
      setCaret(0);
      setDue(null);
      setPriority("normal");
      await qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const placeholder = assignee && assignee.id !== user.id ? t.placeholderFor(assignee.name.split(" ")[0]!) : t.placeholder;
  const sync = (el: HTMLInputElement) => setCaret(el.selectionStart ?? el.value.length);

  return (
    <form
      className="relative flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (title && !add.isPending) add.mutate();
      }}
    >
      <div className="relative">
        <Input
          ref={input}
          onScroll={(e) => overlay.current && (overlay.current.scrollLeft = e.currentTarget.scrollLeft)}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            sync(e.target);
            setActive(0);
          }}
          onSelect={(e) => sync(e.currentTarget)}
          onKeyDown={(e) => {
            if (!current) return;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const n = suggestions.length;
              setActive((i) => (Math.min(i, n - 1) + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
            } else if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              complete(current);
            } else if (e.key === "Escape") {
              setDismissed(tag!.start);
            }
          }}
          maxLength={300}
          placeholder={placeholder}
          aria-label={t.label}
          aria-expanded={suggestions.length > 0}
          className={cn("h-10", highlighted && "text-transparent caret-foreground")}
        />
        {/* The field's text turns transparent and a copy with colored tags is drawn over it. */}
        {highlighted && (
          <div
            ref={overlay}
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre border border-transparent px-3 text-base md:text-sm"
          >
            {splitTags(text, people).map((part, i) =>
              part.tag ? (
                <span key={i} className="rounded-sm bg-brand/15 text-brand">
                  {part.text}
                </span>
              ) : (
                <span key={i}>{part.text}</span>
              ),
            )}
          </div>
        )}
      </div>
      {current && (
        <Command value={current.id} shouldFilter={false} className="absolute top-11 z-20 h-auto w-64 border border-border shadow-md">
          <CommandList>
            {suggestions.map((p) => (
              <CommandItem
                key={p.id}
                value={p.id}
                onMouseDown={(e) => e.preventDefault()}
                onSelect={() => complete(p)}
                className="h-9 gap-2.5 rounded-lg px-2.5 text-sm"
              >
                <PersonAvatar person={p} className="size-5" />
                <span className="truncate">{p.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">@{p.username}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      )}
      {title && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="min-w-0 truncate px-1 text-[13px] text-muted-foreground">
            {forYou ? t.forYou : t.forPeople(targets.map((p) => (p.id === user.id ? p.name.split(" ")[0] : p.name)).join(", "))}
          </span>
          <DuePicker value={due} onChange={setDue} />
          <PriorityPicker value={priority} onChange={setPriority} />
          <Button type="submit" size="sm" className="ml-auto" disabled={add.isPending}>
            {add.isPending ? t.adding : t.add}
          </Button>
        </div>
      )}
      {add.error && (
        <p role="alert" className="text-[13px] text-destructive">
          {add.error.message || t.failed}
        </p>
      )}
    </form>
  );
}

function DuePicker({ value, onChange }: { value: string | null; onChange: (day: string | null) => void }) {
  const t = useT(messages);
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const set = (day: string | null) => {
    onChange(day);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button type="button" variant="secondary" size="sm" className="font-normal" />}>
        {value ? t.due(formatDueDate(value)) : t.noDue}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          locale={locale === "fr" ? fr : enUS}
          selected={value ? fromDay(value) : undefined}
          defaultMonth={value ? fromDay(value) : undefined}
          onSelect={(d) => set(d ? toDay(d) : null)}
        />
        {value && (
          <div className="border-t border-border p-2">
            <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => set(null)}>
              {t.clearDue}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function PriorityPicker({ value, onChange }: { value: TaskPriority; onChange: (priority: TaskPriority) => void }) {
  const p = useT(priorityMessages);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="secondary" size="sm" className="font-normal" />}>
        {p.priority} · {p.label[value]}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40">
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as TaskPriority)}>
          {TASK_PRIORITIES.map((level) => (
            <DropdownMenuRadioItem key={level} value={level}>
              {p.label[level]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
