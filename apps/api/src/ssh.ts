import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { SSH_NAME, type SshHostDto, type SshLogEntry, type SshProbe, type SshTestResult } from "@agora/core";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "./db";
import { childEnv } from "./harden";
import { seal, unseal } from "./sealed";

/**
 * Machines SSH: remote machines an admin declares once (Settings › Machines), that every bot and every
 * code session reaches, except the bots the admin left out.
 *
 * Agora makes an ed25519 key for each machine; its private half is sealed in the database and never
 * leaves the server: a run gets an ssh-agent of its own holding the keys it may use, and drops it when
 * it ends. The machine's host key is pinned at the first successful test (StrictHostKeyChecking yes):
 * a machine never tested, or whose key changed, is refused.
 *
 * Two ways in:
 * - the bots on Hermes call `ssh_run` (agora_ssh plugin, routes/ssh.ts): the API runs the command;
 * - the code sessions use `ssh <name>`, scp, sftp, rsync, git in their own shell: their PATH starts
 *   with wrappers that point ssh at the run's config (`openSsh`).
 * Every command a bot runs, and every run given the machines, is logged in ssh_log.
 */

const { agent, sshHost, sshLog, user } = schema;
type HostRow = typeof sshHost.$inferSelect;

export class SshError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

/** A host name, IPv4 or bracket-less IPv6: no space, quote or option a config line could carry. */
const HOST = /^[A-Za-z0-9._:-]{1,253}$/;
const USERNAME = /^[A-Za-z_][A-Za-z0-9_.-]{0,31}$/;

export const hostInput = z.object({
  name: z.string().trim().toLowerCase().regex(SSH_NAME),
  host: z.string().trim().regex(HOST),
  port: z.number().int().min(1).max(65535).default(22),
  username: z.string().trim().regex(USERNAME),
  description: z.string().trim().max(500).default(""),
  excludedAgentIds: z.array(z.string()).max(500).default([]),
});
export const hostPatch = hostInput.partial();

/** Never sends the private key. */
const dto = (h: HostRow): SshHostDto => ({
  id: h.id,
  name: h.name,
  host: h.host,
  port: h.port,
  username: h.username,
  description: h.description,
  publicKey: h.publicKey,
  hostKeyFingerprint: h.hostKeyFingerprint,
  excludedAgentIds: h.excludedAgentIds,
  lastUsedAt: h.lastUsedAt?.toISOString() ?? null,
  createdAt: h.createdAt.toISOString(),
});

/* ---------- processes ---------- */

type Out = { code: number | null; stdout: string; stderr: string; timedOut: boolean };

async function exec(cmd: string[], opts: { env?: Record<string, string>; stdin?: string; timeoutMs?: number } = {}): Promise<Out> {
  const proc = Bun.spawn(cmd, {
    env: opts.env ?? childEnv(),
    stdin: opts.stdin !== undefined ? new Blob([opts.stdin]) : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  let timedOut = false;
  const timer = opts.timeoutMs
    ? setTimeout(() => {
        timedOut = true;
        proc.kill();
      }, opts.timeoutMs)
    : null;
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (timer) clearTimeout(timer);
  return { code: timedOut ? null : code, stdout, stderr, timedOut };
}

const bin = (name: string) => Bun.which(name) ?? `/usr/bin/${name}`;

/** A fresh ed25519 key pair, in OpenSSH format. */
async function generateKey(comment: string) {
  const dir = await mkdtemp(join("/tmp", "agora-sshkey-"));
  try {
    const file = join(dir, "key");
    const out = await exec([bin("ssh-keygen"), "-q", "-t", "ed25519", "-N", "", "-C", comment, "-f", file], { timeoutMs: 15_000 });
    if (out.code !== 0) throw new Error(`ssh-keygen: ${out.stderr.trim() || out.code}`);
    return { privateKey: await readFile(file, "utf8"), publicKey: (await readFile(`${file}.pub`, "utf8")).trim() };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const alias = (h: Pick<HostRow, "id">) => `agora-${h.id}`;

/* ---------- a run's access ---------- */

export type SshAccess = {
  /** The machines this run reaches, by name. */
  hosts: HostRow[];
  /** The run's ssh config (`ssh -F`). */
  config: string;
  /** Merged into the run's environment: its agent, and its wrappers first in PATH. */
  env: (base: Record<string, string | undefined>) => Record<string, string>;
  /** Gives the running process one more machine (one an agent just added and tested): ssh reads its config at each call. */
  add: (host: HostRow) => Promise<void>;
  dispose: () => Promise<void>;
};

async function waitFor(file: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await stat(file).then(() => true, () => false)) return true;
    await Bun.sleep(25);
  }
  return false;
}

/**
 * An ssh-agent holding these machines' keys, and a config naming them, for one run. `pinned` overrides
 * a machine's known host keys (a test before they are saved). The keys never touch the disk.
 */
export async function openSsh(hosts: HostRow[], pinned?: Map<string, string>): Promise<SshAccess> {
  // Short: a unix socket path is limited to ~104 bytes.
  const dir = await mkdtemp(join("/tmp", "agora-ssh-"));
  await chmod(dir, 0o700);
  const sock = join(dir, "agent.sock");
  // The agent lives as long as its pipe from the API: if the API dies, `read` returns and the agent is killed.
  const agentProc = Bun.spawn(["/bin/sh", "-c", '"$0" -D -a "$1" & a=$!; read _; kill $a; wait $a', bin("ssh-agent"), sock], {
    env: childEnv(),
    stdin: "pipe",
    stdout: "ignore",
    stderr: "ignore",
  });
  const dispose = async () => {
    try {
      agentProc.stdin.end();
    } catch {}
    // The agent removes its socket as it exits: removing the folder meanwhile leaves part of it behind.
    await agentProc.exited;
    await rm(dir, { recursive: true, force: true });
  };
  try {
    if (!(await waitFor(sock, 3000))) throw new Error("ssh-agent did not start");
    const agentEnv = childEnv({ SSH_AUTH_SOCK: sock });
    await mkdir(join(dir, "keys"));
    await mkdir(join(dir, "bin"));
    const known = join(dir, "known_hosts");
    // The machines' blocks live in their own file, included first: one added later still comes before `Match all`.
    const machines = join(dir, "machines.conf");
    const config = join(dir, "config");
    const reached: HostRow[] = [];
    const known_: string[] = [];
    const blocks: string[] = [];
    const write = async () => {
      await writeFile(known, known_.length ? `${known_.join("\n")}\n` : "", { mode: 0o600 });
      await writeFile(machines, blocks.length ? `${blocks.join("\n\n")}\n` : "", { mode: 0o600 });
    };
    const load = async (h: HostRow, keys: string | null) => {
      const added = await exec([bin("ssh-add"), "-q", "-"], { env: agentEnv, stdin: ensureNewline(unseal(h.privateKey)), timeoutMs: 10_000 });
      if (added.code !== 0) throw new Error(`ssh-add ${h.name}: ${added.stderr.trim()}`);
      const pub = join(dir, "keys", `${h.name}.pub`);
      await writeFile(pub, `${h.publicKey}\n`, { mode: 0o600 });
      if (keys) known_.push(keys.trim());
      blocks.push(
        [
          `Host ${h.name}`,
          `  HostName ${h.host}`,
          `  Port ${h.port}`,
          `  User ${h.username}`,
          `  HostKeyAlias ${alias(h)}`,
          `  IdentityAgent ${sock}`,
          `  IdentityFile ${pub}`,
          "  IdentitiesOnly yes",
          `  UserKnownHostsFile ${known}`,
          "  StrictHostKeyChecking yes",
          "  UpdateHostKeys no",
          "  ServerAliveInterval 30",
        ].join("\n"),
      );
      reached.push(h);
    };
    for (const h of hosts) await load(h, pinned?.get(h.id) ?? h.hostKeys);
    await write();
    // Every other host as the machine's own ssh config would reach it.
    const own = join(homedir(), ".ssh", "config");
    const ownExists = await stat(own).then(() => true, () => false);
    await writeFile(config, [`Include ${machines}`, ownExists && `Match all\n  Include ${own}`].filter(Boolean).join("\n\n") + "\n", { mode: 0o600 });
    // scp and sftp call ssh by its absolute path, rsync and git by PATH: each wrapper passes the config.
    for (const tool of ["ssh", "scp", "sftp"]) {
      await writeFile(join(dir, "bin", tool), `#!/bin/sh\nexec ${bin(tool)} -F '${config}' "$@"\n`, { mode: 0o700 });
    }
    return {
      hosts: reached,
      config,
      env: (base) => ({
        ...Object.fromEntries(Object.entries(base).filter((e): e is [string, string] => e[1] !== undefined)),
        SSH_AUTH_SOCK: sock,
        PATH: [join(dir, "bin"), base.PATH ?? process.env.PATH ?? "/usr/bin:/bin"].join(":"),
      }),
      add: async (h) => {
        if (reached.some((r) => r.id === h.id)) return;
        await load(h, h.hostKeys);
        await write();
      },
      dispose,
    };
  } catch (err) {
    await dispose();
    throw err;
  }
}

/**
 * At start: the folders of runs whose API died (their agent died with it, taking its socket). Only public
 * keys and configs are left there; a folder whose socket is still there belongs to a live run.
 */
export async function sweepSshLeftovers() {
  for (const name of await readdir("/tmp").catch(() => [] as string[])) {
    if (!name.startsWith("agora-ssh-")) continue;
    const dir = join("/tmp", name);
    if (await stat(join(dir, "agent.sock")).then(() => false, () => true)) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const ensureNewline = (s: string) => (s.endsWith("\n") ? s : `${s}\n`);

/* ---------- who may use what ---------- */

/** The machines a bot may reach (tested ones only: their host key is pinned). */
export async function hostsFor(agentId: string | null): Promise<HostRow[]> {
  const rows = await db.select().from(sshHost).where(isNotNull(sshHost.hostKeys)).orderBy(sshHost.name);
  return agentId ? rows.filter((h) => !h.excludedAgentIds.includes(agentId)) : rows;
}

export type Actor = { agentId: string | null; userId: string | null; conversationId: string | null };

async function log(hosts: HostRow[], actor: Actor, command: string | null, exitCode: number | null) {
  if (!hosts.length) return;
  const now = new Date();
  await db.insert(sshLog).values(
    hosts.map((h) => ({ id: crypto.randomUUID(), hostId: h.id, agentId: actor.agentId, userId: actor.userId, conversationId: actor.conversationId, command, exitCode, at: now })),
  );
  await db.update(sshHost).set({ lastUsedAt: now }).where(inArray(sshHost.id, hosts.map((h) => h.id)));
}

/**
 * A code session's run given its machines (`hostsFor`), just before it starts; null when the agent failed. Logged once per run: what it types in its shell isn't seen.
 */
export async function openSshForRun(hosts: HostRow[], actor: Actor): Promise<SshAccess | null> {
  try {
    // Opened even without machines: one the session adds and tests (ssh_add_host) joins it.
    const access = await openSsh(hosts);
    await log(hosts, actor, null, null).catch((err) => console.error("ssh: log", err));
    return access;
  } catch (err) {
    console.error("ssh: run access", err);
    return null;
  }
}

const describe = (h: HostRow) => `- ${h.name} : ${h.username}@${h.host}${h.port !== 22 ? `:${h.port}` : ""}${h.description ? ` — ${h.description}` : ""}`;

export const sshNote = (hosts: HostRow[]) =>
  hosts.length > 0 &&
  [
    "Tu peux te connecter en SSH à ces machines, par leur nom :",
    ...hosts.map(describe),
    "`ssh <nom> 'commande'`, scp, sftp, rsync et git fonctionnent directement : la clé est dans ton ssh-agent, l'empreinte de chaque machine est déjà vérifiée. N'écris jamais de clé, ne modifie pas ~/.ssh et n'accepte jamais une nouvelle empreinte. Pas de session interactive : passe toujours la commande à ssh.",
  ].join("\n");

/* ---------- running a command for a bot ---------- */

const MAX_OUTPUT = 60_000;
const tail = (s: string) => (s.length > MAX_OUTPUT ? { text: `…${s.slice(-MAX_OUTPUT)}`, truncated: true } : { text: s, truncated: false });

export type SshRunResult = { host: string; exit_code: number | null; stdout: string; stderr: string; truncated: boolean; timed_out: boolean };

/** Runs one command on a machine the bot may reach, and logs it. */
export async function runOnHost(actor: Actor, name: string, command: string, opts: { timeoutSeconds?: number; stdin?: string } = {}): Promise<SshRunResult> {
  const host = (await hostsFor(actor.agentId)).find((h) => h.name === name);
  if (!host) throw new SshError(`No machine named "${name}" for this bot. Call ssh_hosts to see the ones you may use.`, 404);
  const access = await openSsh([host]);
  try {
    const timeoutMs = Math.min(Math.max(opts.timeoutSeconds ?? 120, 1), 600) * 1000;
    const out = await exec([bin("ssh"), "-F", access.config, "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "--", host.name, command], {
      env: access.env(childEnv()),
      stdin: opts.stdin ?? "",
      timeoutMs,
    });
    await log([host], actor, command, out.code).catch((err) => console.error("ssh: log", err));
    const stdout = tail(out.stdout);
    const stderr = tail(out.stderr);
    return { host: host.name, exit_code: out.code, stdout: stdout.text, stderr: stderr.text, truncated: stdout.truncated || stderr.truncated, timed_out: out.timedOut };
  } finally {
    await access.dispose();
  }
}

/** What a bot sees of its machines. */
export const botHosts = async (agentId: string | null) =>
  (await hostsFor(agentId)).map((h) => ({ name: h.name, address: `${h.username}@${h.host}${h.port !== 22 ? `:${h.port}` : ""}`, description: h.description }));

/* ---------- set up by an agent ---------- */

const installCommand = (publicKey: string) =>
  `mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '${publicKey}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`;

/**
 * An agent declares a machine, as an admin would (Théo's choice, 2026-11-13): every bot reaches it once
 * tested. It gets the public key to install there, then calls `testHostForAgent`.
 */
export async function addHostForAgent(actor: Actor, input: { name?: unknown; host?: unknown; port?: unknown; username?: unknown; description?: unknown }) {
  const parsed = hostInput.safeParse({ ...input, port: input.port ?? 22, excludedAgentIds: [] });
  if (!parsed.success)
    throw new SshError("Invalid machine. name: lowercase letters, digits and dashes (e.g. prod-web); host: a host name or IP, without user or port; username: the account on the machine; port: 1-65535.");
  const created = await createHost(parsed.data, actor.userId);
  const [row] = await db.select().from(sshHost).where(eq(sshHost.id, created.id));
  await log([row!], actor, "# ssh_add_host", null).catch((err) => console.error("ssh: log", err));
  return {
    name: created.name,
    address: `${created.username}@${created.host}${created.port !== 22 ? `:${created.port}` : ""}`,
    public_key: created.publicKey,
    install_command: installCommand(created.publicKey),
    next: `Add public_key to ~/.ssh/authorized_keys of ${created.username} on the machine (install_command does it, run there by any access you already have, or ask the person to), then call ssh_test_host. The machine is usable once a test succeeded.`,
  };
}

/** An agent tests a machine it may use, tested or not; a first success pins its host key. */
export async function testHostForAgent(actor: Actor, name: string): Promise<{ result: SshTestResult; host: HostRow | null }> {
  const [h] = await db.select().from(sshHost).where(eq(sshHost.name, name));
  if (!h || (actor.agentId && h.excludedAgentIds.includes(actor.agentId))) throw new SshError(`No machine named "${name}" for this bot.`, 404);
  const result = await testHost(h.id);
  const [fresh] = result.ok ? await db.select().from(sshHost).where(eq(sshHost.id, h.id)) : [];
  return { result, host: fresh ?? null };
}

/* ---------- administration ---------- */

export async function listHosts(): Promise<SshHostDto[]> {
  return (await db.select().from(sshHost).orderBy(sshHost.name)).map(dto);
}

async function getHost(id: string) {
  const [h] = await db.select().from(sshHost).where(eq(sshHost.id, id));
  if (!h) throw new SshError("Machine not found", 404);
  return h;
}

async function nameFree(name: string, except?: string) {
  const [other] = await db.select({ id: sshHost.id }).from(sshHost).where(eq(sshHost.name, name));
  if (other && other.id !== except) throw new SshError("A machine already has this name", 409);
}

export async function createHost(input: z.infer<typeof hostInput>, by: string | null): Promise<SshHostDto> {
  await nameFree(input.name);
  const id = crypto.randomUUID();
  const key = await generateKey(`agora-${input.name}`);
  const [row] = await db
    .insert(sshHost)
    .values({ id, ...input, publicKey: key.publicKey, privateKey: seal(key.privateKey), createdBy: by })
    .returning();
  return dto(row!);
}

export async function updateHost(id: string, patch: z.infer<typeof hostPatch>): Promise<SshHostDto> {
  const h = await getHost(id);
  if (patch.name && patch.name !== h.name) await nameFree(patch.name, id);
  // Another address is another machine: its host key is tested again.
  const moved = (patch.host !== undefined && patch.host !== h.host) || (patch.port !== undefined && patch.port !== h.port);
  const [row] = await db
    .update(sshHost)
    .set({ ...patch, ...(moved && { hostKeys: null, hostKeyFingerprint: null }) })
    .where(eq(sshHost.id, id))
    .returning();
  return dto(row!);
}

export async function deleteHost(id: string) {
  await getHost(id);
  await db.delete(sshHost).where(eq(sshHost.id, id));
}

/** Forgets the pinned host key (the machine was reinstalled): the next test pins the new one. */
export async function forgetHostKey(id: string): Promise<SshHostDto> {
  await getHost(id);
  const [row] = await db.update(sshHost).set({ hostKeys: null, hostKeyFingerprint: null }).where(eq(sshHost.id, id)).returning();
  return dto(row!);
}

/** The machine's host keys, as known_hosts lines under its alias, and the fingerprint of the strongest. */
async function scan(h: HostRow) {
  const out = await exec([bin("ssh-keyscan"), "-T", "10", "-p", String(h.port), "-t", "ed25519,ecdsa,rsa", h.host], { timeoutMs: 20_000 });
  const lines = out.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => [alias(h), ...l.split(/\s+/).slice(1)].join(" "));
  if (!lines.length) throw new SshError(`The machine didn't answer on ${h.host}:${h.port}.`);
  const dir = await mkdtemp(join("/tmp", "agora-sshscan-"));
  try {
    const file = join(dir, "known_hosts");
    await writeFile(file, `${lines.join("\n")}\n`);
    const fp = await exec([bin("ssh-keygen"), "-l", "-f", file], { timeoutMs: 10_000 });
    const prints = fp.stdout.split("\n").filter(Boolean);
    const best = prints.find((l) => /ED25519/.test(l)) ?? prints.find((l) => /ECDSA/.test(l)) ?? prints[0];
    return { keys: lines.join("\n"), fingerprint: best?.split(/\s+/)[1] ?? "" };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Connects with Agora's key. A machine without a pinned key is scanned first, and its key is pinned
 * once the connection worked; a pinned one must still present it.
 */
export async function testHost(id: string): Promise<SshTestResult> {
  const h = await getHost(id);
  let fresh: { keys: string; fingerprint: string } | null = null;
  try {
    if (!h.hostKeys) fresh = await scan(h);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  const access = await openSsh([h], fresh ? new Map([[h.id, fresh.keys]]) : undefined);
  try {
    const out = await exec([bin("ssh"), "-F", access.config, "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "--", h.name, "true"], {
      env: access.env(childEnv()),
      timeoutMs: 30_000,
    });
    if (out.code !== 0) return { ok: false, error: explain(out) };
    if (fresh) await db.update(sshHost).set({ hostKeys: fresh.keys, hostKeyFingerprint: fresh.fingerprint }).where(eq(sshHost.id, id));
    return { ok: true, fingerprint: fresh?.fingerprint ?? h.hostKeyFingerprint ?? "" };
  } finally {
    await access.dispose();
  }
}

function explain(out: Out) {
  const err = out.stderr;
  if (out.timedOut) return "The connection timed out.";
  if (/REMOTE HOST IDENTIFICATION HAS CHANGED|Host key verification failed/i.test(err)) return "The machine's host key changed. If it was reinstalled, forget its fingerprint and test again.";
  if (/Permission denied/i.test(err)) return "Permission denied: add the public key to ~/.ssh/authorized_keys of this user on the machine.";
  if (/Could not resolve hostname/i.test(err)) return "Unknown host name.";
  if (/Connection refused/i.test(err)) return "Connection refused on this port.";
  if (/timed out/i.test(err)) return "The connection timed out.";
  return err.trim().split("\n").pop() || `ssh exited with ${out.code}`;
}

/** Opens a TCP connection to the server and reads its SSH banner (`SshProbe`); never authenticates. */
export async function probe(host: string, port: number, timeoutMs = 5000): Promise<SshProbe> {
  if (!HOST.test(host) || !Number.isInteger(port) || port < 1 || port > 65535) return { online: false, error: "Invalid address." };
  const start = performance.now();
  return new Promise<SshProbe>((resolve) => {
    let done = false;
    let buffer = "";
    let socket: { end: () => void } | null = null;
    const finish = (r: SshProbe) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket?.end();
      resolve(r);
    };
    const timer = setTimeout(() => finish({ online: false, error: buffer ? "The server answered but isn't an SSH server." : "The server didn't answer in time." }), timeoutMs);
    Bun.connect({
      hostname: host,
      port,
      socket: {
        open(s) {
          socket = s;
        },
        data(_s, chunk) {
          buffer += new TextDecoder().decode(chunk);
          const line = buffer.split(/\r?\n/).find((l) => l.startsWith("SSH-"));
          if (line) finish({ online: true, banner: line.trim().slice(0, 200), latencyMs: Math.round(performance.now() - start) });
          else if (buffer.length > 4096) finish({ online: false, error: "The server answered but isn't an SSH server." });
        },
        close() {
          finish({ online: false, error: "The server closed the connection." });
        },
        connectError(_s, err) {
          const code = (err as { code?: string }).code ?? "";
          finish({
            online: false,
            error: /ENOTFOUND|EAI_|DNS/i.test(code + err.message) ? "Unknown host name." : /REFUSED/i.test(code + err.message) ? "Connection refused on this port." : err.message,
          });
        },
        error(_s, err) {
          finish({ online: false, error: err.message });
        },
      },
    }).catch((err: Error & { code?: string }) =>
      finish({
        online: false,
        error: /ENOTFOUND|EAI_|DNS/i.test(`${err.code ?? ""}${err.message}`) ? "Unknown host name." : /REFUSED/i.test(`${err.code ?? ""}${err.message}`) ? "Connection refused on this port." : err.message,
      }),
    );
  });
}

/** Every machine's server status, probed in parallel. */
export async function hostsStatus(): Promise<Record<string, SshProbe>> {
  const rows = await db.select({ id: sshHost.id, host: sshHost.host, port: sshHost.port }).from(sshHost);
  const results = await Promise.all(rows.map(async (h) => [h.id, await probe(h.host, h.port)] as const));
  return Object.fromEntries(results);
}

export async function hostLog(id: string, limit = 30): Promise<SshLogEntry[]> {
  await getHost(id);
  const rows = await db
    .select({ id: sshLog.id, agentId: sshLog.agentId, agentName: agent.name, userName: user.name, command: sshLog.command, exitCode: sshLog.exitCode, at: sshLog.at })
    .from(sshLog)
    .leftJoin(agent, eq(agent.id, sshLog.agentId))
    .leftJoin(user, eq(user.id, sshLog.userId))
    .where(and(eq(sshLog.hostId, id)))
    .orderBy(desc(sshLog.at))
    .limit(limit);
  return rows.map((r) => ({ ...r, at: r.at.toISOString() }));
}
