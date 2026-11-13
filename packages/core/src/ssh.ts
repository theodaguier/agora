/**
 * Machines SSH (apps/api ssh.ts): remote machines an admin declares once, that every bot and every
 * code session can reach. Agora makes an ed25519 key for each machine and keeps its private half
 * sealed; the admin adds the public half to the machine's authorized_keys. The machine's host key
 * is pinned at the first successful test.
 */

/** A machine's name, as the agents type it (`ssh <name>`): lowercase, digits, dashes. */
export const SSH_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;

export type SshHostDto = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  /** What it is for, shown to the agents. */
  description: string;
  /** The line to add to the machine's ~/.ssh/authorized_keys. */
  publicKey: string;
  /** SHA256 fingerprint of the pinned host key; null until the first successful test. */
  hostKeyFingerprint: string | null;
  /** Bots that may not use it; every other bot may. */
  excludedAgentIds: string[];
  lastUsedAt: string | null;
  createdAt: string;
};

export type SshTestResult = { ok: true; fingerprint: string } | { ok: false; error: string };

export type SshLogEntry = {
  id: string;
  agentId: string | null;
  agentName: string | null;
  /** The person whose turn it was, if any. */
  userName: string | null;
  /** The command run; null when the run opened the machine for a code session (its commands aren't seen). */
  command: string | null;
  exitCode: number | null;
  at: string;
};
