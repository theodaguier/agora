import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { redactMcpError } from "./mcp-secrets";

/** Probe stdio directly so a startup error includes useful, redacted stderr instead of Connection closed. */
export async function probeStdio(server: { command: string; args: string[]; env: Record<string, string> }, cwd?: string) {
  const client = new Client({ name: "agora-connection-test", version: "1" });
  const transport = new StdioClientTransport({ ...server, cwd, stderr: "pipe" });
  let stderr = "";
  let overflow = false;
  transport.stderr?.on("data", (data: Buffer) => {
    if (overflow) return;
    stderr += data.toString();
    // Never truncate a secret before redaction: discard an oversized diagnostic instead.
    if (stderr.length > 64_000) { stderr = ""; overflow = true; }
  });
  try {
    await client.connect(transport, { timeout: 60_000 });
    const tools: { name: string }[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.listTools(cursor ? { cursor } : undefined, { timeout: 30_000 });
      tools.push(...page.tools.map(({ name }) => ({ name })));
      if (page.nextCursor === cursor && cursor) throw new Error("Connector repeated its tools cursor");
      cursor = page.nextCursor;
      if (tools.length > 5000) throw new Error("Connector returned too many tools");
    } while (cursor);
    return { ok: true, tools, error: undefined };
  } catch (err) {
    const detail = stderr.trim() || (err instanceof Error ? err.message : "Connector connection failed");
    return { ok: false, tools: undefined, error: redactMcpError(detail, [...Object.values(server.env), ...server.args]) };
  } finally {
    await client.close().catch(() => {});
  }
}
