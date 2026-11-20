import type { ProjectStatus } from "@agora/core";
import { defineMessages, useT } from "@/i18n";
import { cn } from "@/lib/utils";

export const projectStatusMessages = defineMessages({
  en: { planned: "Planned", in_progress: "In progress", paused: "Paused", done: "Done", cancelled: "Cancelled" } satisfies Record<ProjectStatus, string>,
  fr: { planned: "Prévu", in_progress: "En cours", paused: "En pause", done: "Terminé", cancelled: "Annulé" },
});

export const useProjectStatusLabel = () => useT(projectStatusMessages);

const TONE: Record<ProjectStatus, string> = {
  planned: "text-state-neutral",
  in_progress: "text-state-running",
  paused: "text-warning",
  done: "text-state-finished",
  cancelled: "text-state-neutral",
};

/**
 * A project's status as Linear draws it, in the session marks' colours (CodeSessionMarks): a dashed ring
 * planned, a half-filled ring under way, a paused ring, a filled check done, a crossed disc cancelled.
 * The colour is set on the mark itself, so a highlighted menu row doesn't whiten it.
 */
export function ProjectStatusIcon({ status, className }: { status: ProjectStatus; className?: string }) {
  const tone = TONE[status];
  const svg = cn("size-4 shrink-0", tone, className);
  const style = { color: `var(--${tone.replace(/^text-/, "")})` };
  switch (status) {
    case "planned":
      return (
        <svg viewBox="0 0 16 16" className={svg} style={style} aria-hidden>
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.2 2.2" />
        </svg>
      );
    case "in_progress":
      return (
        <svg viewBox="0 0 16 16" className={svg} style={style} aria-hidden>
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 4.5a3.5 3.5 0 0 1 0 7z" fill="currentColor" />
        </svg>
      );
    case "paused":
      return (
        <svg viewBox="0 0 16 16" className={svg} style={style} aria-hidden>
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M6.5 5.5v5M9.5 5.5v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "done":
      return (
        <svg viewBox="0 0 16 16" className={svg} style={style} aria-hidden>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="M5 8.2 7.1 10.2 11 6" fill="none" stroke="var(--background)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "cancelled":
      return (
        <svg viewBox="0 0 16 16" className={svg} style={style} aria-hidden>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4" stroke="var(--background)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
  }
}
