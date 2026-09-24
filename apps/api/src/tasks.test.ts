import { describe, expect, test } from "bun:test";
import { parseReply } from "./onboarding";
import { withHandles } from "@agora/core";
import { resolveAssignee } from "./tasks";

const members = withHandles([
  { id: "u1", name: "Théo Daguier", username: "theo", title: "Développeur" },
  { id: "u2", name: "Marie Curie", username: null, title: "" },
  { id: "u3", name: "Marie Dupont", username: null, title: "" },
  { id: "u4", name: "Test", username: null, title: "" },
  { id: "u5", name: "test test", username: "test", title: "" },
]);

describe("resolveAssignee", () => {
  test("by @username, username, full name or id", () => {
    expect(resolveAssignee("@theo", members)?.id).toBe("u1");
    expect(resolveAssignee("Theo", members)?.id).toBe("u1");
    expect(resolveAssignee("marie curie", members)?.id).toBe("u2");
    expect(resolveAssignee("u2", members)?.id).toBe("u2");
  });

  test("handles for people without a username", () => {
    expect(members.map((m) => m.handle)).toEqual(["theo", "marie.curie", "marie.dupont", "test2", "test"]);
    expect(resolveAssignee("@marie.curie", members)?.id).toBe("u2");
    expect(resolveAssignee("@test2.", members)?.id).toBe("u4");
    expect(resolveAssignee("@test", members)?.id).toBe("u5");
  });

  test("unknown person", () => {
    expect(resolveAssignee("@nobody", members)).toBeNull();
  });
});

describe("tasks block", () => {
  test("is taken out of the displayed text", () => {
    const reply = 'Je te l\'assigne.\n\n```tasks\n{"create": [{"title": "Relancer le client", "assignee": "@theo", "due": "2026-10-01"}]}\n```';
    const parsed = parseReply(reply);
    expect(parsed.text).toBe("Je te l'assigne.");
    expect(parsed.tasks?.create[0]).toMatchObject({ title: "Relancer le client", assignee: "@theo", due: "2026-10-01" });
    expect(parsed.tasks?.update).toEqual([]);
  });

  test("several participants", () => {
    const parsed = parseReply('```tasks\n{"create": [{"title": "Démo", "assignees": ["@lea", "@theo"]}]}\n```');
    expect(parsed.tasks?.create[0]?.assignees).toEqual(["@lea", "@theo"]);
  });

  test("status update only", () => {
    const parsed = parseReply('C\'est fait.\n```tasks\n{"update": [{"id": "abc", "status": "done"}]}\n```');
    expect(parsed.tasks?.update).toEqual([{ id: "abc", status: "done" }]);
  });

  test("priority on create and on update", () => {
    const parsed = parseReply('```tasks\n{"create": [{"title": "Démo", "assignee": "@lea", "priority": "urgent"}], "update": [{"id": "abc", "priority": "low"}]}\n```');
    expect(parsed.tasks?.create[0]?.priority).toBe("urgent");
    expect(parsed.tasks?.update).toEqual([{ id: "abc", priority: "low" }]);
  });

  test("an update needs a status or a priority", () => {
    expect(parseReply('```tasks\n{"update": [{"id": "abc"}]}\n```').tasks).toBeUndefined();
    expect(parseReply('```tasks\n{"update": [{"id": "abc", "priority": "asap"}]}\n```').tasks).toBeUndefined();
  });

  test("an invalid block stays visible", () => {
    const reply = '```tasks\n{"create": [{"title": "", "assignee": "@theo"}]}\n```';
    expect(parseReply(reply).tasks).toBeUndefined();
    expect(parseReply(reply).text).toContain("```tasks");
  });
});
