import { describe, expect, test } from "bun:test";
import { callsAgora, syncLogAlerts, triggerUrl } from "./posthog-alert-sync";
import { hashWebhookToken } from "./webhook-payload";

const ORIGIN = "https://agora.example.com";
const TOKEN = `agw_${"a".repeat(43)}`;
const OTHER = `agw_${"b".repeat(43)}`;
const URL_OF = (token: string) => `${ORIGIN}/api/hooks/${token}`;
const cfg = { host: "https://eu.posthog.com", projectId: "7", apiKey: "phx_test" };

describe("triggerUrl", () => {
  test("finds the destination whose token hashes to the trigger's", () => {
    const functions = [
      { inputs: { url: { value: "https://hooks.slack.com/services/x" } } },
      { inputs: { url: { value: URL_OF(OTHER) } } },
      { inputs: { url: { value: URL_OF(TOKEN) } } },
      { inputs: null },
    ];
    expect(triggerUrl(functions, `${ORIGIN}/`, hashWebhookToken(TOKEN))).toBe(URL_OF(TOKEN));
  });

  test("another trigger's address or another host is not this one", () => {
    expect(triggerUrl([{ inputs: { url: { value: URL_OF(OTHER) } } }], ORIGIN, hashWebhookToken(TOKEN))).toBeNull();
    expect(triggerUrl([{ inputs: { url: { value: `https://evil.example.com/api/hooks/${TOKEN}` } } }], ORIGIN, hashWebhookToken(TOKEN))).toBeNull();
  });
});

describe("callsAgora", () => {
  test("PostHog's redacted address (host only) of a webhook to Agora counts", () => {
    expect(callsAgora([{ type: "slack" }, { type: "webhook", webhook_url: ORIGIN }], URL_OF(TOKEN))).toBe(true);
    expect(callsAgora([{ type: "webhook", webhook_url: "https://other.example.com" }], URL_OF(TOKEN))).toBe(false);
    expect(callsAgora([{ type: "slack", webhook_url: ORIGIN }], URL_OF(TOKEN))).toBe(false);
    expect(callsAgora([{ type: "webhook", webhook_url: "<redacted>" }], URL_OF(TOKEN))).toBe(false);
  });
});

/** A PostHog answering from fixtures, recording what was sent. */
function fakePosthog(alerts: { id: string; name: string; destinations: { type: string; webhook_url?: string }[] }[], functions: unknown[]) {
  const posts: { path: string; body: unknown; auth: string | null }[] = [];
  const f = async (url: string, init?: RequestInit) => {
    const { pathname, searchParams } = new URL(url);
    const auth = new Headers(init?.headers).get("Authorization");
    if (init?.method === "POST") {
      posts.push({ path: pathname, body: JSON.parse(String(init.body)), auth });
      return Response.json({ hog_function_ids: ["f1"] }, { status: 201 });
    }
    if (pathname === "/api/projects/7/hog_functions/") {
      expect(searchParams.get("full")).toBe("true");
      return Response.json({ results: functions, next: null });
    }
    if (pathname === "/api/projects/7/logs/alerts/") {
      // Two pages, to follow `next`.
      const second = searchParams.get("offset") === "1";
      return Response.json({
        results: (second ? alerts.slice(1) : alerts.slice(0, 1)).map(({ id, name }) => ({ id, name })),
        next: second || alerts.length < 2 ? null : `${cfg.host}/api/projects/7/logs/alerts/?limit=100&offset=1`,
      });
    }
    const alert = alerts.find((a) => pathname === `/api/projects/7/logs/alerts/${a.id}/`);
    if (alert) return Response.json({ id: alert.id, destinations: alert.destinations });
    return new Response("not found", { status: 404 });
  };
  return { f, posts };
}

describe("syncLogAlerts", () => {
  const functions = [{ inputs: { url: { value: URL_OF(TOKEN) } } }];

  test("wires the alerts without an Agora webhook, and only those", async () => {
    const { f, posts } = fakePosthog(
      [
        { id: "a1", name: "API lente", destinations: [{ type: "slack" }, { type: "webhook", webhook_url: ORIGIN }] },
        { id: "a2", name: "Nouvelle alerte", destinations: [{ type: "slack" }] },
        { id: "a3", name: "Sans rien", destinations: [] },
      ],
      functions,
    );
    expect(await syncLogAlerts(cfg, ORIGIN, hashWebhookToken(TOKEN), f)).toEqual(["Nouvelle alerte", "Sans rien"]);
    expect(posts).toEqual([
      { path: "/api/projects/7/logs/alerts/a2/destinations/", body: { type: "webhook", webhook_url: URL_OF(TOKEN) }, auth: "Bearer phx_test" },
      { path: "/api/projects/7/logs/alerts/a3/destinations/", body: { type: "webhook", webhook_url: URL_OF(TOKEN) }, auth: "Bearer phx_test" },
    ]);
  });

  test("a second run changes nothing", async () => {
    const { f, posts } = fakePosthog([{ id: "a1", name: "API lente", destinations: [{ type: "webhook", webhook_url: ORIGIN }] }], functions);
    expect(await syncLogAlerts(cfg, ORIGIN, hashWebhookToken(TOKEN), f)).toEqual([]);
    expect(posts).toEqual([]);
  });

  test("without a destination that already calls the trigger, it says so and wires nothing", async () => {
    const { f, posts } = fakePosthog([{ id: "a1", name: "API lente", destinations: [] }], [{ inputs: { url: { value: URL_OF(OTHER) } } }]);
    await expect(syncLogAlerts(cfg, ORIGIN, hashWebhookToken(TOKEN), f)).rejects.toThrow("aucune destination PostHog");
    expect(posts).toEqual([]);
  });

  test("a PostHog error stops the run without wiring blindly", async () => {
    const f = async () => new Response("forbidden", { status: 403 });
    await expect(syncLogAlerts(cfg, ORIGIN, hashWebhookToken(TOKEN), f)).rejects.toThrow("403");
  });
});
