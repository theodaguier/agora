import { tmpdir } from "node:os";
import { env } from "./env";
import { readLines } from "./lines";

/**
 * One-shot requests to `codex app-server` (JSON-RPC over stdio): the models the signed-in account
 * can use, and who it is. Starts the server, initializes it, sends the requests, stops it.
 */
export async function codexAppServer<T extends unknown[]>(childEnv: Record<string, string>, requests: { method: string; params?: unknown }[]): Promise<T> {
  const proc = Bun.spawn([env.CODEX_BIN, "app-server"], { cwd: tmpdir(), env: childEnv, stdin: "pipe", stdout: "pipe", stderr: "ignore", timeout: 30_000 });
  const send = (m: object) => {
    proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...m })}\n`);
    proc.stdin.flush();
  };
  const results = new Map<number, unknown>();
  try {
    send({ id: 0, method: "initialize", params: { clientInfo: { name: "agora", version: "1" } } });
    for await (const line of readLines(proc.stdout)) {
      let msg: { id?: number; result?: unknown; error?: { message?: string } };
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (typeof msg.id !== "number") continue;
      if (msg.error) throw new Error(`codex app-server: ${msg.error.message ?? "error"}`);
      if (msg.id === 0) {
        send({ method: "initialized" });
        requests.forEach((r, i) => send({ id: i + 1, method: r.method, params: r.params ?? {} }));
        continue;
      }
      results.set(msg.id, msg.result);
      if (results.size === requests.length) return requests.map((_, i) => results.get(i + 1)) as T;
    }
    throw new Error("codex app-server stopped before answering");
  } finally {
    proc.kill();
  }
}
