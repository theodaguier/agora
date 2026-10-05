import { describe, expect, test } from "bun:test";

describe("bot-create block", async () => {
  const { parseReply } = await import("./onboarding");
  const bot = (name: string) => ({ name, role: `Rôle ${name}`, mission: "Tester l'app", instructions: "Tu testes chaque parcours." });

  test("is taken out of the reply", () => {
    const body = JSON.stringify({ reason: "tester l'app par rôle", bots: [bot("Client"), bot("Studio"), bot("Retoucheur")] });
    const r = parseReply(`Je crée les trois rôles.\n\n\`\`\`bot-create\n${body}\n\`\`\``);
    expect(r.text).toBe("Je crée les trois rôles.");
    expect(r.botCreate?.reason).toBe("tester l'app par rôle");
    expect(r.botCreate?.bots.map((b) => b.name)).toEqual(["Client", "Studio", "Retoucheur"]);
  });

  test("an invalid request stays in the text", () => {
    const block = (json: unknown) => parseReply(`\`\`\`bot-create\n${JSON.stringify(json)}\n\`\`\``);
    expect(block({ bots: [] }).botCreate).toBeUndefined();
    expect(block({ bots: [{ role: "sans nom" }] }).botCreate).toBeUndefined();
    expect(block({ bots: Array.from({ length: 7 }, (_, i) => bot(`Bot ${i}`)) }).text).toContain("bot-create");
  });
});
