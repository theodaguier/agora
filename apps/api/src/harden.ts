/**
 * The API's secrets (database, sessions, updater, Hermes keys) stay in this
 * process. In production the API shares the Hermes container's user and PID
 * namespace (restart signal, shared profile files): any process of that user,
 * an agent's terminal included, could otherwise read them from
 * /proc/<api>/environ or /proc/<api>/mem.
 */
import { dlopen, FFIType } from "bun:ffi";
import { env } from "./env";

/**
 * Linux: the process becomes non-dumpable (prctl PR_SET_DUMPABLE 0). Its
 * /proc/<pid> files then belong to root and ptrace is refused to processes of
 * the same user; the process itself keeps full access to its own. No-op
 * elsewhere, and a failure only logs: the app must start anyway.
 */
export function protectProcess() {
  if (process.platform !== "linux") return;
  const PR_SET_DUMPABLE = 4;
  for (const lib of ["libc.so.6", "libc.musl-x86_64.so.1", "libc.musl-aarch64.so.1"]) {
    try {
      const { symbols, close } = dlopen(lib, {
        prctl: { args: [FFIType.i32, FFIType.u64, FFIType.u64, FFIType.u64, FFIType.u64], returns: FFIType.i32 },
      });
      const rc = symbols.prctl(PR_SET_DUMPABLE, 0, 0, 0, 0);
      close();
      if (rc === 0) return;
      console.error(`harden: prctl(PR_SET_DUMPABLE) returned ${rc}`);
      return;
    } catch {
      // Next libc name.
    }
  }
  console.error("harden: libc not found, the process stays dumpable");
}

/** Variables of the API only: never handed to a child process (hermes CLI, host CLIs, Claude Code). */
const PRIVATE = new Set([
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "HERMES_API_KEY",
  "HERMES_KEY_SECRET",
  "HERMES_DASHBOARD_TOKEN",
  "UPDATER_TOKEN",
  "RESEND_API_KEY",
  "AGORA_SETUP_TOKEN",
  // Handed to Claude Code only (claudeEnv).
  "CLAUDE_CODE_OAUTH_TOKEN",
]);

/** The environment for a child process: this one's, minus the API's secrets, plus `extra`. */
export function childEnv(extra: Record<string, string> = {}) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined || PRIVATE.has(key) || key.startsWith("HERMES_KEY_")) continue;
    out[key] = value;
  }
  return { ...out, ...extra };
}

/** Environment of Claude Code: the owner's subscription token (`claude setup-token`), when set. */
export const claudeEnv = () => {
  const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  return childEnv(token ? { CLAUDE_CODE_OAUTH_TOKEN: token } : {});
};

/** Environment of the `hermes` CLI: the instance root, no colors. */
export const hermesEnv = (extra: Record<string, string> = {}) => childEnv({ HERMES_HOME: env.HERMES_HOME, NO_COLOR: "1", ...extra });
