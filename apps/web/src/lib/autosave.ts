import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

/**
 * Saves on its own, as Notion and Docs do: `schedule()` on each change, the save runs once
 * typing pauses. One save at a time; a change during a save queues another. `flush()` saves
 * what's pending now (before closing) and resolves false if that failed.
 */
export function useAutosave(save: () => Promise<void>, delay = 800) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const saveRef = useRef(save);
  saveRef.current = save;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dirty = useRef(false);
  const running = useRef<Promise<boolean> | null>(null);

  const run = useCallback(async (): Promise<boolean> => {
    if (running.current) {
      await running.current;
      return dirty.current ? run() : true;
    }
    dirty.current = false;
    setStatus("saving");
    running.current = saveRef
      .current()
      .then(() => true)
      .catch(() => false);
    const ok = await running.current;
    running.current = null;
    if (!ok) {
      dirty.current = true;
      setStatus("error");
      return false;
    }
    if (dirty.current) return run();
    setStatus("saved");
    return true;
  }, []);

  const schedule = useCallback(() => {
    dirty.current = true;
    setStatus("pending");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void run(), delay);
  }, [delay, run]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (dirty.current) return run();
    return running.current ? running.current : true;
  }, [run]);

  // Leaving the page with a change not yet written: the browser asks first.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current || running.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      clearTimeout(timer.current);
      if (dirty.current) void saveRef.current().catch(() => {});
    };
  }, []);

  return { status, schedule, flush, retry: run };
}
