import type { CodeCheck, CodeMergeMethod, CodePullRequest } from "../code-sessions";
import { defineMessages } from "./define";

type Review = NonNullable<CodePullRequest["review"]>;

/** A pull request on GitHub (its state, its CI, its review, its merge), as the web and mobile apps show it. */
export const pullRequests = defineMessages({
  en: {
    state: { open: "Open", draft: "Draft", merged: "Merged", closed: "Closed" },
    number: (n: number) => `#${n}`,
    openOnGithub: "Open on GitHub",
    checks: {
      failure: (n: number) => (n === 1 ? "1 check failing" : `${n} checks failing`),
      pending: (n: number) => (n === 1 ? "1 check running" : `${n} checks running`),
      success: (n: number) => (n === 1 ? "1 check passed" : `${n} checks passed`),
    },
    checkState: { success: "Passed", failure: "Failed", pending: "Running", skipped: "Skipped" } as Record<CodeCheck["state"], string>,
    showChecks: "Show the checks",
    hideChecks: "Hide the checks",
    review: { approved: "Approved", changes_requested: "Changes requested", review_required: "Review required" } as Record<Exclude<Review, "none">, string>,
    files: (n: number) => (n === 1 ? "1 file" : `${n} files`),
    merge: "Merge",
    method: "Merge method",
    methods: { squash: "Squash and merge", merge: "Merge commit", rebase: "Rebase and merge" } as Record<CodeMergeMethod, string>,
    methodHelp: {
      squash: "Its commits become one on the target branch.",
      merge: "Its commits are kept, joined by a merge commit.",
      rebase: "Its commits are replayed one by one on the target branch.",
    } as Record<CodeMergeMethod, string>,
    mergeTitle: (n: number, base: string) => `Merge PR #${n} into ${base}?`,
    failingWarning: "Some checks are failing. Merge anyway?",
    pendingWarning: "Some checks are still running. Merge anyway?",
    changesWarning: "Changes were requested in a review.",
    unpushed: "Some commits aren't on GitHub yet: push them first.",
    blocked: {
      draft: "It's a draft: mark it ready for review on GitHub to merge it.",
      dirty: "It has conflicts with its target branch: resolve them first.",
      blocked: "GitHub's branch rules block it (review or required checks).",
      behind: "Its branch is behind its target: update it first.",
      computing: "GitHub is still checking whether it can be merged.",
      other: "GitHub refuses to merge it for now.",
    },
  },
  fr: {
    state: { open: "Ouverte", draft: "Brouillon", merged: "Mergée", closed: "Fermée" },
    number: (n: number) => `#${n}`,
    openOnGithub: "Ouvrir sur GitHub",
    checks: {
      failure: (n: number) => (n === 1 ? "1 check en échec" : `${n} checks en échec`),
      pending: (n: number) => (n === 1 ? "1 check en cours" : `${n} checks en cours`),
      success: (n: number) => (n === 1 ? "1 check réussi" : `${n} checks réussis`),
    },
    checkState: { success: "Réussi", failure: "En échec", pending: "En cours", skipped: "Ignoré" },
    showChecks: "Voir les checks",
    hideChecks: "Masquer les checks",
    review: { approved: "Approuvée", changes_requested: "Modifications demandées", review_required: "Review attendue" },
    files: (n: number) => (n === 1 ? "1 fichier" : `${n} fichiers`),
    merge: "Merger",
    method: "Méthode de merge",
    methods: { squash: "Squash et merge", merge: "Commit de merge", rebase: "Rebase et merge" },
    methodHelp: {
      squash: "Ses commits n'en font plus qu'un sur la branche cible.",
      merge: "Ses commits sont gardés, réunis par un commit de merge.",
      rebase: "Ses commits sont rejoués un à un sur la branche cible.",
    },
    mergeTitle: (n: number, base: string) => `Merger la PR #${n} dans ${base} ?`,
    failingWarning: "Des checks sont en échec. Merger quand même ?",
    pendingWarning: "Des checks sont encore en cours. Merger quand même ?",
    changesWarning: "Des modifications ont été demandées en review.",
    unpushed: "Des commits ne sont pas encore sur GitHub : pousse-les d'abord.",
    blocked: {
      draft: "C'est un brouillon : marque-la prête pour la review sur GitHub pour la merger.",
      dirty: "Elle a des conflits avec sa branche cible : résous-les d'abord.",
      blocked: "Les règles de branche de GitHub la bloquent (review ou checks requis).",
      behind: "Sa branche est en retard sur sa cible : mets-la à jour d'abord.",
      computing: "GitHub vérifie encore si elle peut être mergée.",
      other: "GitHub refuse de la merger pour le moment.",
    },
  },
});
