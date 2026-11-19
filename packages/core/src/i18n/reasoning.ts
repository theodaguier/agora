import { defineMessages } from "./define";

/** Effort levels the engines name (Claude Code, Codex, Hermes), lowest first. */
const LEVELS = ["minimal", "low", "medium", "high", "xhigh", "max", "ultra"] as const;

/** Rank of an effort level, to list a model's levels lowest first (unknown ones last). */
export const effortRank = (effort: string) => {
  const i = LEVELS.indexOf(effort as (typeof LEVELS)[number]);
  return i < 0 ? LEVELS.length : i;
};

/**
 * How hard a model thinks and its fast mode, chosen next to the model in a conversation or a code
 * session, on the web and on mobile.
 */
export const reasoning = defineMessages({
  en: {
    label: "Effort",
    effort: "Thinking effort",
    byDefault: "Default",
    byDefaultHelp: "The model's own",
    levels: { minimal: "Minimal", low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Max", ultra: "Ultra" } as Record<string, string>,
    /** The composer's chip: the level chosen, and the fast mode when it is on. */
    chip: (level: string | null, fast: boolean) => [level ? `Effort ${level.toLowerCase()}` : "Effort", fast && "fast"].filter(Boolean).join(", "),
    fast: "Fast mode",
    fastHelp: "Answers faster, uses more of the plan",
    changed: "Effort changed.",
  },
  fr: {
    label: "Effort",
    effort: "Effort de réflexion",
    byDefault: "Par défaut",
    byDefaultHelp: "Celui du modèle",
    levels: { minimal: "Minimal", low: "Faible", medium: "Moyen", high: "Élevé", xhigh: "Très élevé", max: "Maximum", ultra: "Ultra" } as Record<string, string>,
    chip: (level: string | null, fast: boolean) => [level ? `Effort ${level.toLowerCase()}` : "Effort", fast && "rapide"].filter(Boolean).join(", "),
    fast: "Mode rapide",
    fastHelp: "Répond plus vite, consomme davantage",
    changed: "Effort modifié.",
  },
});
