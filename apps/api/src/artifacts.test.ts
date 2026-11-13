import { describe, expect, test } from "bun:test";
import { artifactKitCss, withArtifactKit } from "@agora/core";
import { ARTIFACT_CSP, canOpen } from "./artifacts";

describe("artifact access", () => {
  test("shared by link, anyone opens it, even without a session", async () => {
    expect(await canOpen({ conversationId: "c", shareMode: "link" }, null)).toBe(true);
  });

  test("shared with the organization, any session opens it, none doesn't", async () => {
    expect(await canOpen({ conversationId: "c", shareMode: "org" }, "u")).toBe(true);
    expect(await canOpen({ conversationId: "c", shareMode: "org" }, null)).toBe(false);
  });

  test("private, no session never opens it", async () => {
    expect(await canOpen({ conversationId: "c", shareMode: "private" }, null)).toBe(false);
  });
});

describe("artifact page headers", () => {
  test("the page runs sandboxed, without the app's origin, and only the app may frame it", () => {
    const directives = ARTIFACT_CSP.split("; ");
    expect(directives[0]).toStartWith("sandbox ");
    expect(directives[0]).toContain("allow-scripts");
    expect(directives[0]).not.toContain("allow-same-origin");
    expect(directives).toContain("frame-ancestors 'self'");
  });
});

describe("Agora kit", () => {
  test("goes after <head>, ahead of the page's own styles, never before the doctype", () => {
    const out = withArtifactKit("<!doctype html><html><head><style>h1{}</style></head></html>", "dark");
    expect(out.startsWith('<!doctype html><html><head><style id="agora-kit">')).toBe(true);
    expect(out.indexOf("agora-kit")).toBeLessThan(out.indexOf("h1{}"));
    expect(withArtifactKit("<!doctype html><p>x</p>").startsWith("<!doctype html><style")).toBe(true);
  });

  test("one palette when the app gives its theme, the system's otherwise", () => {
    expect(artifactKitCss("dark")).toContain("--background:#17181a");
    expect(artifactKitCss("dark")).not.toContain("prefers-color-scheme");
    expect(artifactKitCss()).toContain("prefers-color-scheme:dark");
  });
});
