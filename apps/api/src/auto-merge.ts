import type { CodePullRequest } from "@agora/core";

/**
 * When a pull request may merge without a person: a webhook started the session (an alert), its
 * admin allowed it, and nothing here asks for a human eye. The rule is deliberately narrow: what it
 * refuses goes to the usual card (github-merge.ts), with the reason, never to a silent failure.
 */

/** Paths a person reviews: data, secrets, deployment, CI, dependencies. */
const SENSITIVE: [RegExp, string][] = [
  [/(^|\/)(migrations?|prisma)\//i, "migrations"],
  [/\.sql$/i, "SQL"],
  [/(^|\/)\.env/i, "variables d'environnement"],
  [/(^|\/)\.github\//, "CI GitHub"],
  [/(^|\/)(Dockerfile|docker-compose)[^/]*$/i, "Docker"],
  [/(^|\/)(infra|deploy|deployment|k8s|terraform)\//i, "infrastructure"],
  [/(^|\/)(nixpacks\.toml|Procfile|fly\.toml|vercel\.json|coolify[^/]*)$/i, "déploiement"],
  [/(^|\/)(package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?)$/, "dépendances"],
  [/ftp/i, "FTP"],
];

/** GitHub lists at most this many files per page: a larger pull request is read by a person. */
export const AUTO_MERGE_MAX_FILES = 100;

/** Why this pull request can't merge alone (null: it can). `files`: its paths, null when unread. */
export function autoMergeBlocker(pr: CodePullRequest, files: string[] | null): string | null {
  if (pr.state !== "open") return "la PR n'est pas ouverte";
  if (pr.draft) return "la PR est un brouillon";
  if (pr.review === "changes_requested") return "une review demande des changements";
  if (pr.mergeable == null) return "GitHub calcule encore si elle est mergeable";
  if (!pr.mergeable) return `GitHub ne la dit pas mergeable (${pr.mergeableState ?? "conflits ou règles"})`;
  const checks = pr.checks;
  if (!checks || checks.state === "none") return "aucune CI ne la vérifie";
  if (checks.state === "pending") return "la CI tourne encore";
  if (checks.state !== "success") return "la CI échoue";
  if (!files) return "ses fichiers n'ont pas pu être lus";
  if (!files.length) return "elle ne change aucun fichier";
  if (files.length >= AUTO_MERGE_MAX_FILES) return "elle touche trop de fichiers";
  const touched = [...new Set(files.flatMap((f) => SENSITIVE.filter(([re]) => re.test(f)).map(([, area]) => area)))];
  return touched.length ? `elle touche une zone sensible (${touched.join(", ")})` : null;
}
