import { describe, expect, test } from "bun:test";
import { headlessEngine } from "./code-engines";
import { Transcript } from "./code-steps";

const CWD = "/work/repo";

function feed(engine: "codex" | "cursor", events: object[]) {
  const t = new Transcript(CWD);
  const read = headlessEngine(engine).reader(t, CWD, "gpt-5.5");
  return { t, changes: events.map((ev) => read(ev as Record<string, unknown>)) };
}

describe("codex exec --json", () => {
  // As `codex exec --json` 0.155 prints them.
  const run = [
    { type: "thread.started", thread_id: "01a1035d-376a-7941-967c-ce75ecf1707e" },
    { type: "turn.started" },
    { type: "item.completed", item: { id: "item_0", type: "error", message: "Skill descriptions were shortened" } },
    { type: "item.completed", item: { id: "item_1", type: "agent_message", text: "I’ll create `hello.txt` and run `ls`.\n" } },
    { type: "item.started", item: { id: "item_2", type: "command_execution", command: "/bin/zsh -lc \"printf 'hi' > hello.txt\"", aggregated_output: "", exit_code: null, status: "in_progress" } },
    { type: "item.completed", item: { id: "item_2", type: "command_execution", command: "/bin/zsh -lc \"printf 'hi' > hello.txt\"", aggregated_output: "", exit_code: 0, status: "completed" } },
    { type: "item.completed", item: { id: "item_3", type: "command_execution", command: "/bin/zsh -lc 'npm test'", aggregated_output: "1 failed\n", exit_code: 1, status: "failed" } },
    { type: "item.completed", item: { id: "item_4", type: "file_change", changes: [{ path: "/work/repo/src/a.ts", kind: "update" }], status: "completed" } },
    { type: "item.completed", item: { id: "item_5", type: "todo_list", items: [{ text: "Write", completed: true }, { text: "Test", completed: false }, { text: "Ship", completed: false }] } },
    { type: "item.completed", item: { id: "item_6", type: "agent_message", text: "done" } },
    { type: "turn.completed", usage: { input_tokens: 44239, cached_input_tokens: 33408, output_tokens: 62 } },
  ];

  test("its thread, messages, commands, edits and task list become steps", () => {
    const { t, changes } = feed("codex", run);
    expect(changes[0]!.thread).toBe("01a1035d-376a-7941-967c-ce75ecf1707e");
    const kinds = t.steps.map((s) => (s.kind === "tool" ? `${s.name}:${s.status}` : s.kind));
    expect(kinds).toEqual(["text", "Bash:done", "Bash:error", "Edit:done", "text"]);
    const bash = t.steps[1]!;
    expect(bash.kind === "tool" && bash.input).toBe("$ printf 'hi' > hello.txt");
    const edit = t.steps[3]!;
    expect(edit.kind === "tool" && edit.title).toBe("src/a.ts");
    expect(changes[8]!.todos?.map((x) => x.status)).toEqual(["completed", "in_progress", "pending"]);
  });

  test("its tokens, cached ones apart, on the session's model", () => {
    const { changes } = feed("codex", run);
    expect(changes.at(-1)!.usage).toEqual([{ model: "gpt-5.5", inputTokens: 10831, outputTokens: 62, cacheReadTokens: 33408, cacheWriteTokens: 0, costUsd: 0 }]);
  });

  test("a failed turn ends the run on its error", () => {
    const { changes } = feed("codex", [{ type: "turn.failed", error: { message: "usage limit reached" } }]);
    expect(changes[0]!.result).toEqual({ text: "usage limit reached", isError: true });
  });
});

describe("cursor agent --output-format stream-json", () => {
  const run = [
    { type: "system", subtype: "init", apiKeySource: "login", cwd: CWD, session_id: "c-1", model: "Claude 4 Sonnet", permissionMode: "default" },
    { type: "user", message: { role: "user", content: [{ type: "text", text: "go" }] }, session_id: "c-1" },
    { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Reading " }] }, session_id: "c-1" },
    { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "the file." }] }, session_id: "c-1" },
    { type: "tool_call", subtype: "started", call_id: "t1", tool_call: { readToolCall: { args: { path: "README.md" } } }, session_id: "c-1" },
    {
      type: "tool_call",
      subtype: "completed",
      call_id: "t1",
      tool_call: { readToolCall: { args: { path: "README.md" }, result: { success: { content: "# Hello", isEmpty: false, exceededLimit: false, totalLines: 1, totalChars: 7 } } } },
      session_id: "c-1",
    },
    { type: "tool_call", subtype: "started", call_id: "t2", tool_call: { shellToolCall: { args: { command: "npm test" } } }, session_id: "c-1" },
    { type: "tool_call", subtype: "completed", call_id: "t2", tool_call: { shellToolCall: { args: { command: "npm test" }, result: { success: { exitCode: 1, stdout: "", stderr: "boom" } } } }, session_id: "c-1" },
    { type: "tool_call", subtype: "completed", call_id: "t3", tool_call: { function: { name: "github.create_issue", arguments: '{"title":"x"}' } }, session_id: "c-1" },
    { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Done." }] }, session_id: "c-1" },
    { type: "result", subtype: "success", duration_ms: 1234, duration_api_ms: 1000, is_error: false, result: "Reading the file.Done.", session_id: "c-1" },
  ];

  test("its chat id is kept to resume it, not its model's display name", () => {
    const { changes } = feed("cursor", run);
    expect(changes[0]!.thread).toBe("c-1");
  });

  test("a message's pieces make one step, each call one step updated in place", () => {
    const { t } = feed("cursor", run);
    const kinds = t.steps.map((s) => (s.kind === "tool" ? `${s.name}:${s.status}` : `${s.kind}:${s.kind === "text" ? s.text : ""}`));
    expect(kinds).toEqual(["text:Reading the file.", "Read:done", "Bash:error", "github.create_issue:done", "text:Done."]);
    const shell = t.steps[2]!;
    expect(shell.kind === "tool" && shell.output).toBe("boom");
  });

  test("its result ends the run", () => {
    const { changes } = feed("cursor", run);
    expect(changes.at(-1)!.result).toEqual({ text: "Reading the file.Done.", isError: false, durationMs: 1234 });
  });
});
