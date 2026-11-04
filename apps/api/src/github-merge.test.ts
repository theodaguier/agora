import { describe, expect, test } from "bun:test";
import { parsePullUrl, reduceReviews, summarizeChecks } from "./code-git";
import { canMergePulls, decisionError, MERGE_REQUEST_TTL_MS } from "./github-merge";

describe("checks of a pull request", () => {
  test("check runs and commit statuses sum up, failures first", () => {
    const c = summarizeChecks(
      [
        { name: "build", status: "completed", conclusion: "success", html_url: "https://x/1" },
        { name: "lint", status: "completed", conclusion: "failure", html_url: "https://x/2" },
        { name: "e2e", status: "in_progress", conclusion: null },
        { name: "deploy", status: "completed", conclusion: "skipped" },
        { name: "timeout", status: "completed", conclusion: "timed_out" },
      ],
      [
        { context: "vercel", state: "success", target_url: "https://v" },
        { context: "codecov", state: "pending" },
        { context: "legacy", state: "error" },
      ],
    );
    expect(c.state).toBe("failure");
    expect([c.passed, c.failed, c.pending]).toEqual([2, 3, 2]);
    expect(c.checks.map((x) => x.state)).toEqual(["failure", "failure", "failure", "pending", "pending", "success", "success", "skipped"]);
    expect(c.checks.find((x) => x.name === "vercel")?.url).toBe("https://v");
    expect(c.checks.find((x) => x.name === "e2e")?.url).toBeNull();
  });
  test("pending without failures, success when all passed, none without any check", () => {
    expect(summarizeChecks([{ name: "a", status: "queued", conclusion: null }], [{ context: "b", state: "success" }]).state).toBe("pending");
    expect(summarizeChecks([{ name: "a", status: "completed", conclusion: "success" }], []).state).toBe("success");
    expect(summarizeChecks([], [])).toEqual({ state: "none", passed: 0, failed: 0, pending: 0, checks: [] });
  });
  test("a rerun check shows once, its latest run (GitHub lists it first)", () => {
    const c = summarizeChecks(
      [
        { name: "build", status: "completed", conclusion: "success" },
        { name: "build", status: "completed", conclusion: "failure" },
      ],
      [],
    );
    expect(c.checks).toHaveLength(1);
    expect(c.state).toBe("success");
  });
});

describe("reviews of a pull request", () => {
  const r = (login: string, state: string) => ({ user: { login }, state });
  test("each reviewer's latest verdict counts, changes requested first", () => {
    expect(reduceReviews([r("a", "APPROVED")], 0)).toBe("approved");
    expect(reduceReviews([r("a", "APPROVED"), r("b", "CHANGES_REQUESTED")], 0)).toBe("changes_requested");
    expect(reduceReviews([r("a", "CHANGES_REQUESTED"), r("a", "APPROVED")], 0)).toBe("approved");
    expect(reduceReviews([r("a", "APPROVED"), r("a", "COMMENTED")], 0)).toBe("approved");
    expect(reduceReviews([r("a", "CHANGES_REQUESTED"), r("a", "DISMISSED")], 0)).toBe("none");
  });
  test("a review asked of someone, else none", () => {
    expect(reduceReviews([r("a", "COMMENTED")], 1)).toBe("review_required");
    expect(reduceReviews([], 0)).toBe("none");
    expect(reduceReviews([r("a", "APPROVED")], 2)).toBe("approved");
  });
  test("pull request links", () => {
    expect(parsePullUrl("https://github.com/acme/web.app/pull/41/files")).toEqual({ repo: "acme/web.app", number: 41 });
    expect(parsePullUrl("https://github.com/acme/web/issues/41")).toBeNull();
  });
});

describe("merge requests", () => {
  const now = Date.now();
  const row = (over: Partial<{ requestedBy: string | null; status: "pending" | "approved" | "denied" | "expired" | "failed"; createdAt: Date }> = {}) => ({
    requestedBy: "me",
    status: "pending" as const,
    createdAt: new Date(now - 1000),
    ...over,
  });
  test("only the person who started the bot's turn answers", () => {
    expect(decisionError(row(), "me", now)).toBeNull();
    expect(decisionError(row(), "colleague", now)?.status).toBe(403);
    expect(decisionError(row({ requestedBy: null }), "me", now)?.status).toBe(403);
  });
  test("a request expires after 10 minutes", () => {
    expect(MERGE_REQUEST_TTL_MS).toBe(10 * 60_000);
    expect(decisionError(row({ createdAt: new Date(now - MERGE_REQUEST_TTL_MS + 5000) }), "me", now)).toBeNull();
    const late = decisionError(row({ createdAt: new Date(now - MERGE_REQUEST_TTL_MS - 1000) }), "me", now);
    expect(late?.status).toBe(409);
    expect(decisionError(row({ status: "expired" }), "me", now)?.status).toBe(409);
  });
  test("an answered request can't be answered again", () => {
    for (const status of ["approved", "denied", "failed"] as const) expect(decisionError(row({ status }), "me", now)?.status).toBe(409);
  });
  test("admins may merge; a member without code sessions may not", () => {
    expect(canMergePulls({ role: "admin", email: "admin@example.invalid" })).toBe(true);
    expect(canMergePulls({ role: "user", email: "nobody@example.invalid" })).toBe(false);
    expect(canMergePulls(null)).toBe(false);
  });
});
