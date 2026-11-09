import { describe, expect, test } from "bun:test";
import type { CodePullRequest } from "@agora/core";
import { AUTO_MERGE_MAX_FILES, autoMergeBlocker } from "./auto-merge";

const green: CodePullRequest = {
  number: 7,
  url: "https://github.com/acme/web/pull/7",
  title: "fix: slow search",
  state: "open",
  draft: false,
  base: "main",
  head: "abc",
  mergeable: true,
  mergeableState: "clean",
  review: "none",
  checks: { state: "success", passed: 3, failed: 0, pending: 0, checks: [] },
};
const pr = (over: Partial<CodePullRequest>) => ({ ...green, ...over });

describe("autoMergeBlocker", () => {
  test("a green pull request on application code merges alone", () => {
    expect(autoMergeBlocker(green, ["apps/api/src/search.ts", "apps/api/src/search.test.ts"])).toBeNull();
  });

  test("CI must have run and passed", () => {
    expect(autoMergeBlocker(pr({ checks: undefined }), ["a.ts"])).toContain("aucune CI");
    expect(autoMergeBlocker(pr({ checks: { state: "none", passed: 0, failed: 0, pending: 0, checks: [] } }), ["a.ts"])).toContain("aucune CI");
    expect(autoMergeBlocker(pr({ checks: { state: "pending", passed: 1, failed: 0, pending: 1, checks: [] } }), ["a.ts"])).toContain("tourne encore");
    expect(autoMergeBlocker(pr({ checks: { state: "failure", passed: 1, failed: 1, pending: 0, checks: [] } }), ["a.ts"])).toContain("échoue");
  });

  test("GitHub must call it mergeable, and nobody asked for changes", () => {
    expect(autoMergeBlocker(pr({ mergeable: false, mergeableState: "dirty" }), ["a.ts"])).toContain("dirty");
    expect(autoMergeBlocker(pr({ mergeable: null }), ["a.ts"])).toContain("calcule encore");
    expect(autoMergeBlocker(pr({ draft: true }), ["a.ts"])).toContain("brouillon");
    expect(autoMergeBlocker(pr({ state: "merged" }), ["a.ts"])).toContain("pas ouverte");
    expect(autoMergeBlocker(pr({ review: "changes_requested" }), ["a.ts"])).toContain("review");
  });

  test.each([
    ["prisma/schema.prisma", "migrations"],
    ["apps/api/drizzle/migrations/0045.sql", "migrations"],
    ["db/seed.sql", "SQL"],
    [".env.example", "variables d'environnement"],
    ["apps/web/.env.production", "variables d'environnement"],
    [".github/workflows/ci.yml", "CI GitHub"],
    ["Dockerfile", "Docker"],
    ["infra/docker-compose.prod.yml", "Docker"],
    ["deploy/coolify.json", "infrastructure"],
    ["package.json", "dépendances"],
    ["apps/api/pnpm-lock.yaml", "pnpm-lock"],
    ["src/services/ftp-upload.ts", "FTP"],
  ])("%s needs a person", (file, _area) => {
    expect(autoMergeBlocker(green, ["src/ok.ts", file])).toContain("zone sensible");
  });

  test("names every sensitive area once", () => {
    expect(autoMergeBlocker(green, [".env", ".env.local", "prisma/schema.prisma"])).toBe("elle touche une zone sensible (variables d'environnement, migrations)");
  });

  test("its files must be read, and there must be few enough to trust the list", () => {
    expect(autoMergeBlocker(green, null)).toContain("pas pu être lus");
    expect(autoMergeBlocker(green, [])).toContain("aucun fichier");
    expect(autoMergeBlocker(green, Array.from({ length: AUTO_MERGE_MAX_FILES }, (_, i) => `src/f${i}.ts`))).toContain("trop de fichiers");
  });
});
