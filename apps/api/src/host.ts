import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
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

type Latest = { kind: "npm"; pkg: string } | { kind: "github"; repo: string } | { kind: "pypi"; pkg: string } | { kind: "none" };
type CliSpec = {
  id: string;
  name: string;
  /** Names it is installed under, in order (an env override first when there is one). */
  bins: string[];
  /** A name another tool may own too (`agent`): true when the binary found is this one. */
  verify?: (realPath: string) => boolean;
  /** An agent that codes (vs. a runtime or Hermes itself). */
  agent: boolean;
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
/** A package installed with npm -g or Homebrew: updated the same way it was installed. */
const npmOrBrew = (pkg: string, formula?: string) => (path: string) =>
  formula && brew(path) ? ["brew", "upgrade", formula] : npmGlobal(path) ? ["npm", "install", "-g", `${pkg}@latest`] : null;
/** `2026.09.18-7ae6800`: dated builds (Cursor). */
const dated = (out: string) => out.match(/\d{4}\.\d{1,2}\.\d{1,2}(?:-[0-9a-f]+)?/)?.[0];

/**
 * Agent CLIs (and runtimes) looked for on the machine. Not finding one in the API's PATH is not
 * enough to say it is missing: a launchd or systemd service gets a short PATH, and most of these
 * install into the home directory (see `findBin`).
 */
const CLIS: CliSpec[] = [
  {
    id: "claude",
    name: "Claude Code",
    bins: [env.CLAUDE_CODE_BIN],
    agent: true,
    latest: { kind: "npm", pkg: "@anthropic-ai/claude-code" },
    // Handles every install method itself.
    update: (path) => [path, "update"],
  },
  {
    id: "codex",
    name: "Codex",
    bins: [env.CODEX_BIN],
    agent: true,
    latest: { kind: "npm", pkg: "@openai/codex" },
    update: npmOrBrew("@openai/codex", "codex"),
  },
  {
    id: "cursor",
    name: "Cursor CLI",
    // `agent` since 2025, `cursor-agent` before: both link to ~/.local/share/cursor-agent/versions/<v>/cursor-agent.
    bins: env.CURSOR_AGENT_BIN ? [env.CURSOR_AGENT_BIN] : ["cursor-agent", "agent"],
    verify: (path) => /cursor/i.test(path),
    agent: true,
    // Not published anywhere it can be read from: `agent update` knows.
    latest: { kind: "none" },
    parse: dated,
    update: (path) => [path, "update"],
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    bins: ["gemini"],
    agent: true,
    latest: { kind: "npm", pkg: "@google/gemini-cli" },
    update: npmOrBrew("@google/gemini-cli", "gemini-cli"),
  },
  {
    id: "copilot",
    name: "GitHub Copilot CLI",
    bins: ["copilot"],
    agent: true,
    latest: { kind: "npm", pkg: "@github/copilot" },
    update: npmOrBrew("@github/copilot", "copilot-cli"),
  },
  {
    id: "opencode",
    name: "OpenCode",
    bins: ["opencode"],
    agent: true,
    latest: { kind: "npm", pkg: "opencode-ai" },
    update: (path) => [path, "upgrade"],
  },
  {
    id: "amp",
    name: "Amp",
    bins: ["amp"],
    agent: true,
    latest: { kind: "npm", pkg: "@sourcegraph/amp" },
    update: (path) => [path, "update"],
  },
  {
    id: "qwen",
    name: "Qwen Code",
    bins: ["qwen"],
    agent: true,
    latest: { kind: "npm", pkg: "@qwen-code/qwen-code" },
    update: npmOrBrew("@qwen-code/qwen-code", "qwen-code"),
  },
  {
    id: "auggie",
    name: "Auggie",
    bins: ["auggie"],
    agent: true,
    latest: { kind: "npm", pkg: "@augmentcode/auggie" },
    update: npmOrBrew("@augmentcode/auggie"),
  },
  {
    id: "crush",
    name: "Crush",
    bins: ["crush"],
    agent: true,
    latest: { kind: "github", repo: "charmbracelet/crush" },
    update: npmOrBrew("@charmland/crush", "crush"),
  },
  {
    id: "goose",
    name: "Goose",
    bins: ["goose"],
    agent: true,
    latest: { kind: "github", repo: "block/goose" },
    update: (path) => (brew(path) ? ["brew", "upgrade", "block-goose-cli"] : [path, "update"]),
  },
  {
    id: "droid",
    name: "Factory Droid",
    bins: ["droid"],
    agent: true,
    latest: { kind: "none" },
    update: () => null,
  },
  {
    id: "kiro",
    name: "Kiro CLI",
    bins: ["kiro-cli"],
    agent: true,
    latest: { kind: "none" },
    update: () => null,
  },
  {
    id: "aider",
    name: "Aider",
    bins: ["aider"],
    agent: true,
    latest: { kind: "pypi", pkg: "aider-chat" },
    // pip, pipx or uv: whichever installed it updates it.
    update: () => null,
  },
  {
    id: "hermes",
    name: "Hermes",
    bins: [env.HERMES_BIN],
    agent: false,
    latest: { kind: "github", repo: "NousResearch/hermes-agent" },
    parse: (out) => out.match(/\((\d{4}\.\d+\.\d+)\)/)?.[1],
    update: (path) => [path, "update", "--yes"],
    managed: !!env.UPDATER_URL,
  },
  {
    id: "ollama",
    name: "Ollama",
    bins: ["ollama"],
    agent: false,
    latest: { kind: "github", repo: "ollama/ollama" },
    // The macOS app updates itself; the Linux script install is re-run by hand.
    update: (path) => (brew(path) ? ["brew", "upgrade", "ollama"] : null),
  },
];

/** Where agent CLIs install themselves besides the PATH a service starts with. */
function installDirs() {
  const home = homedir();
  return [
    join(home, ".local", "bin"),
    join(home, ".npm-global", "bin"),
    join(home, ".bun", "bin"),
    join(home, ".volta", "bin"),
    join(home, ".deno", "bin"),
    join(home, ".cargo", "bin"),
    join(home, "go", "bin"),
    join(home, ".opencode", "bin"),
    join(home, ".amp", "bin"),
    join(home, ".factory", "bin"),
    join(home, ".claude", "local"),
    join(home, "Library", "pnpm"),
    join(home, ".local", "share", "pnpm"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/home/linuxbrew/.linuxbrew/bin",
    "/usr/bin",
  ];
}

/** A command's path: an absolute one as is, else from PATH, else from the usual install directories. */
export function findBin(bin: string): string | null {
  if (!bin) return null;
  if (bin.includes("/")) return existsSync(bin) ? bin : null;
  return Bun.which(bin) ?? Bun.which(bin, { PATH: installDirs().join(delimiter) }) ?? null;
}

/** A CLI's binary on this machine (the name it was found under, not resolved), null when absent. */
export function cliPath(id: string): string | null {
  const spec = CLIS.find((c) => c.id === id);
  for (const bin of spec?.bins ?? []) {
    const found = findBin(bin);
    if (found && (!spec!.verify || spec!.verify(realpath(found)))) return found;
  }
  return null;
}

/**
 * The environment of a CLI found outside the API's PATH: its directory (and the install
 * directories) added, so its `#!/usr/bin/env node` and the tools it runs are found as well.
 */
export function cliEnv(bin: string, base: Record<string, string>) {
  const dirs = [dirname(bin), ...(base.PATH ?? "").split(delimiter), ...installDirs()].filter(Boolean);
  return { ...base, PATH: [...new Set(dirs)].join(delimiter) };
}

export const CLI_IDS = CLIS.map((c) => c.id) as [string, ...string[]];

const LATEST_TTL = 60 * 60_000;
const latestCache = new Map<string, { at: number; version: Promise<string | null> }>();

function latestVersion(spec: CliSpec, force = false): Promise<string | null> {
  const cached = latestCache.get(spec.id);
  if (!force && cached && Date.now() - cached.at < LATEST_TTL) return cached.version;
  const l = spec.latest;
  if (l.kind === "none") return Promise.resolve(null);
  const version = (
    l.kind === "npm"
      ? getJson<{ version: string }>(`https://registry.npmjs.org/${l.pkg}/latest`).then((r) => r.version)
      : l.kind === "pypi"
        ? getJson<{ info: { version: string } }>(`https://pypi.org/pypi/${l.pkg}/json`).then((r) => r.info.version)
        : getJson<{ tag_name: string }>(`https://api.github.com/repos/${l.repo}/releases/latest`).then((r) => r.tag_name.replace(/^v/, ""))
  ).catch((err) => {
    console.error(`host: latest ${spec.id}`, err);
    latestCache.delete(spec.id);
    return null;
  });
  latestCache.set(spec.id, { at: Date.now(), version });
  return version;
}

async function run(cmd: string[], timeout: number, bin?: string) {
  const proc = Bun.spawn(cmd, { env: bin ? cliEnv(bin, childEnv()) : childEnv(), stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const timer = setTimeout(() => proc.kill(), timeout);
  try {
    const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    return { code, out: `${stdout}\n${stderr}`.trim() };
  } finally {
    clearTimeout(timer);
  }
}

async function installedVersion(spec: CliSpec, path: string) {
  const { out } = await run([path, "--version"], 15_000, path).catch(() => ({ out: "" }));
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
  /** An agent that codes (Claude Code, Codex, Cursor…), vs. Hermes and the model runtimes. */
  agent: boolean;
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
      const found = cliPath(spec.id);
      const path = found ? realpath(found) : null;
      // Nothing to compare an absent CLI with: no registry asked.
      const [version, latest] = path ? await Promise.all([installedVersion(spec, found!), latestVersion(spec, force)]) : [null, null];
      return {
        id: spec.id,
        name: spec.name,
        agent: spec.agent,
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
  const found = cliPath(id);
  if (!found) throw new HostError("not_installed");
  const cmd = spec.update(realpath(found));
  if (!cmd) throw new HostError("manual");
  // The CLI's own path: `claude update` and co. resolve it that way.
  if (cmd[0] === realpath(found)) cmd[0] = found;

  const job: Job = { startedAt: new Date().toISOString() };
  jobs.set(id, job);
  run(cmd, 10 * 60_000, found)
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
