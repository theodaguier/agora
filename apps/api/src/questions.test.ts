import { describe, expect, test } from "bun:test";
import { parseReply } from "./onboarding";

const block = (json: unknown) => `Prochaines étapes possibles.\n\n\`\`\`questions\n${JSON.stringify(json)}\n\`\`\``;

describe("questions block", () => {
  test("a long option label is clipped, not rejected", () => {
    const long = "Inventaire complet des apps Coolify (statut, déploys récents, healthchecks) pour avoir une base de référence";
    const r = parseReply(block({ title: "Priorités prod", questions: [{ label: "Par quoi je commence ?", type: "single", options: [{ label: long }, { label: "Sauvegardes" }] }] }));
    expect(r.text).toBe("Prochaines étapes possibles.");
    const label = r.questions!.questions[0]!.options[0]!.label;
    expect(label.length).toBe(80);
    expect(label.endsWith("…")).toBe(true);
  });

  test("string options, aliases and extra questions are accepted", () => {
    const questions = Array.from({ length: 10 }, (_, i) => ({ question: `Q${i}`, multiSelect: true, options: ["a", "b"] }));
    const r = parseReply(block({ questions }));
    expect(r.questions!.questions).toHaveLength(8);
    expect(r.questions!.questions[0]).toMatchObject({ label: "Q0", type: "multi", options: [{ label: "a" }, { label: "b" }] });
  });

  test("a choice with a single option becomes free text", () => {
    const r = parseReply(block({ questions: [{ label: "Précise", options: [{ label: "seule" }] }] }));
    expect(r.questions!.questions[0]).toMatchObject({ type: "text", options: [] });
  });

  test("an unusable block stays in the text", () => {
    const raw = block({ questions: [] });
    expect(parseReply(raw).questions).toBeUndefined();
    expect(parseReply(raw).text).toContain("```questions");
  });
});
