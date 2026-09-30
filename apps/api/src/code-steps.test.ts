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

  test("the task list follows TaskCreate and TaskUpdate, once their results say they worked", () => {
    const t = new Transcript(CWD);
    const create = (id: string, subject: string, taskId: string) => {
      t.apply(assistant(`msg_${id}`, [{ type: "tool_use", id, name: "TaskCreate", input: { subject, activeForm: `Doing ${subject}` } }]));
      return t.apply({ ...toolResult(id, `Task #${taskId} created successfully: ${subject}`), tool_use_result: { task: { id: taskId, subject } } });
    };
    expect(create("toolu_c1", "Write the test", "1").todos).toEqual([{ id: "1", content: "Write the test", activeForm: "Doing Write the test", status: "pending" }]);
    create("toolu_c2", "Fix the bug", "2");
    t.apply(assistant("msg_u1", [{ type: "tool_use", id: "toolu_u1", name: "TaskUpdate", input: { taskId: "1", status: "in_progress" } }]));
    // Not applied before its result.
    expect(t.todos.map((x) => x.status)).toEqual(["pending", "pending"]);
    expect(t.apply(toolResult("toolu_u1", "Updated task #1 status")).todos?.map((x) => x.status)).toEqual(["in_progress", "pending"]);
    // A failed update changes nothing.
    t.apply(assistant("msg_u2", [{ type: "tool_use", id: "toolu_u2", name: "TaskUpdate", input: { taskId: "2", status: "completed" } }]));
    expect(t.apply(toolResult("toolu_u2", "No such task", true)).todos).toBeUndefined();
    // Finished, the next task created starts a new list.
    for (const [id, taskId] of [["toolu_u3", "1"], ["toolu_u4", "2"]] as const) {
      t.apply(assistant(`msg_${id}`, [{ type: "tool_use", id, name: "TaskUpdate", input: { taskId, status: "completed" } }]));
      t.apply(toolResult(id, "Updated"));
    }
    expect(create("toolu_c3", "Open the PR", "3").todos?.map((x) => x.content)).toEqual(["Open the PR"]);
  });

  test("TodoWrite replaces the task list", () => {
    const t = new Transcript(CWD, [], [{ id: "9", content: "Old", status: "pending" }]);
    const todos = [
      { content: "Write the test", status: "completed", activeForm: "Writing the test" },
      { content: "Fix the bug", status: "in_progress", activeForm: "Fixing the bug" },
    ];
    t.apply(assistant("msg_t", [{ type: "tool_use", id: "toolu_t", name: "TodoWrite", input: { todos } }]));
    expect(t.apply(toolResult("toolu_t", "Todos have been modified successfully")).todos).toEqual([
      { id: "1", content: "Write the test", activeForm: "Writing the test", status: "completed" },
      { id: "2", content: "Fix the bug", activeForm: "Fixing the bug", status: "in_progress" },
    ]);
  });

  test("permission mode and skills from the init and status events", () => {
    const t = new Transcript(CWD);
    expect(t.apply({ type: "system", subtype: "init", session_id: "s", model: null, permissionMode: "plan", skills: ["hello"] })).toMatchObject({
      init: { sessionId: "s", model: null, skills: ["hello"] },
      mode: "plan",
    });
    expect(t.apply({ type: "system", subtype: "status", status: null, permissionMode: "bypassPermissions" }).mode).toBe("bypassPermissions");
    expect(t.apply({ type: "system", subtype: "status", status: null, permissionMode: "weird" }).mode).toBeUndefined();
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

  test("skills, questions and plans read as themselves", () => {
    expect(describeTool("Skill", { skill: "code-review", args: "high" }, CWD)).toEqual({ title: "/code-review high" });
    expect(
      describeTool("AskUserQuestion", { questions: [{ question: "Which color?", header: "Color", options: [{ label: "Red", description: "Warm" }, { label: "Blue" }] }] }, CWD),
    ).toEqual({ title: "Which color?", input: "Which color?\n- Red — Warm\n- Blue" });
    expect(describeTool("ExitPlanMode", { plan: "# Add the login page\n\n1. Route" }, CWD)).toEqual({ title: "Add the login page", input: "# Add the login page\n\n1. Route" });
    expect(describeTool("TaskUpdate", { taskId: "2", status: "completed" }, CWD)).toEqual({ title: "#2 · completed" });
    // Its usual sections are not its title.
    expect(describeTool("ExitPlanMode", { plan: "# Context\nWhy.\n# Plan\n1. Do" }, CWD).title).toBe("ExitPlanMode");
    expect(describeTool("ExitPlanMode", { plan: "## Context\n## Rename the API routes" }, CWD).title).toBe("Rename the API routes");
  });

  test("unknown tools (MCP) show their input", () => {
    expect(describeTool("mcp__github__create_pr", { title: "Fix" }, CWD)).toEqual({ title: "mcp__github__create_pr", input: '{\n  "title": "Fix"\n}' });
  });
});
