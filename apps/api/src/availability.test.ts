import { availability, DEFAULT_HOURS, validHours, type Schedule } from "@agora/core";
import { describe, expect, test } from "bun:test";
import { availabilityNote } from "./availability";

const base: Schedule = { timezone: "Europe/Paris", hours: DEFAULT_HOURS, dndUntil: null, absences: [] };
const at = (iso: string) => Date.parse(iso);

describe("availability", () => {
  test("within working hours", () => {
    expect(availability(base, at("2026-09-23T10:00:00+02:00"))).toEqual({ state: "available" });
  });
  test("evening: back the next morning, in the employee's time zone", () => {
    expect(availability(base, at("2026-09-23T19:00:00+02:00"))).toEqual({ state: "off_hours", back: "2026-09-24T07:00:00.000Z" });
    const ny = { ...base, timezone: "America/New_York" };
    expect(availability(ny, at("2026-09-23T10:00:00+02:00"))).toEqual({ state: "off_hours", back: "2026-09-23T13:00:00.000Z" });
  });
  test("weekend: back on Monday", () => {
    expect(availability(base, at("2026-09-26T10:00:00+02:00"))).toEqual({ state: "off_hours", back: "2026-09-28T07:00:00.000Z" });
  });
  test("back-to-back absences read as one", () => {
    const s: Schedule = {
      ...base,
      absences: [
        { id: "a", kind: "vacation", startOn: "2026-09-23", endOn: "2026-09-25" },
        { id: "b", kind: "sick", startOn: "2026-09-26", endOn: "2026-09-29" },
      ],
    };
    expect(availability(s, at("2026-09-23T10:00:00+02:00"))).toEqual({ state: "absent", kind: "vacation", lastDay: "2026-09-29", back: "2026-09-30T07:00:00.000Z" });
  });
  test("an absence wins over do not disturb, which wins over hours", () => {
    const dnd = { ...base, dndUntil: "2026-09-23T12:00:00.000Z" };
    expect(availability(dnd, at("2026-09-23T10:00:00+02:00"))).toEqual({ state: "dnd", until: "2026-09-23T12:00:00.000Z" });
    expect(availability(dnd, at("2026-09-23T15:00:00+02:00"))).toEqual({ state: "available" });
  });
  test("no hours set: always reachable", () => {
    expect(availability({ ...base, hours: null }, at("2026-09-27T03:00:00+02:00"))).toEqual({ state: "available" });
  });
});

describe("validHours", () => {
  const week = (monday: { start: string; end: string }[]) => [monday, [], [], [], [], [], []];
  test("sorts ranges", () => {
    expect(validHours(week([{ start: "14:00", end: "18:00" }, { start: "09:00", end: "12:00" }]))?.[0]).toEqual([
      { start: "09:00", end: "12:00" },
      { start: "14:00", end: "18:00" },
    ]);
  });
  test("rejects inverted, overlapping or malformed ranges", () => {
    expect(validHours(week([{ start: "09:00", end: "08:00" }]))).toBeNull();
    expect(validHours(week([{ start: "09:00", end: "13:00" }, { start: "12:00", end: "18:00" }]))).toBeNull();
    expect(validHours(week([{ start: "9h", end: "18:00" }]))).toBeNull();
    expect(validHours([[]])).toBeNull();
  });
});

describe("availabilityNote", () => {
  test("phrases the status for the agents", () => {
    const s: Schedule = { ...base, absences: [{ id: "a", kind: "vacation", startOn: "2026-09-23", endOn: "2026-10-02" }] };
    expect(availabilityNote(s, at("2026-09-23T10:00:00+02:00"))).toBe("en congé jusqu'au vendredi 2 octobre inclus, de retour le lundi 5 octobre à 09:00");
    expect(availabilityNote({ ...base, dndUntil: "2026-09-23T12:30:00.000Z" }, at("2026-09-23T10:00:00+02:00"))).toBe("en mode ne pas déranger jusqu'à 14:30");
    expect(availabilityNote(base, at("2026-09-23T10:00:00+02:00"))).toBeNull();
  });
});

describe("availability block", async () => {
  const { parseReply } = await import("./onboarding");
  test("is taken out of the reply, with a partial week", () => {
    const r = parseReply('Noté.\n\n```availability\n{"dnd": {"minutes": 90}, "hours": {"mon": ["09:00-12:30"], "fri": ["09:00-16:00"]}}\n```');
    expect(r.text).toBe("Noté.");
    expect(r.availability).toEqual([{ dnd: { minutes: 90 }, hours: { mon: ["09:00-12:30"], fri: ["09:00-16:00"] } }]);
  });
  test("a list for several people; an empty change stays in the text", () => {
    expect(parseReply('```availability\n[{"user": "@lea", "dnd": null}, {"addAbsences": [{"kind": "sick", "start": "2026-10-01", "end": "2026-10-02"}]}]\n```').availability).toHaveLength(2);
    expect(parseReply('```availability\n{}\n```').availability).toBeUndefined();
  });
});
