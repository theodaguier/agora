import { useSyncExternalStore } from "react";
import { codeSessionState, type CodeSession, type CodeSessionState } from "@agora/core";

/**
 * When each code session was last read in front (its updatedAt then): its tab shows a dot once it has
 * something new to read (an answer to give, a result, a failure). Kept in this browser.
 */
const KEY = "agora.code-seen";
const KEEP = 200;

const load = (): Record<string, string> => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    // Unreadable or blocked storage: nothing read yet.
    return {};
  }
};

let seen = load();
const listeners = new Set<() => void>();

export function markCodeSessionSeen(s: Pick<CodeSession, "id" | "updatedAt">) {
  if (seen[s.id] && seen[s.id]! >= s.updatedAt) return;
  seen = Object.fromEntries(
    Object.entries({ ...seen, [s.id]: s.updatedAt })
      .sort((a, b) => b[1].localeCompare(a[1]))
      .slice(0, KEEP),
  );
  try {
    localStorage.setItem(KEY, JSON.stringify(seen));
  } catch {
    // Blocked storage: read for this page only.
  }
  listeners.forEach((l) => l());
}

/** What is worth a dot: it waits for you, it is done, merged, or it failed. */
const TO_READ = new Set<CodeSessionState>(["waiting", "finished", "merged", "failed"]);

export function useCodeSessionUnread(session: CodeSession | undefined, active: boolean) {
  const map = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => seen,
  );
  if (!session || active || !TO_READ.has(codeSessionState(session))) return false;
  const last = map[session.id];
  return !last || session.updatedAt > last;
}
