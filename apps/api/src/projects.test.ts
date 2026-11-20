import { describe, expect, test } from "bun:test";
import { parseReply } from "./onboarding";

describe("project blocks", () => {
  test("a discussion's name is read and taken out of the reply", () => {
    const r = parseReply('Je regarde le contraste.\n\n```discussion-title\n{"title": "Contraste du mode sombre"}\n```');
    expect(r.text).toBe("Je regarde le contraste.");
    expect(r.discussionTitle).toEqual({ title: "Contraste du mode sombre" });
  });

  test("a new context is read with its summary", () => {
    const r = parseReply('Noté.\n\n```project-context\n{"context": "## Règles\\n- AA partout", "summary": "contraste AA"}\n```');
    expect(r.text).toBe("Noté.");
    expect(r.projectContext).toEqual({ context: "## Règles\n- AA partout", summary: "contraste AA" });
  });

  test("an empty name stays in the text", () => {
    const r = parseReply('Ok.\n\n```discussion-title\n{"title": ""}\n```');
    expect(r.discussionTitle).toBeUndefined();
    expect(r.text).toContain("discussion-title");
  });
});
