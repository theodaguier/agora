import type { Params } from "./coded";
import { loadState, saveState, type UpdateRun } from "./state";

/** Log of an in-progress update, persisted at every step. */
export async function startRun(target: UpdateRun["target"], from: string, to: string, trigger: UpdateRun["trigger"]) {
  const state = await loadState();
  const entry: UpdateRun = {
    id: crypto.randomUUID(),
    target,
    from,
    to,
    trigger,
    startedAt: new Date().toISOString(),
    status: "running",
    steps: [],
  };
  state.history.push(entry);
  await saveState();
  const step = async (code: string, message: string, ok?: boolean, params?: Params) => {
    entry.steps.push({ at: new Date().toISOString(), message, ok, code, ...(params ? { params } : {}) });
    console.log(`[${target} ${from}→${to}] ${message}`);
    await saveState();
  };
  const finish = async (status: UpdateRun["status"]) => {
    entry.status = status;
    entry.endedAt = new Date().toISOString();
    await saveState();
  };
  return { entry, step, finish };
}
