import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { probeConfiguredStdio, probeStdio } from "./mcp-probe";

const root = await mkdtemp(join(tmpdir(), "agora-probe-"));
const script = join(root, "server.mjs");
const sdk = dirname(dirname(fileURLToPath(import.meta.resolve("@modelcontextprotocol/sdk/server/mcp.js"))));
await writeFile(script, `
if (process.env.FAIL) { process.stderr.write("Invalid GSC_SERVICE_ACCOUNT_KEY: " + process.env.SECRET); process.exit(1); }
const {McpServer} = await import(process.env.SDK + "/server/mcp.js");
const {StdioServerTransport} = await import(process.env.SDK + "/server/stdio.js");
const server = new McpServer({name:"test",version:"1"});
server.registerTool("read",{},async()=>({content:[{type:"text",text:"ok"}]}));
await server.connect(new StdioServerTransport());
`);
afterAll(() => rm(root, { recursive: true, force: true }));

test("a real stdio handshake and tool list succeeds without calling a tool", async () => {
  expect(await probeStdio({ command: process.execPath, args: [script], env: { SDK: sdk } }, root)).toEqual({ ok: true, tools: [{ name: "read" }], error: undefined });
});
test("a process startup failure exposes its reason without the credential", async () => {
  const result = await probeStdio({ command: process.execPath, args: [script], env: { FAIL: "1", SECRET: "private-value-123" } }, root);
  expect(result.ok).toBe(false);
  expect(result.error).toContain("Invalid GSC_SERVICE_ACCOUNT_KEY");
  expect(result.error).not.toContain("private-value-123");
});

test("the admin stdio probe resolves declared secrets before its real handshake", async () => {
  const result = await probeConfiguredStdio({ cfg: { command: process.execPath, args: [script], env: { SDK: "${SDK_PATH}" } }, env: { SDK_PATH: sdk } }, root);
  expect(result?.ok).toBe(true);
  expect(result?.tools).toEqual([{ name: "read" }]);
});

test("remote and missing declarations keep their dashboard test path", () => {
  expect(probeConfiguredStdio({ cfg: { url: "https://example.invalid/mcp" }, env: {} })).toBeNull();
  expect(probeConfiguredStdio(null)).toBeNull();
});
