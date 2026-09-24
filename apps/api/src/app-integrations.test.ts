import { describe, expect, test } from "bun:test";
import { brandDomain } from "./routes/integrations";

describe("brand of an MCP server", () => {
  test("the service's domain, without the MCP host prefix", () => {
    expect(brandDomain("https://mcp.pennylane.com/sse")).toBe("pennylane.com");
    expect(brandDomain("https://api.github.com/mcp")).toBe("github.com");
    expect(brandDomain("https://linear.app/mcp")).toBe("linear.app");
  });

  test("no domain for local or missing URLs", () => {
    expect(brandDomain(null)).toBeNull();
    expect(brandDomain("http://localhost:8080/mcp")).toBeNull();
    expect(brandDomain("http://127.0.0.1:3000")).toBeNull();
    expect(brandDomain("not a url")).toBeNull();
  });
});

describe("brand logo cache key", () => {
  test("valid domains and names are normalized", async () => {
    const { brandKey } = await import("./brand-logos");
    expect(brandKey({ domain: "Pennylane.com " })).toBe("d:pennylane.com");
    expect(brandKey({ name: "Google   Calendar" })).toBe("n:google calendar");
  });

  test("anything else never reaches logo.dev", async () => {
    const { brandKey } = await import("./brand-logos");
    expect(brandKey({ domain: "localhost" })).toBeNull();
    expect(brandKey({ domain: "evil.com/../x" })).toBeNull();
    expect(brandKey({ name: "a/b?token=x" })).toBeNull();
  });
});
