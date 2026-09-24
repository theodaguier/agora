import { describe, expect, test } from "bun:test";
import { DEFAULT_DIGEST_CONFIG, periodFor } from "./digest";

describe("periodFor", () => {
  test("the weekly day covers the previous week", () => {
    expect(periodFor("2026-09-21")).toEqual({ kind: "weekly", start: "2026-09-14", end: "2026-09-20" });
  });
  test("other days cover the previous day", () => {
    expect(periodFor("2026-09-23")).toEqual({ kind: "daily", start: "2026-09-22", end: "2026-09-22" });
    expect(periodFor("2026-03-01")).toEqual({ kind: "daily", start: "2026-02-28", end: "2026-02-28" });
  });
  test("weekdays only: Monday covers the weekend and Friday", () => {
    const config = { days: [1, 2, 3, 4, 5], weeklyDay: null };
    expect(periodFor("2026-09-21", config)).toEqual({ kind: "daily", start: "2026-09-18", end: "2026-09-20" });
    expect(periodFor("2026-09-22", config)).toEqual({ kind: "daily", start: "2026-09-21", end: "2026-09-21" });
  });
  test("a single day covers the whole week since the last one", () => {
    expect(periodFor("2026-09-25", { days: [5], weeklyDay: null })).toEqual({ kind: "daily", start: "2026-09-18", end: "2026-09-24" });
    expect(periodFor("2026-09-25", { ...DEFAULT_DIGEST_CONFIG, weeklyDay: 5 })).toEqual({ kind: "weekly", start: "2026-09-18", end: "2026-09-24" });
  });
});
