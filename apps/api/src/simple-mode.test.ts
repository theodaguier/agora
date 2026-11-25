import { historyBucket, isSimple, soulRole, soulTemplate } from "@agora/core";
import { describe, expect, test } from "bun:test";
import { isRelayKey, relayKey, relayParties } from "./person-relay";
import { runResponse } from "./routine-delivery";

describe("simple interface", () => {
  test("whoever has it set, admins included (they choose their own)", () => {
    const member = { role: "user", uiMode: "simple" };
    const admin = { role: "admin", uiMode: "simple" };
    expect(isSimple(member)).toBe(true);
    expect(isSimple(admin)).toBe(true);
    expect(isSimple({ uiMode: "full" })).toBe(false);
    expect(isSimple(null)).toBe(false);
  });
  test("the history by day, in local time", () => {
    const now = new Date(2026, 10, 25, 9, 0);
    expect(historyBucket(new Date(2026, 10, 25, 0, 5), now)).toBe("today");
    expect(historyBucket(new Date(2026, 10, 24, 23, 59), now)).toBe("yesterday");
    expect(historyBucket(new Date(2026, 10, 20, 12, 0), now)).toBe("week");
    expect(historyBucket(new Date(2026, 10, 1, 12, 0), now)).toBe("month");
    expect(historyBucket(new Date(2026, 8, 1, 12, 0), now)).toBe("older");
  });
});

describe("a bot writing to a colleague", async () => {
  const { parseReply } = await import("./onboarding");
  test("one lasting conversation per bot, person it acts for and colleague", () => {
    const key = relayKey("a1", "u1", "u2");
    expect(isRelayKey(key)).toBe(true);
    expect(key).not.toBe(relayKey("a1", "u2", "u1"));
    expect(isRelayKey("a:a1|u:u1")).toBe(false);
  });
  test("the block is taken out of the reply, one per colleague", () => {
    const r = parseReply('Je lui écris.\n\n```message-person\n{"to": "@lea", "text": "Théo demande le PDF pour jeudi."}\n```\n```message-person\n{"to": "@marc", "text": "Et toi ?"}\n```');
    expect(r.text).toBe("Je lui écris.");
    expect(r.personMessages).toEqual([
      { to: "@lea", text: "Théo demande le PDF pour jeudi." },
      { to: "@marc", text: "Et toi ?" },
    ]);
    expect(parseReply('```message-person\n{"to": "@lea"}\n```').personMessages).toBeUndefined();
  });
});

describe("what an assistant is for", () => {
  test("the first sentence of its SOUL.md's role", () => {
    const soul = soulTemplate({ name: "Hermes", org: "e-do", locale: "fr", role: "Répond aux mails clients et prépare les devis. Ne paie jamais rien." });
    expect(soulRole(soul)).toBe("Répond aux mails clients et prépare les devis.");
    expect(soulRole(soulTemplate({ name: "Veille", org: "e-do", locale: "en", role: "Watches the market." }))).toBe("Watches the market.");
  });
  test("nothing while the role is still the template's placeholder", () => {
    expect(soulRole(soulTemplate({ name: "Hermes", org: "e-do", locale: "fr" }))).toBeNull();
    expect(soulRole("No sections at all.")).toBeNull();
  });
});

describe("a routine's result in its conversation", () => {
  const report = (response: string) => `# Cron Job: Planning\n\n**Job ID:** abc\n\n## Prompt\n\nDo it.\n\n## Response\n\n${response}\n`;
  test("the run's answer, without Hermes' report around it", () => {
    expect(runResponse(report("Voici ta semaine :\n- Lundi 14:00"))).toBe("Voici ta semaine :\n- Lundi 14:00");
  });
  test("nothing for a silent or failed run", () => {
    expect(runResponse(report("[SILENT]"))).toBeNull();
    expect(runResponse(report("[CRON_FAILURE]\nchild failed"))).toBeNull();
    expect(runResponse("# Cron Job: Planning\n\nno response yet")).toBeNull();
  });
});

describe("cards and answers", async () => {
  const { parseReply } = await import("./onboarding");
  test("task and routine lists are taken out of the reply", () => {
    const r = parseReply('Deux tâches t\'attendent :\n\n```task-list\n{"ids": ["t1", "t2"]}\n```');
    expect(r.text).toBe("Deux tâches t'attendent :");
    expect(r.taskList).toEqual(["t1", "t2"]);
    expect(parseReply('```routine-list\n{"ids": ["r1"]}\n```').routineList).toEqual(["r1"]);
    expect(parseReply('```task-list\n{"ids": []}\n```').taskList).toBeUndefined();
  });
  test("a relay conversation names its bot, the person it acts for and the colleague", () => {
    expect(relayParties(relayKey("a1", "u1", "u2"))).toEqual({ agentId: "a1", forUserId: "u1", userId: "u2" });
    expect(relayParties("a:a1|u:u1")).toBeNull();
    expect(relayParties(null)).toBeNull();
  });
});
