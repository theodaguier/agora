import { describe, expect, test } from "bun:test";
import { describeTool, Transcript } from "./code-steps";

const CWD = "/work/projects/app";

/** Events as `claude -p --output-format stream-json --verbose --include-partial-messages` prints them (CLI 2.1). */
const stream = (event: object, parent: string | null = null) => ({ type: "stream_event", event, parent_tool_use_id: parent });
const assistant = (id: string, content: object[], parent: string | null = null) => ({ type: "assistant", message: { id, content }, parent_tool_use_id: parent });
const toolResult = (id: string, content: unknown, isError = false) => ({
  type: "user",
  message: { role: "user", content: [{ tool_use_id: id, type: "tool_result", content, is_error: isError }] },
});

describe("Transcript", () => {
  test("streams text, then the full message confirms it without a duplicate", () => {
    const t = new Transcript(CWD);
    t.apply(stream({ type: "message_start", message: { id: "msg_1" } }));
    t.apply(stream({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }));
    t.apply(stream({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "I'll run " } }));
    const change = t.apply(stream({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "the tests." } }));
    expect(change.steps).toEqual([{ id: "msg_1:0", kind: "text", text: "I'll run the tests." }]);
    t.apply(assistant("msg_1", [{ type: "text", text: "I'll run the tests." }]));
    expect(t.steps).toEqual([{ id: "msg_1:0", kind: "text", text: "I'll run the tests." }]);
  });

  test("a tool call gets its title and detail, then its result", () => {
    const t = new Transcript(CWD);
    t.apply(stream({ type: "message_start", message: { id: "msg_2" } }));
    t.apply(stream({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_1", name: "Bash", input: {} } }));
    expect(t.get("toolu_1")).toMatchObject({ kind: "tool", name: "Bash", status: "running" });
    t.apply(assistant("msg_2", [{ type: "tool_use", id: "toolu_1", name: "Bash", input: { command: "bun test", description: "Run the tests" } }]));
    expect(t.get("toolu_1")).toMatchObject({ title: "Run the tests", input: "$ bun test", status: "running" });
    t.apply(toolResult("toolu_1", "3 pass\n0 fail"));
    expect(t.get("toolu_1")).toMatchObject({ output: "3 pass\n0 fail", status: "done" });
  });

  test("a refused call stays refused whatever its result says", () => {
    const t = new Transcript(CWD);
    t.apply(assistant("msg_3", [{ type: "tool_use", id: "toolu_2", name: "Bash", input: { command: "rm -rf build" } }]));
    t.deny("toolu_2");
    t.apply(toolResult("toolu_2", "The user denied this action.", true));
    expect(t.get("toolu_2")).toMatchObject({ status: "denied" });
  });

  test("subagent steps (not streamed) hang under their Task call", () => {
    const t = new Transcript(CWD);
    t.apply(assistant("msg_4", [{ type: "tool_use", id: "toolu_task", name: "Task", input: { description: "Explore the auth module", prompt: "Find…" } }]));
    t.apply(assistant("msg_sub", [{ type: "text", text: "Looking at auth." }], "toolu_task"));
    t.apply(assistant("msg_sub", [{ type: "tool_use", id: "toolu_sub", name: "Read", input: { file_path: `${CWD}/src/auth.ts` } }], "toolu_task"));
    expect(t.steps.map((s) => [s.kind, "parentId" in s ? s.parentId : undefined])).toEqual([
      ["tool", undefined],
      ["text", "toolu_task"],
      ["tool", "toolu_task"],
    ]);
    expect(t.get("toolu_sub")).toMatchObject({ title: "src/auth.ts" });
  });

  test("tool results made of blocks keep their text", () => {
    const t = new Transcript(CWD);
    t.apply(assistant("msg_5", [{ type: "tool_use", id: "toolu_3", name: "WebFetch", input: { url: "https://example.com" } }]));
    t.apply(toolResult("toolu_3", [{ type: "text", text: "Example Domain" }, { type: "image" }]));
    expect(t.get("toolu_3")).toMatchObject({ output: "Example Domain\n[image]", status: "done" });
  });

  test("activity, usage limit, init and result", () => {
    const t = new Transcript(CWD);
    expect(t.apply({ type: "system", subtype: "init", session_id: "s-1", model: "claude-opus-5-5" }).init).toEqual({ sessionId: "s-1", model: "claude-opus-5-5" });
    expect(t.apply({ type: "system", subtype: "task_summary", detail: "Writing hello.txt" }).activity).toBe("Writing hello.txt");
    expect(t.apply({ type: "system", subtype: "task_summary", detail: null }).activity).toBeNull();
    expect(t.apply({ type: "system", subtype: "api_retry", attempt: 2, max_retries: 10, error: "rate_limit" }).activity).toBe("Anthropic API: retry 2/10 (rate_limit)");
    expect(
      t.apply({ type: "rate_limit_event", rate_limit_info: { status: "allowed_warning", rateLimitType: "seven_day", utilization: 0.96, resetsAt: 1790474400 } }).limit,
    ).toEqual({ status: "warning", window: "seven_day", utilization: 0.96, resetsAt: new Date(1790474400 * 1000).toISOString() });
    expect(t.apply({ type: "rate_limit_event", rate_limit_info: { status: "allowed" } }).limit).toBeNull();
    const done = { type: "result", subtype: "success", is_error: false, result: "Done." };
    expect(t.apply(done).result).toEqual({ text: "Done.", isError: false, subtype: "success", event: done });
  });

  test("calls still running when the process ends are settled as failed", () => {
    const t = new Transcript(CWD);
    t.apply(assistant("msg_6", [{ type: "tool_use", id: "toolu_4", name: "Bash", input: { command: "sleep 20" } }]));
    expect(t.settle().map((s) => s.id)).toEqual(["toolu_4"]);
    expect(t.get("toolu_4")).toMatchObject({ status: "error" });
  });
});

describe("describeTool", () => {
  test("edits read as a diff, paths relative to the session's directory", () => {
    expect(describeTool("Edit", { file_path: `${CWD}/a.txt`, old_string: "hi", new_string: "hello" }, CWD)).toEqual({ title: "a.txt", input: "- hi\n+ hello" });
    expect(describeTool("Read", { file_path: "/etc/hosts" }, CWD)).toEqual({ title: "/etc/hosts" });
  });

  test("the todo list shows where it stands", () => {
    const todos = [
      { content: "Write the test", status: "completed", activeForm: "Writing the test" },
      { content: "Fix the bug", status: "in_progress", activeForm: "Fixing the bug" },
      { content: "Open the PR", status: "pending", activeForm: "Opening the PR" },
    ];
    expect(describeTool("TodoWrite", { todos }, CWD)).toEqual({ title: "Fixing the bug", input: "[x] Write the test\n[~] Fix the bug\n[ ] Open the PR" });
  });

  test("unknown tools (MCP) show their input", () => {
    expect(describeTool("mcp__github__create_pr", { title: "Fix" }, CWD)).toEqual({ title: "mcp__github__create_pr", input: '{\n  "title": "Fix"\n}' });
  });
});
