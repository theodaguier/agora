import { queryOptions, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { Href } from "expo-router";
import { api } from "./api";
import { locale } from "./i18n";
import type { AgentAvatarSpec } from "./types";
import { matchAll } from "./utils";

/* The tasks API, as apps/web/src/lib/api.ts types it and apps/web/src/lib/queries.ts reads it. */

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "normal" | "high" | "urgent";

export type TaskAssignee = { id: string; name: string; image: string | null; current: boolean };

export type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** Day it is due (YYYY-MM-DD), or null. */
  dueOn: string | null;
  /** People working on it; `current`: it's what they're working on right now. */
  assignees: TaskAssignee[];
  /** The bot that assigned it, otherwise the colleague. */
  assignedBy: { kind: "agent"; id: string; name: string; avatar: AgentAvatarSpec } | { kind: "user"; id: string; name: string; image: string | null } | null;
  /** For a bot's task: the colleague whose conversation it came from. */
  requestedBy: { id: string; name: string } | null;
  conversationId: string | null;
  completedAt: string | null;
  createdAt: string;
  /** Can move it along, prioritize it and choose who's on it. */
  canEdit: boolean;
  /** Created it (or admin): can also reword it, date it and delete it. */
  canDelete: boolean;
};

/** Fields PATCH /tasks/:id takes (any subset). */
export type TaskPatch = Partial<Pick<Task, "title" | "description" | "status" | "priority" | "dueOn">> & { assigneeIds?: string[] };

/** Tasks someone works on or created: same key and request as `tasksQuery` in lib/queries.ts, with the full type. */
export const userTasksQuery = (userId: string) =>
  queryOptions({
    queryKey: ["tasks", userId],
    queryFn: () => api<Task[]>(`/tasks?${new URLSearchParams({ user: userId })}`),
  });

/** One task (apps/web/src/lib/queries.ts `taskQuery`, same key as the task cited in a message). */
export const taskQuery = (id: string) =>
  queryOptions({
    queryKey: ["tasks", "one", id],
    queryFn: () => api<Task>(`/tasks/${encodeURIComponent(id)}`),
    retry: false,
  });

/*
 * The task screens are new routes: typed routes list them once Metro regenerates
 * .expo/types/router.d.ts, until then the string is cast.
 */
/** A task's sheet, over whatever screen opened it (the (app) stack, not the tasks tab). */
export const taskHref = (id: string) => `/task/${encodeURIComponent(id)}` as Href;
export const newTaskHref = "/task/new" as Href;

/** Applies `patch` to every cached copy of the task: the lists and the single task. */
function patchCached(qc: QueryClient, id: string, patch: Partial<Task>) {
  qc.setQueriesData<unknown>({ queryKey: ["tasks"] }, (data: unknown) => {
    if (Array.isArray(data)) return data.map((t: Task) => (t?.id === id ? { ...t, ...patch } : t));
    if (data && typeof data === "object" && (data as Task).id === id) return { ...(data as Task), ...patch };
    return data;
  });
}

/**
 * PATCH /tasks/:id. Status, priority and wording show at once (optimistic); the lists are
 * refetched after, as the "tasks.changed" event does for everyone else.
 */
export function useTaskPatch(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: TaskPatch) => api<Task>(`/tasks/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onMutate: async ({ assigneeIds: _, ...patch }) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      patchCached(qc, id, { ...patch, ...(patch.status && { completedAt: patch.status === "done" ? new Date().toISOString() : null }) });
    },
    onSettled: () => Promise.all([qc.invalidateQueries({ queryKey: ["tasks"] }), qc.invalidateQueries({ queryKey: ["user"] })]),
  });
}

export function useDeleteTask(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api(`/tasks/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSettled: () => Promise.all([qc.invalidateQueries({ queryKey: ["tasks"] }), qc.invalidateQueries({ queryKey: ["user"] })]),
  });
}

/** Sets the task you are working on (null: nothing). apps/web/src/components/WorkingOn.tsx */
export function useWorkingOn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string | null) => api("/tasks/current", { method: "PUT", body: JSON.stringify({ taskId }) }),
    onSettled: () => Promise.all([qc.invalidateQueries({ queryKey: ["tasks"] }), qc.invalidateQueries({ queryKey: ["user"] })]),
  });
}

/** POST /tasks: one task per assignee, as the web's QuickAddTask sends it. */
export function useCreateTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; assigneeIds: string[]; dueOn: string | null; priority: TaskPriority }) =>
      api<Task[]>("/tasks", { method: "POST", body: JSON.stringify(input) }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

/* ---------- Due dates (apps/web/src/lib/dates.ts) ---------- */

/** "YYYY-MM-DD" of a local date, as the API stores due dates. */
export const toDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Local midnight of a "YYYY-MM-DD" day (not UTC, which would shift it a day back west of Greenwich). */
export const fromDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
};

const dueThisYear = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
const dueOtherYear = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });

/** "Sep 12", or "Sep 12, 2027" outside the current year. */
export function formatDueDate(day: string) {
  const date = fromDay(day);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return (sameYear ? dueThisYear : dueOtherYear).format(date);
}

/** Due before today. */
export const isOverdue = (day: string | null) => !!day && day < toDay(new Date());

/* ---------- Quick add: "@handle" assigns (apps/web/src/components/QuickAddTask.tsx) ---------- */

export type Candidate = { id: string; name: string; image: string | null; username: string };

/** "@handle" as typed: letters, digits, "." and "_" (a final "." ends the sentence). */
const TAG = /(^|\s)@([\w.]+)/g;
const handleOf = (raw: string) => raw.replace(/\.+$/, "").toLowerCase();

/** People tagged in the text, and the title without their tags. */
export function parseTags(text: string, people: Candidate[]) {
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
export function splitTags(text: string, people: Candidate[]) {
  const parts: { text: string; tag: boolean }[] = [];
  let last = 0;
  for (const m of matchAll(text, TAG)) {
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
export function tagAtCaret(text: string, caret: number) {
  const m = text.slice(0, caret).match(/(^|\s)@([\w.]{0,30})$/);
  return m ? { start: caret - m[2]!.length - 1, query: m[2]!.toLowerCase() } : null;
}

/** Handle matches first, then someone whose name has a word starting with it. */
export function suggestPeople(people: Candidate[], query: string) {
  return [
    ...people.filter((p) => p.username.startsWith(query)).sort((a, b) => a.username.length - b.username.length),
    ...people.filter(
      (p) =>
        !p.username.startsWith(query) &&
        p.name
          .toLowerCase()
          .split(/\s+/)
          .some((w) => w.startsWith(query)),
    ),
  ].slice(0, 6);
}
