import { describe, expect, test } from "bun:test";
import { directKey, excerpt, findHandoffs, formatGroupContext, FOLLOW_UP_MS, groupCalls, isNoReply, withQuote } from "./group";

describe("directKey", () => {
  test("does not depend on order", () => {
    const u = { kind: "user" as const, id: "u1" };
    const a = { kind: "agent" as const, id: "a1" };
    expect(directKey(u, a)).toBe(directKey(a, u));
    expect(directKey(u, a)).toBe("a:a1|u:u1");
  });

  test("pair of employees", () => {
    const x = { kind: "user" as const, id: "b" };
    const y = { kind: "user" as const, id: "a" };
    expect(directKey(x, y)).toBe("u:a|u:b");
    expect(directKey(y, x)).toBe("u:a|u:b");
  });
});

describe("formatGroupContext", () => {
  test("authors, events and files, without the bot's own messages", () => {
    const out = formatGroupContext(
      [
        { kind: "user", text: "Salut", authorName: "Léa", authorAgentId: null },
        { kind: "bot", text: "Je suis moi", authorName: "Moi", authorAgentId: "self" },
        { kind: "bot", text: "Bonjour", authorName: "Juriste", authorAgentId: "other" },
        { kind: "event", text: "Théo a ajouté Juriste", authorName: null, authorAgentId: null },
        { kind: "user", text: "Regarde", authorName: "Théo", authorAgentId: null, attachments: [{ name: "a.pdf" }] },
      ],
      "self",
    );
    expect(out).toBe("[Léa] Salut\n\n[Bot Juriste] Bonjour\n\n(Théo a ajouté Juriste)\n\n[Théo] Regarde [fichiers : a.pdf]");
  });
});

describe("findHandoffs", () => {
  const agents = [
    { id: "self", name: "Planner" },
    { id: "a", name: "Agent" },
    { id: "ai", name: "Agent Immobilier" },
    { id: "j", name: "Juriste" },
  ];

  test("order of appearance, no duplicates, excluding self", () => {
    expect(findHandoffs("@Juriste puis @Planner et encore @juriste, enfin @Agent", agents, "self")).toEqual(["j", "a"]);
  });

  test("the longest name wins", () => {
    expect(findHandoffs("Je passe la main à @Agent Immobilier.", agents, "self")).toEqual(["ai"]);
  });

  test("no match on a word prefix", () => {
    expect(findHandoffs("@Juristes", agents, "self")).toEqual([]);
    expect(findHandoffs("sans mention", agents, "self")).toEqual([]);
  });
});

describe("withQuote", () => {
  test("reply to a message, or to a file only", () => {
    expect(withQuote("Oui", { replyTo: { id: "m", authorName: "Léa", text: "On valide ?" } })).toBe("(En réponse à Léa : « On valide ? »)\nOui");
    expect(withQuote("Vu", { replyTo: { id: "m", authorName: "Léa", text: "", attachment: { id: "f", name: "a.pdf", mime: "application/pdf" } } })).toBe(
      "(En réponse à Léa : « [fichier : a.pdf] »)\nVu",
    );
  });

  test("forwarded message, and no quote", () => {
    expect(withQuote("Devis", { forwarded: { authorName: "Juriste" } })).toBe("(Message transféré, écrit à l'origine par Juriste)\nDevis");
    expect(withQuote("Salut", null)).toBe("Salut");
  });

  test("excerpt flattens and cuts", () => {
    expect(excerpt("a\n\nb   c")).toBe("a b c");
    expect(excerpt("abcdef", 4)).toBe("abc…");
  });
});

describe("isNoReply", () => {
  test("the bare token, with trailing dot or spaces", () => {
    expect(isNoReply("NO_REPLY")).toBe(true);
    expect(isNoReply("  NO_REPLY.\n")).toBe(true);
    expect(isNoReply("NO_REPLY, je commence")).toBe(false);
    expect(isNoReply("Parfait, je commence les pistes.")).toBe(false);
  });
});

describe("groupCalls", () => {
  const agents = [
    { id: "design", name: "Design" },
    { id: "compta", name: "Compta" },
  ];
  const now = new Date("2026-09-23T10:00:00Z");
  const recent = { agentId: "design", at: new Date(now.getTime() - 60_000) };
  const call = (text: string, extra: Partial<Parameters<typeof groupCalls>[0]> = {}) => groupCalls({ text, mentions: [], agents, now, ...extra });

  test("mentions are answered, the replied bot may stay silent", () => {
    expect(call("@Compta et toi ?", { mentions: ["compta"], repliedTo: "design" })).toEqual([{ agentId: "compta" }, { agentId: "design", implicit: "reply" }]);
    expect(call("@Design ok", { mentions: ["design"], repliedTo: "design" })).toEqual([{ agentId: "design" }]);
  });

  test("a bot named without @", () => {
    expect(call("est-ce que l'agent design sait ?")).toEqual([{ agentId: "design", implicit: "named" }]);
    expect(call("on redesigne tout", { lastBot: null })).toEqual([]);
  });

  test("right after a bot's reply", () => {
    expect(call("attribue lui la tâche", { lastBot: recent })).toEqual([{ agentId: "design", implicit: "followUp" }]);
    expect(call("attribue lui la tâche", { lastBot: { agentId: "design", at: new Date(now.getTime() - FOLLOW_UP_MS - 1) } })).toEqual([]);
    expect(call("demande à compta", { lastBot: recent })).toEqual([{ agentId: "compta", implicit: "named" }]);
  });

  test("a colleague mentioned calls no bot", () => {
    expect(call("@lea tu fais quoi ?", { lastBot: recent })).toEqual([]);
  });

  test("ignores bots outside the group", () => {
    expect(call("salut", { mentions: ["ghost"], repliedTo: "ghost" })).toEqual([]);
  });
});
