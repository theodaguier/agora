/**
 * Hermes contract: everything the Agora API depends on in Hermes (routes, formats,
 * SSE streams). Run by the update service against a "canary" Hermes before
 * adopting a new version, then against production after the switchover.
 *
 * Standalone (no database): bun src/hermes-contract.ts [--chat]
 * Output: JSON { ok, checks[] } on stdout, exit code 0 if everything passes, 1 otherwise.
 */
import { createHmac } from "node:crypto";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const API = process.env.HERMES_API_URL || "http://127.0.0.1:8650";
const DASH = process.env.HERMES_DASHBOARD_URL || "http://127.0.0.1:9129";
const HOME = process.env.HERMES_HOME || "/opt/data";
const withChat = process.argv.includes("--chat");

type Check = { name: string; ok: boolean; detail?: string; ms: number };
const checks: Check[] = [];

function keyFor(profile: string) {
  if (profile === "default") return process.env.HERMES_API_KEY ?? "";
  const explicit = process.env[`HERMES_KEY_${profile.toUpperCase().replace(/-/g, "_")}`];
  if (explicit) return explicit;
  return createHmac("sha256", process.env.HERMES_KEY_SECRET ?? "").update(`hermes-profile:${profile}`).digest("hex");
}

const base = (profile: string) => (profile === "default" ? API : `${API}/p/${encodeURIComponent(profile)}`);

async function check(name: string, fn: () => Promise<string | void>) {
  const t = performance.now();
  try {
    const detail = await fn();
    checks.push({ name, ok: true, detail: detail || undefined, ms: Math.round(performance.now() - t) });
  } catch (err) {
    checks.push({ name, ok: false, detail: err instanceof Error ? err.message : String(err), ms: Math.round(performance.now() - t) });
  }
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

async function getJson(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  assert(res.ok, `${url} → HTTP ${res.status}`);
  return res.json() as Promise<any>;
}

const auth = (profile: string) => ({ Authorization: `Bearer ${keyFor(profile)}` });
const dash = { "X-Hermes-Session-Token": process.env.HERMES_DASHBOARD_TOKEN ?? "" };

let profiles = ["default"];
try {
  profiles = ["default", ...readdirSync(join(HOME, "profiles"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)];
} catch {}
const named = profiles.find((p) => p !== "default");

await check("gateway /health", async () => {
  const res = await fetch(`${API}/health`, { signal: AbortSignal.timeout(10_000) });
  assert(res.ok, `HTTP ${res.status}`);
});

for (const p of profiles) {
  await check(`profil ${p} : /v1/models (clé du profil)`, async () => {
    const d = await getJson(`${base(p)}/v1/models`, auth(p));
    assert(Array.isArray(d.data) && d.data[0]?.id, "data[0].id absent");
  });
}

await check("/api/model/options : fournisseur courant et modèles", async () => {
  const d = await getJson(`${API}/api/model/options`, auth("default"));
  assert(typeof d.provider === "string" && typeof d.model === "string", "provider/model absents");
  const current = d.providers?.find((p: any) => p.slug === d.provider);
  assert(current && Array.isArray(current.models) && current.models.length > 0, `aucun modèle pour ${d.provider}`);
  return `${d.provider} : ${current.models.length} modèles`;
});

await check("/v1/toolsets : forme", async () => {
  const d = await getJson(`${base(named ?? "default")}/v1/toolsets`, auth(named ?? "default"));
  assert(Array.isArray(d.data) && d.data.every((t: any) => typeof t.name === "string" && typeof t.enabled === "boolean"), "forme inattendue");
  return `${d.data.length} toolsets`;
});

// /v1/skills is no longer used (broken since Hermes v2026.9.14): skills go through the dashboard.

// Outside the chat block: does not consume a model response.
// Answering approval requests: the route must exist (404 on an unknown run, not 405).
await check("runs : route de réponse aux autorisations", async () => {
  const res = await fetch(`${API}/v1/runs/agora-contract-unknown/approval`, {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: { ...auth("default"), "Content-Type": "application/json" },
    body: JSON.stringify({ choice: "deny" }),
  });
  assert(res.status === 404, `HTTP ${res.status} (attendu 404 run inconnu)`);
});


if (withChat) {
  const chatStarted = Date.now();
  await check("chat : réponse streamée (SSE)", async () => {
    const res = await fetch(`${API}/v1/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(180_000),
      headers: { ...auth("default"), "Content-Type": "application/json", "X-Hermes-Session-Id": `agora-contract-${Date.now()}-agent-r1` },
      body: JSON.stringify({
        model: "hermes-agent",
        stream: true,
        messages: [
          { role: "system", content: "Test automatique de mise à jour." },
          { role: "user", content: "Réponds uniquement : OK" },
        ],
      }),
    });
    assert(res.ok && res.body, `HTTP ${res.status}`);
    const text = await res.text();
    const deltas = [...text.matchAll(/^data: (\{.*\})$/gm)].map((m) => JSON.parse(m[1]!).choices?.[0]?.delta?.content ?? "").join("");
    assert(deltas.trim().length > 0, "aucun contenu dans le flux");
    return deltas.trim().slice(0, 40);
  });

  // Runs API (replies with approval requests): creation, then event stream.
  await check("runs : création et flux d'événements", async () => {
    const created = await fetch(`${API}/v1/runs`, {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      headers: { ...auth("default"), "Content-Type": "application/json" },
      body: JSON.stringify({ input: "Réponds uniquement : OK", session_id: `agora-contract-run-${Date.now()}` }),
    });
    assert(created.ok, `POST /v1/runs → HTTP ${created.status}`);
    const { run_id: runId } = (await created.json()) as { run_id?: string };
    assert(runId, "run_id absent");
    const events = await fetch(`${API}/v1/runs/${runId}/events`, { headers: auth("default"), signal: AbortSignal.timeout(180_000) });
    assert(events.ok, `events → HTTP ${events.status}`);
    const text = await events.text();
    const kinds = [...text.matchAll(/"event":\s*"([\w.]+)"/g)].map((m) => m[1]);
    assert(kinds.includes("run.completed"), `pas de run.completed (reçu : ${[...new Set(kinds)].join(", ") || "rien"})`);
    return [...new Set(kinds)].join(", ");
  });

  // Wiki memory plugin (if installed): the turn must be logged.
  const wikiRaw = join(HOME, "wiki", "raw", "conversations");
  if (existsSync(wikiRaw)) {
    await check("wiki : tour journalisé par le plugin mémoire", async () => {
      await new Promise((r) => setTimeout(r, 2000));
      const recent = readdirSync(wikiRaw, { recursive: true, withFileTypes: true }).some(
        (f) => f.isFile() && f.name === "default.md" && statSync(join(f.parentPath, f.name)).mtimeMs >= chatStarted - 1000,
      );
      assert(recent, "aucune entrée récente dans wiki/raw/conversations/*/default.md");
    });
  }
}

await check("dashboard /api/mcp/servers", async () => {
  const d = await getJson(`${DASH}/api/mcp/servers`, dash);
  assert(Array.isArray(d.servers), "servers absent");
});

await check("dashboard /api/mcp/catalog", async () => {
  const d = await getJson(`${DASH}/api/mcp/catalog`, dash);
  assert(Array.isArray(d.entries) && d.entries.every((e: any) => typeof e.name === "string" && "installed" in e), "entries inattendues");
});

await check("dashboard /api/skills (par profil)", async () => {
  const url = named ? `${DASH}/api/skills?profile=${encodeURIComponent(named)}` : `${DASH}/api/skills`;
  const d = await getJson(url, dash);
  assert(Array.isArray(d) && d.every((s: any) => typeof s.name === "string" && typeof s.enabled === "boolean"), "forme inattendue");
});

await check("dashboard /api/skills/hub/official", async () => {
  const d = await getJson(`${DASH}/api/skills/hub/official`, dash);
  assert(Array.isArray(d.skills), "skills absent");
});

await check("dashboard /api/actions/{name}/status", async () => {
  const res = await fetch(`${DASH}/api/actions/agora-contract-probe/status`, { headers: dash, signal: AbortSignal.timeout(10_000) });
  assert(res.status === 404 || res.ok, `HTTP ${res.status}`);
});

const ok = checks.every((c) => c.ok);
console.log(JSON.stringify({ ok, checks }, null, 2));
process.exit(ok ? 0 : 1);
