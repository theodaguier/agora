import { guessIntegrationType, isPastDue, pieSlices, statusTone } from "@agora/core";
import { describe, expect, test } from "bun:test";
import { mcpRequestSchema } from "./mcp-requests";
import { parseReply } from "./onboarding";
import { parseDraft, viewPrompt, withViewAction } from "./views";

const block = (json: unknown) => "```view\n" + JSON.stringify(json) + "\n```";

describe("view blocks", () => {
  test("the source connector is kept when it's a valid server name, dropped otherwise", () => {
    const view = { type: "finance", kind: "list", items: [{ label: "Facture", amount: 12 }] };
    expect(parseReply(block({ ...view, source: "pennylane" })).views![0]?.source).toBe("pennylane");
    expect(parseReply(block({ ...view, source: "<script>" })).views![0]).toEqual({ ...view, title: undefined } as never);
  });

  test("an inbox is parsed and removed from the text", () => {
    const reply = `Voici tes derniers mails.\n\n${block({ type: "mail", kind: "list", title: "Inbox", items: [{ from: "Léa", subject: "Devis", unread: true }] })}`;
    const parsed = parseReply(reply);
    expect(parsed.text).toBe("Voici tes derniers mails.");
    expect(parsed.views).toEqual([{ type: "mail", kind: "list", title: "Inbox", items: [{ from: "Léa", subject: "Devis", unread: true }] }]);
  });
  test("several views, in one array or several blocks", () => {
    const a = { type: "calendar", kind: "list", items: [{ title: "Point", start: "2026-09-24T09:00:00Z" }] };
    const b = { type: "chat", kind: "draft", draft: { channel: "#général", text: "Salut" } };
    expect(parseReply(block([a, b])).views).toHaveLength(2);
    expect(parseReply(`${block(a)}\n${block(b)}`).views).toHaveLength(2);
  });
  test("invalid items are skipped, not the whole list", () => {
    const parsed = parseReply(block({ type: "finance", kind: "list", items: [{ label: "Facture", amount: 120 }, { label: "Sans montant" }] }));
    expect(parsed.views?.[0]).toMatchObject({ items: [{ label: "Facture", amount: 120 }] });
  });
  test("an invalid block stays in the text", () => {
    const raw = block({ type: "weather", kind: "list", items: [] });
    expect(parseReply(raw).text).toBe(raw);
    expect(parseReply(block({ type: "files", kind: "draft", draft: {} })).views).toBeUndefined();
    expect(parseReply(block({ type: "mail", kind: "draft", draft: { to: [], subject: "x", body: "y" } })).views).toBeUndefined();
  });
  test("a draft sent as a JSON string is accepted", () => {
    const draft = JSON.stringify({ channel: "#a", text: "b" });
    expect(parseReply(block({ type: "chat", kind: "draft", draft })).views?.[0]).toMatchObject({ draft: { channel: "#a", text: "b" } });
  });
  test("a table", () => {
    const parsed = parseReply(block({ type: "database", kind: "table", columns: ["id", "name"], rows: [[1, "a"], [2, null]] }));
    expect(parsed.views?.[0]).toMatchObject({ kind: "table", rows: [[1, "a"], [2, null]] });
  });
  test("a table over the limits is cut, not left as raw JSON", () => {
    const rows = Array.from({ length: 80 }, (_, i) => [`/page-${i}`, i, { pct: 0.5 }]);
    const parsed = parseReply(block({ type: "other", kind: "table", source: "posthog-edo", title: "x".repeat(200), columns: ["Page", "Visiteurs", "Détail"], rows }));
    expect(parsed.text).toBe("");
    const view = parsed.views?.[0] as { title: string; rows: unknown[][] };
    expect(view.title).toHaveLength(120);
    expect(view.rows).toHaveLength(50);
    expect(view.rows[0]).toEqual(["/page-0", 0, '{"pct":0.5}']);
  });
  test("a chart: values aligned on the labels, numbers written as text read, gaps kept", () => {
    const parsed = parseReply(
      block({ type: "other", kind: "chart", chart: "line", unit: "%", labels: ["2026-09-01", "2026-09-02", "2026-09-03"], series: [{ name: "Mobile", values: [82, "17,5 %", "?"] }] }),
    );
    expect(parsed.text).toBe("");
    expect(parsed.views?.[0]).toMatchObject({ kind: "chart", chart: "line", unit: "%", series: [{ name: "Mobile", values: [82, 17.5, null] }] });
  });
  test("a chart is cut to its limits; a pie keeps one series; an empty or unknown chart stays raw", () => {
    const series = Array.from({ length: 8 }, (_, i) => ({ name: `S${i}`, values: [i + 1] }));
    expect((parseReply(block({ type: "other", kind: "chart", chart: "bar", labels: ["a"], series })).views?.[0] as { series: unknown[] }).series).toHaveLength(5);
    expect((parseReply(block({ type: "other", kind: "chart", chart: "pie", labels: ["a"], series })).views?.[0] as { series: unknown[] }).series).toHaveLength(1);
    expect(parseReply(block({ type: "other", kind: "chart", chart: "bar", labels: ["a"], series: [{ name: "x", values: [null] }] })).views).toBeUndefined();
    expect(parseReply(block({ type: "other", kind: "chart", chart: "radar", labels: ["a"], series: [{ name: "x", values: [1] }] })).views).toBeUndefined();
  });
  test("pie slices: largest first, the smallest gathered", () => {
    const view = { type: "other", kind: "chart", chart: "pie", labels: ["a", "b", "c", "d", "e", "f", "g"], series: [{ name: "n", values: [1, 7, 3, 0, 5, 2, 4] }] } as const;
    const slices = pieSlices(view as never, "Autres");
    expect(slices.map((s) => [s.label, s.value])).toEqual([["b", 7], ["e", 5], ["g", 4], ["c", 3], ["Autres", 3]]);
  });
  test("table rows written as objects are read by column", () => {
    const parsed = parseReply(block({ type: "other", kind: "table", columns: ["Source", "Sessions"], rows: [{ Source: "Google", Sessions: 14 }] }));
    expect(parsed.views?.[0]).toMatchObject({ columns: ["Source", "Sessions"], rows: [["Google", 14]] });
  });
});

describe("view prompt", () => {
  test("empty without typed connectors", () => {
    expect(viewPrompt([])).toBe("");
  });
  test("charts are offered whatever the connectors", () => {
    expect(viewPrompt(["mail"])).toContain('"kind": "chart"');
  });
  test("only the formats of the connected types", () => {
    const prompt = viewPrompt(["mail"]);
    expect(prompt).toContain("- `mail`");
    expect(prompt).toContain("- `other`");
    expect(prompt).not.toContain("- `calendar`");
  });
});

describe("drafts", () => {
  test("the edited draft is validated", () => {
    expect(parseDraft("mail", { to: ["a@b.co"], subject: "Hi", body: "…" })).toEqual({ to: ["a@b.co"], subject: "Hi", body: "…" });
    expect(parseDraft("mail", { subject: "Hi" })).toBeNull();
  });
  test("the answer reaches the bot", () => {
    const confirm = withViewAction("Brouillon confirmé", { messageId: "m", index: 0, action: "confirm", draft: { channel: "#a", text: "b" } });
    expect(confirm).toContain("CONFIRMED");
    expect(confirm).toContain('"channel": "#a"');
    expect(confirm).toContain("Use ONLY the tools of the connector");
    expect(withViewAction("x", { messageId: "m", index: 0, action: "cancel" })).toContain("CANCELLED");
    expect(withViewAction("x", undefined)).toBe("x");
  });
  test("a change request sends the note and the edited version, without carrying it out", () => {
    const revise = withViewAction("Correction", { messageId: "m", index: 0, action: "revise", note: "plus court", draft: { channel: "#a", text: "édité" } });
    expect(revise).toContain("REVISE");
    expect(revise).toContain("plus court");
    expect(revise).toContain('"text": "édité"');
    expect(revise).toContain("Do NOT carry it out");
    expect(revise).toContain('"draft":{"channel":"#a","text":"édité"}');
  });
});

describe("integration types", () => {
  test("guessed from the name and description", () => {
    expect(guessIntegrationType("gmail")).toBe("mail");
    expect(guessIntegrationType("pennylane", "Comptabilité")).toBe("finance");
    expect(guessIntegrationType("google-calendar")).toBe("calendar");
    expect(guessIntegrationType("github")).toBe("code");
    expect(guessIntegrationType("supabase")).toBe("database");
    expect(guessIntegrationType("acme")).toBe("other");
  });
  test("a bot's request may carry a type", () => {
    const base = { name: "pennylane", url: "https://mcp.pennylane.com/mcp", auth: "oauth" };
    expect(mcpRequestSchema.safeParse({ ...base, type: "finance" }).data?.type).toBe("finance");
    expect(mcpRequestSchema.safeParse({ ...base, type: "weather" }).success).toBe(false);
  });
});

describe("status tones", () => {
  test("free-text statuses, French or English", () => {
    expect(["En retard", "overdue", "Bloqué", "Échec"].map(statusTone)).toEqual(["danger", "danger", "danger", "danger"]);
    expect(["À payer", "pending", "À faire", "In review"].map(statusTone)).toEqual(["warning", "warning", "warning", "warning"]);
    expect(["Payée", "paid", "Terminé", "merged"].map(statusTone)).toEqual(["success", "success", "success", "success"]);
    expect(["En cours", "open", "In progress"].map(statusTone)).toEqual(["info", "info", "info"]);
    expect(["Unpaid", "closed", "", undefined].map(statusTone)).toEqual(["danger", "neutral", "neutral", "neutral"]);
  });
  test("past due dates", () => {
    const now = new Date(2026, 8, 23);
    expect(isPastDue("2026-09-22", now)).toBe(true);
    expect(isPastDue("2026-09-23", now)).toBe(false);
    expect(isPastDue(undefined, now)).toBe(false);
  });
});
