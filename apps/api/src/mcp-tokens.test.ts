import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "./env";
import { shareMcpTokens } from "./hermes-admin";

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
