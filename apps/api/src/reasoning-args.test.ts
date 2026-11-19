import { describe, expect, test } from "bun:test";
import { reasoningArgs } from "./claude-code";
import { codexReasoningArgs } from "./codex";

describe("effort and fast mode on the CLIs", () => {
  test("Claude Code: --effort, and the fast mode through the flag settings", () => {
    expect(reasoningArgs(undefined)).toEqual([]);
    expect(reasoningArgs({ effort: null, fast: false })).toEqual([]);
    expect(reasoningArgs({ effort: "xhigh", fast: true })).toEqual(["--effort", "xhigh", "--settings", '{"fastMode":true}']);
  });

  test("Codex: model_reasoning_effort and the priority tier, as TOML strings", () => {
    expect(codexReasoningArgs({ effort: null, fast: false })).toEqual([]);
    expect(codexReasoningArgs({ effort: "high", fast: true })).toEqual(["-c", 'model_reasoning_effort="high"', "-c", 'service_tier="priority"']);
  });
});
