import { describe, expect, test } from "bun:test";
import { byCodePriority, codeSessionState, groupCodeSessions, type CodeGit, type CodePriority, type CodeSessionStatus } from "@agora/core";

const git = (pr: "open" | "closed" | "merged" | null): CodeGit => ({
  repo: "acme/app",
  branch: "fix/x",
  base: "main",
  changes: 0,
  ahead: 0,
  behind: 0,
  pushed: true,
  lastCommit: null,
  pr: pr && { number: 1, url: "", title: "", state: pr, draft: false, base: "main" },
  github: true,
});

const session = (id: string, status: CodeSessionStatus, priority: CodePriority, o: { pr?: "open" | "closed" | "merged" | null; repo?: string | null; at?: string } = {}) => ({
  id,
  status,
  priority,
  question: null,
  git: o.pr === undefined ? null : git(o.pr),
  repo: o.repo === undefined ? "acme/app" : o.repo,
  updatedAt: o.at ?? "2026-10-27T10:00:00Z",
  createdAt: "2026-10-27T09:00:00Z",
});

describe("codeSessionState", () => {
  test("an idle session is done once its pull request is open, merged once it is merged", () => {
    expect(codeSessionState(session("a", "idle", "none"))).toBe("idle");
    expect(codeSessionState(session("a", "idle", "none", { pr: "open" }))).toBe("finished");
    expect(codeSessionState(session("a", "done", "none", { pr: "merged" }))).toBe("merged");
  });

  test("a question to its bot is waiting for you, even while it runs", () => {
    expect(codeSessionState({ ...session("a", "running", "none"), question: { bot: "Dev", text: "?", askedAt: "" } })).toBe("waiting");
  });
});

describe("groupCodeSessions", () => {
  const list = [
    session("low", "idle", "low", { at: "2026-10-27T12:00:00Z" }),
    session("urgent", "waiting", "urgent"),
    session("high", "running", "high", { repo: "acme/api" }),
    session("merged", "done", "medium", { pr: "merged" }),
    session("stopped", "stopped", "none"),
  ];

  test("by state: what needs you first; over ones only in their view; stopped only on demand", () => {
    const active = groupCodeSessions(list, { group: "state", order: "priority", view: "active", showStopped: false });
    expect(active.map((g) => g.key)).toEqual(["waiting", "running", "idle"]);
    const all = groupCodeSessions(list, { group: "state", order: "priority", view: "all", showStopped: true });
    expect(all.map((g) => g.key)).toEqual(["waiting", "running", "idle", "merged", "stopped"]);
  });

  test("by priority: Urgent to None, empty groups left out", () => {
    const groups = groupCodeSessions(list, { group: "priority", order: "updated", view: "all", showStopped: true });
    expect(groups.map((g) => g.key)).toEqual(["urgent", "high", "medium", "low", "none"]);
  });

  test("by project: repositories by name, sessions without one last", () => {
    const groups = groupCodeSessions([...list, session("bare", "idle", "none", { repo: null })], { group: "project", order: "priority", view: "all", showStopped: true });
    expect(groups.map((g) => g.key)).toEqual(["acme/api", "acme/app", ""]);
  });

  test("ordered by priority, then by the last activity", () => {
    const one = groupCodeSessions([session("b", "idle", "high"), session("c", "idle", "high", { at: "2026-10-27T11:00:00Z" }), session("a", "idle", "urgent")], {
      group: "state",
      order: "priority",
      view: "all",
      showStopped: false,
    });
    expect(one[0]!.sessions.map((s) => s.id)).toEqual(["a", "c", "b"]);
  });
});

test("byCodePriority keeps the opening order within a priority", () => {
  expect(byCodePriority([session("x", "idle", "low"), session("y", "idle", "high"), session("z", "idle", "low")]).map((s) => s.id)).toEqual(["y", "x", "z"]);
});
