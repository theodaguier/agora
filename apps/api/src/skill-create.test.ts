import { describe, expect, test } from "bun:test";

describe("skill-create block", async () => {
  const { parseReply } = await import("./onboarding");
  const block = [
    "```skill-create",
    "---",
    "name: relance-factures",
    "description: Relancer les factures impayées de plus de 30 jours",
    "category: finance",
    "reason: tu me le demandes chaque lundi",
    "---",
    "# Relance des factures",
    "1. Liste les factures impayées.",
    "~~~",
    "exemple",
    "~~~",
    "```",
  ].join("\n");

  test("is taken out of the reply; reason and category stay out of the SKILL.md", () => {
    const r = parseReply(`Je te propose d'en faire un skill.\n\n${block}`);
    expect(r.text).toBe("Je te propose d'en faire un skill.");
    expect(r.skillCreate).toMatchObject({ name: "relance-factures", category: "finance", reason: "tu me le demandes chaque lundi" });
    expect(r.skillCreate!.content).toBe(
      "---\nname: relance-factures\ndescription: Relancer les factures impayées de plus de 30 jours\n---\n\n# Relance des factures\n1. Liste les factures impayées.\n~~~\nexemple\n~~~\n",
    );
  });

  test("an invalid skill stays in the text", () => {
    const bad = (front: string, body = "Instructions") => parseReply(`\`\`\`skill-create\n---\n${front}\n---\n${body}\n\`\`\``);
    expect(bad("name: Relance Factures\ndescription: x").skillCreate).toBeUndefined();
    expect(bad("name: relance\n").skillCreate).toBeUndefined();
    expect(bad("name: relance\ndescription: x", "").skillCreate).toBeUndefined();
    expect(bad("name: relance\ndescription: x\ncategory: Mes Trucs").text).toContain("skill-create");
    expect(parseReply("```skill-create\nname: relance\n```").skillCreate).toBeUndefined();
  });
});
