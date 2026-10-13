import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeMcpConfig, codexMcpArgs, cursorMcpConfig, engineConnectorsLines, engineMcp, toEngineServer } from "./engine-mcp";
import { env } from "./env";

// env is parsed once for the whole run: point it at a scratch instance, never the real one.
const home = mkdtempSync(join(tmpdir(), "agora-engine-mcp-"));
const realHome = env.HERMES_HOME;
env.HERMES_HOME = home;
afterAll(() => {
  env.HERMES_HOME = realHome;
});

const vars = new Map([
  ["MCP_LINEAR_API_KEY", "lin-secret"],
  ["STRAPI_TOKEN", "strapi-secret"],
  ["MCP_NOTION_CLIENT_SECRET", "notion-secret"],
]);

describe("toEngineServer", () => {
  test("resolves a Bearer header from the .env", () => {
    const server = toEngineServer("linear", { url: "https://mcp.linear.app/mcp", headers: { Authorization: "Bearer ${MCP_LINEAR_API_KEY}" } }, vars);
    expect(server).toMatchObject({ name: "linear", url: "https://mcp.linear.app/mcp", sse: false, headers: { Authorization: "Bearer lin-secret" } });
    expect(server?.oauth).toBeUndefined();
  });

  test("resolves a local server's env, args and tool selection", () => {
    const server = toEngineServer(
      "strapi",
      { command: "npx", args: ["-y", "strapi-mcp@1.2.0"], env: { STRAPI_URL: "https://cms.example.com", STRAPI_TOKEN: "${STRAPI_TOKEN}" }, tools: { exclude: "delete_*" } },
      vars,
    );
    expect(server).toMatchObject({
      name: "strapi",
      command: "npx",
      args: ["-y", "strapi-mcp@1.2.0"],
      env: { STRAPI_URL: "https://cms.example.com", STRAPI_TOKEN: "strapi-secret" },
      exclude: ["delete_*"],
    });
  });

  test("keeps an OAuth server with its client, and an SSE one", () => {
    const notion = toEngineServer(
      "notion",
      { url: "https://mcp.notion.com/mcp", auth: "oauth", oauth: { client_id: "abc", client_secret: "${MCP_NOTION_CLIENT_SECRET}" } },
      vars,
    );
    expect(notion?.oauth).toEqual({ client_id: "abc", client_secret: "notion-secret" });
    expect(toEngineServer("legacy", { url: "https://old.example.com/sse", transport: "sse" }, vars)?.sse).toBe(true);
  });

  test("drops a server whose variable is missing", () => {
    expect(toEngineServer("x", { command: "npx", env: { KEY: "${NOPE}" } }, vars)).toBeNull();
  });
});

describe("engineMcp", () => {
  test("gives the servers enabled for the profile, with its own .env winning", async () => {
    writeFileSync(
      join(home, "config.yaml"),
      [
        "mcp_servers:",
        "  linear:",
        "    url: https://mcp.linear.app/mcp",
        "    headers:",
        "      Authorization: Bearer ${MCP_LINEAR_API_KEY}",
        "  notion:",
        "    url: https://mcp.notion.com/mcp",
        "    auth: oauth",
        "  off:",
        "    command: npx",
        "    enabled: false",
        "  other:",
        "    command: uvx",
      ].join("\n"),
    );
    writeFileSync(join(home, ".env"), "MCP_LINEAR_API_KEY=instance\n");
    const dir = join(home, "profiles", "dev-builder");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "config.yaml"),
      [
        "mcp_servers:",
        "  linear:",
        "    url: https://mcp.linear.app/mcp",
        "    headers:",
        "      Authorization: Bearer ${MCP_LINEAR_API_KEY}",
        "    enabled: true",
        "  notion:",
        "    url: https://mcp.notion.com/mcp",
        "    auth: oauth",
        "    enabled: true",
        "  off:",
        "    command: npx",
        "    enabled: true",
      ].join("\n"),
    );
    writeFileSync(join(dir, ".env"), 'MCP_LINEAR_API_KEY="profile"\n');

    const mcp = await engineMcp("dev-builder");
    expect(mcp.profile).toBe("dev-builder");
    expect(mcp.servers.map((s) => s.name)).toEqual(["linear", "notion"]);
    expect(mcp.servers[0]!.headers).toEqual({ Authorization: "Bearer profile" });
    expect(mcp.servers[1]!.oauth).toEqual({});
  });
});

const mcp = {
  profile: "dev-builder",
  servers: [
    { name: "linear", url: "https://mcp.linear.app/mcp", headers: { Authorization: "Bearer lin-secret" } },
    { name: "strapi", command: "npx", args: ["-y", "strapi-mcp"], env: { STRAPI_TOKEN: "strapi-secret" } },
  ],
};

describe("Claude Code", () => {
  test("points every connector at the gateway, without its secrets, in a private file", async () => {
    const config = await claudeMcpConfig(mcp, { agora: { type: "sdk", name: "agora" } });
    expect(config.args[0]).toBe("--mcp-config");
    const path = config.args[1]!;
    expect(statSync(path).mode & 0o777).toBe(0o600);
    const text = readFileSync(path, "utf8");
    expect(text).not.toContain("lin-secret");
    expect(text).not.toContain("strapi-secret");
    const servers = JSON.parse(text).mcpServers;
    expect(Object.keys(servers)).toEqual(["linear", "strapi", "agora"]);
    expect(servers.strapi).toMatchObject({ type: "http", url: `http://127.0.0.1:${env.PORT}/api/internal/mcp/strapi` });
    expect(servers.strapi.headers.Authorization).toMatch(/^Bearer [0-9a-f]{64}$/);
    expect(config.allowed).toEqual(["mcp__linear", "mcp__strapi"]);
    await config.dispose();
    expect(existsSync(path)).toBe(false);
  });

  test("adds nothing without connectors", async () => {
    expect((await claudeMcpConfig({ profile: "x", servers: [] })).args).toEqual([]);
  });
});

describe("Codex", () => {
  test("points every connector at the gateway, the token in its environment", async () => {
    const { args, env: childEnv, dispose } = codexMcpArgs(mcp);
    const joined = args.join(" ");
    expect(joined).not.toContain("secret");
    expect(args).toContain(`mcp_servers.strapi.url="http://127.0.0.1:${env.PORT}/api/internal/mcp/strapi"`);
    expect(args).toContain('mcp_servers.strapi.bearer_token_env_var="AGORA_MCP_TOKEN"');
    expect(args).toContain('mcp_servers.linear.default_tools_approval_mode="approve"');
    expect(childEnv.AGORA_MCP_TOKEN).toMatch(/^[0-9a-f]{64}$/);
    expect(joined).not.toContain(childEnv.AGORA_MCP_TOKEN!);
    await dispose();
  });
});

describe("Cursor", () => {
  test("adds the connectors to the workspace's file for the run, then puts it back", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "agora-cursor-"));
    mkdirSync(join(cwd, ".cursor"));
    const own = JSON.stringify({ mcpServers: { mine: { command: "x" } } });
    writeFileSync(join(cwd, ".cursor", "mcp.json"), own);
    const config = await cursorMcpConfig(mcp, cwd, async () => true);
    expect(config.args).toEqual(["--approve-mcps"]);
    const during = JSON.parse(readFileSync(join(cwd, ".cursor", "mcp.json"), "utf8"));
    expect(Object.keys(during.mcpServers)).toEqual(["mine", "linear", "strapi"]);
    expect(JSON.stringify(during)).not.toContain("secret");
    expect(during.mcpServers.linear.headers.Authorization).toBe("Bearer ${env:AGORA_MCP_TOKEN}");
    expect(config.env.AGORA_MCP_TOKEN).toMatch(/^[0-9a-f]{64}$/);
    await config.dispose();
    expect(readFileSync(join(cwd, ".cursor", "mcp.json"), "utf8")).toBe(own);
  });

  test("leaves a file the repository tracks alone", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "agora-cursor-"));
    const config = await cursorMcpConfig(mcp, cwd, async () => false);
    expect(config.args).toEqual([]);
    expect(existsSync(join(cwd, ".cursor", "mcp.json"))).toBe(false);
  });
});

describe("engineConnectorsLines", () => {
  test("names the connectors the engine has", () => {
    expect(engineConnectorsLines("claude-code", mcp)[0]).toContain("`strapi` (outils `mcp__strapi__*`)");
    expect(engineConnectorsLines("codex", { profile: "x", servers: [] })[0]).toContain("Aucun connecteur");
  });
});
