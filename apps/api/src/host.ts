import { realpathSync } from "node:fs";
import { env } from "./env";
import { childEnv } from "./harden";

/**
 * The machine the API runs on: local model runtimes (Ollama, LM Studio) and the
 * agent CLIs installed there, with their version and how to update them.
 */

/* ---------- Local models ---------- */

export type LocalModel = {
  id: string;
  /** "8.0B", "Q4_K_M"… as the runtime reports them. */
  parameters?: string;
  quantization?: string;
  family?: string;
  /** Bytes on disk. */
  size?: number;
  /** Currently loaded in memory. */
  loaded: boolean;
};
export type LocalRuntime = { id: "ollama" | "lmstudio"; url: string; running: boolean; models: LocalModel[] };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json() as Promise<T>;
}

type OllamaTag = { name: string; size?: number; details?: { parameter_size?: string; quantization_level?: string; family?: string } };

async function ollama(): Promise<LocalRuntime> {
  const url = env.OLLAMA_URL.replace(/\/$/, "");
  try {
    const [tags, ps] = await Promise.all([
      getJson<{ models?: OllamaTag[] }>(`${url}/api/tags`),
      getJson<{ models?: { name: string }[] }>(`${url}/api/ps`).catch(() => ({ models: [] })),
    ]);
    const loaded = new Set((ps.models ?? []).map((m) => m.name));
    const models = (tags.models ?? []).map((m) => ({
      id: m.name,
      parameters: m.details?.parameter_size || undefined,
      quantization: m.details?.quantization_level || undefined,
      family: m.details?.family || undefined,
      size: m.size,
      loaded: loaded.has(m.name),
    }));
    return { id: "ollama", url, running: true, models };
  } catch {
    return { id: "ollama", url, running: false, models: [] };
  }
}

type LmStudioModel = { id: string; type?: string; arch?: string; quantization?: string; state?: string };

async function lmStudio(): Promise<LocalRuntime> {
  const url = env.LMSTUDIO_URL.replace(/\/$/, "");
  try {
    // REST API (richer: state, quantization), else the OpenAI-compatible one.
    const rich = await getJson<{ data?: LmStudioModel[] }>(`${url}/api/v0/models`).catch(() => null);
    const data = rich?.data ?? (await getJson<{ data?: LmStudioModel[] }>(`${url}/v1/models`)).data ?? [];
    const models = data
      .filter((m) => m.type !== "embeddings")
      .map((m) => ({ id: m.id, quantization: m.quantization, family: m.arch, loaded: m.state === "loaded" }));
    return { id: "lmstudio", url, running: true, models };
  } catch {
    return { id: "lmstudio", url, running: false, models: [] };
  }
}

export const localRuntimes = () => Promise.all([ollama(), lmStudio()]);

/* ---------- CLIs ---------- */

type Latest = { kind: "npm"; pkg: string } | { kind: "github"; repo: string };
type CliSpec = {
  id: string;
  name: string;
  bin: string;
  latest: Latest;
  /** Version reported by `--version` (Hermes: the release date in brackets). */
  parse?: (out: string) => string | undefined;
  /** Update command for this install; null: to be updated by hand. */
  update: (path: string) => string[] | null;
  /** Updated by the update service (production), not from here. */
  managed?: boolean;
};

const brew = (path: string) => /\/(Cellar|homebrew|linuxbrew)\//.test(path);
const npmGlobal = (path: string) => path.includes("/node_modules/");

const CLIS: CliSpec[] = [
  {
    id: "claude",
    name: "Claude Code",
    bin: env.CLAUDE_CODE_BIN,
    latest: { kind: "npm", pkg: "@anthropic-ai/claude-code" },
    // Handles every install method itself.
    update: (path) => [path, "update"],
  },
  {
    id: "hermes",
    name: "Hermes",
    bin: env.HERMES_BIN,
    latest: { kind: "github", repo: "NousResearch/hermes-agent" },
    parse: (out) => out.match(/\((\d{4}\.\d+\.\d+)\)/)?.[1],
    update: (path) => [path, "update", "--yes"],
    managed: !!env.UPDATER_URL,
  },
  {
    id: "codex",
    name: "Codex",
    bin: "codex",
    latest: { kind: "npm", pkg: "@openai/codex" },
    update: (path) => (brew(path) ? ["brew", "upgrade", "codex"] : npmGlobal(path) ? ["npm", "install", "-g", "@openai/codex@latest"] : null),
  },
  {
    id: "opencode",
    name: "OpenCode",
    bin: "opencode",
    latest: { kind: "npm", pkg: "opencode-ai" },
    update: (path) => [path, "upgrade"],
  },
  {
    id: "ollama",
    name: "Ollama",
    bin: "ollama",
    latest: { kind: "github", repo: "ollama/ollama" },
    // The macOS app updates itself; the Linux script install is re-run by hand.
    update: (path) => (brew(path) ? ["brew", "upgrade", "ollama"] : null),
  },
];

export const CLI_IDS = CLIS.map((c) => c.id) as [string, ...string[]];

const LATEST_TTL = 60 * 60_000;
const latestCache = new Map<string, { at: number; version: Promise<string | null> }>();

function latestVersion(spec: CliSpec, force = false): Promise<string | null> {
  const cached = latestCache.get(spec.id);
  if (!force && cached && Date.now() - cached.at < LATEST_TTL) return cached.version;
  const l = spec.latest;
  const version = (
    l.kind === "npm"
      ? getJson<{ version: string }>(`https://registry.npmjs.org/${l.pkg}/latest`).then((r) => r.version)
      : getJson<{ tag_name: string }>(`https://api.github.com/repos/${l.repo}/releases/latest`).then((r) => r.tag_name.replace(/^v/, ""))
  ).catch((err) => {
    console.error(`host: latest ${spec.id}`, err);
    latestCache.delete(spec.id);
    return null;
  });
  latestCache.set(spec.id, { at: Date.now(), version });
  return version;
}

async function run(cmd: string[], timeout: number) {
  const proc = Bun.spawn(cmd, { env: childEnv(), stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const timer = setTimeout(() => proc.kill(), timeout);
  try {
    const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    return { code, out: `${stdout}\n${stderr}`.trim() };
  } finally {
    clearTimeout(timer);
  }
}

async function installedVersion(spec: CliSpec, path: string) {
  const { out } = await run([path, "--version"], 15_000).catch(() => ({ out: "" }));
  return spec.parse?.(out) ?? out.match(/\d+\.\d+\.\d+/)?.[0];
}

/** Numeric compare of "1.2.10" / "2026.9.21". */
function newer(a: string, b: string) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0;
  }
  return false;
}

type Job = { startedAt: string; endedAt?: string; ok?: boolean; output?: string };
const jobs = new Map<string, Job>();

export type HostCli = {
  id: string;
  name: string;
  installed: boolean;
  path: string | null;
  version: string | null;
  latest: string | null;
  outdated: boolean;
  /** How it gets updated: from here, by the update service, or by hand. */
  update: "self" | "managed" | "manual";
  job: Job | null;
};

export async function hostClis(force = false): Promise<HostCli[]> {
  return Promise.all(
    CLIS.map(async (spec) => {
      const found = Bun.which(spec.bin);
      const path = found ? realpath(found) : null;
      const [version, latest] = await Promise.all([path ? installedVersion(spec, found!) : null, latestVersion(spec, force)]);
      return {
        id: spec.id,
        name: spec.name,
        installed: !!path,
        path,
        version: version ?? null,
        latest,
        outdated: !!version && !!latest && newer(latest, version),
        update: spec.managed ? "managed" : path && spec.update(path) ? "self" : "manual",
        job: jobs.get(spec.id) ?? null,
      } satisfies HostCli;
    }),
  );
}

const realpath = (p: string) => {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
};

export class HostError extends Error {
  constructor(public code: "not_installed" | "managed" | "manual" | "running") {
    super(code);
  }
}

/** Starts the CLI's update in the background; its state comes back with `hostClis()`. */
export function updateCli(id: string) {
  const spec = CLIS.find((c) => c.id === id)!;
  if (jobs.get(id) && !jobs.get(id)!.endedAt) throw new HostError("running");
  if (spec.managed) throw new HostError("managed");
  const found = Bun.which(spec.bin);
  if (!found) throw new HostError("not_installed");
  const cmd = spec.update(realpath(found));
  if (!cmd) throw new HostError("manual");
  // The CLI's own path: `claude update` and co. resolve it that way.
  if (cmd[0] === realpath(found)) cmd[0] = found;

  const job: Job = { startedAt: new Date().toISOString() };
  jobs.set(id, job);
  run(cmd, 10 * 60_000)
    .then(async ({ code, out }) => {
      // `claude update` installs into $HOME and exits 0 even when the binary Agora runs is elsewhere (read-only mount).
      const version = code === 0 ? await installedVersion(spec, found) : undefined;
      const latest = code === 0 ? await latestVersion(spec) : null;
      const stale = !!version && !!latest && newer(latest, version);
      const output = stale ? `${out}\n${found} is still ${version}: the update went to another install.` : out;
      Object.assign(job, { ok: code === 0 && !stale, output: output.slice(-4000) });
    })
    .catch((err) => Object.assign(job, { ok: false, output: String(err) }))
    .finally(() => {
      job.endedAt = new Date().toISOString();
      console.log(`host: update ${id} ${job.ok ? "ok" : "failed"}`);
    });
}
