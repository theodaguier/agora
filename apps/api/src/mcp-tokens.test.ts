import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "./env";
import { carryMcpSettings, refreshAgentMcp, shareMcpTokens } from "./hermes-admin";

// env is parsed once for the whole run: point it at a scratch instance, never the real one.
const home = mkdtempSync(join(tmpdir(), "agora-mcp-tokens-"));
const realHome = env.HERMES_HOME;
env.HERMES_HOME = home;
afterAll(() => {
  env.HERMES_HOME = realHome;
});

const profile = (name: string) => {
  const dir = join(home, "profiles", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "config.yaml"), "");
  return dir;
};

describe("shareMcpTokens", () => {
  test("links the profile's mcp-tokens to the instance's", async () => {
    const dir = profile("bot-a");
    expect(await shareMcpTokens("bot-a")).toBe(true);
    const link = join(dir, "mcp-tokens");
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readlinkSync(link)).toBe(join("..", "..", "mcp-tokens"));
    expect(realpathSync(link)).toBe(realpathSync(join(home, "mcp-tokens")));
    // Already linked: nothing to do, no restart needed.
    expect(await shareMcpTokens("bot-a")).toBe(false);
  });

  test("moves tokens the profile had on its own, without overwriting the instance's", async () => {
    mkdirSync(join(home, "mcp-tokens"), { recursive: true });
    writeFileSync(join(home, "mcp-tokens", "posthog.json"), "instance");
    const dir = profile("bot-b");
    mkdirSync(join(dir, "mcp-tokens"));
    writeFileSync(join(dir, "mcp-tokens", "posthog.json"), "profile");
    writeFileSync(join(dir, "mcp-tokens", "notion.json"), "profile");
    expect(await shareMcpTokens("bot-b")).toBe(true);
    expect(readFileSync(join(home, "mcp-tokens", "posthog.json"), "utf8")).toBe("instance");
    expect(readFileSync(join(home, "mcp-tokens", "notion.json"), "utf8")).toBe("profile");
    expect(readFileSync(join(dir, "mcp-tokens", "notion.json"), "utf8")).toBe("profile");
  });

  test("leaves the default profile alone", async () => {
    expect(await shareMcpTokens("default")).toBe(false);
    expect(existsSync(join(home, "profiles", "default"))).toBe(false);
  });
});

describe("refreshAgentMcp", () => {
  test("gives the agents that have the server its new declaration and secrets, keeping their on/off", async () => {
    writeFileSync(
      join(home, "config.yaml"),
      "mcp_servers:\n  gsc:\n    command: npx\n    env:\n      SITE_URL: sc-domain:new.example\n    headers:\n      Authorization: Bearer ${MCP_GSC_API_KEY}\n",
    );
    writeFileSync(join(home, ".env"), "MCP_GSC_API_KEY=new\nOTHER=x\n");
    const on = profile("bot-on");
    writeFileSync(join(on, "config.yaml"), "mcp_servers:\n  gsc:\n    command: npx\n    env:\n      SITE_URL: sc-domain:old.example\n    enabled: true\n");
    writeFileSync(join(on, ".env"), "API_SERVER_KEY=k\nMCP_GSC_API_KEY=old\n");
    const off = profile("bot-off");
    writeFileSync(join(off, "config.yaml"), "mcp_servers:\n  gsc:\n    command: npx\n    enabled: false\n");
    const without = profile("bot-without");

    await refreshAgentMcp("gsc");

    expect(readFileSync(join(on, "config.yaml"), "utf8")).toContain("sc-domain:new.example");
    expect(readFileSync(join(on, "config.yaml"), "utf8")).toContain("enabled: true");
    expect(readFileSync(join(on, ".env"), "utf8")).toBe("API_SERVER_KEY=k\nMCP_GSC_API_KEY=new\n");
    expect(readFileSync(join(off, "config.yaml"), "utf8")).toContain("enabled: false");
    expect(readFileSync(join(off, ".env"), "utf8")).toBe("MCP_GSC_API_KEY=new\n");
    expect(readFileSync(join(without, "config.yaml"), "utf8")).toBe("");
  });
});

describe("carryMcpSettings", () => {
  test("keeps an admin's off switch and tool selection on the new declaration", async () => {
    writeFileSync(join(home, "config.yaml"), "mcp_servers:\n  gsc:\n    command: npx\n");
    await carryMcpSettings("gsc", { command: "npx", enabled: false, tools: ["query"] });
    const text = readFileSync(join(home, "config.yaml"), "utf8");
    expect(text).toContain("enabled: false");
    expect(text).toContain("- query");
  });
});
