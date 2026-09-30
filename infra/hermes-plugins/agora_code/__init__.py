"""agora_code — Claude Code sessions an agent starts from a conversation.

The agent does not run the `claude` CLI itself: it asks the Agora API, which
runs it (apps/api/src/code-sessions.ts). Every step Claude Code takes shows up
live in the conversation; its owner can write to it while it works, approve
or deny the actions it asks about, and stop it.

    claude_code_start(task, title, repo, branch, project, model)   start, then wait
    claude_code_wait(session_id)                     wait for it to finish its work
    claude_code_send(session_id, message)            another instruction, then wait
    claude_code_stop(session_id)

A session can ask the agent a question while it works (its ask_bot tool):
claude_code_wait returns on it (`question`), and claude_code_send answers it.

The API listens on 127.0.0.1 (same network as the gateway) and wrote its URL
and a token to `<root HERMES_HOME>/agora-code/api.json` when it started. Each
call names the Hermes session it comes from: the API only starts or drives a
session during a turn the subscription's owner started.
"""

from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

TOOLSET = "agora_code"
POLL_SECONDS = 3
DEFAULT_WAIT_MINUTES = 10
MAX_WAIT_MINUTES = 30


def _root_home() -> Path:
    from hermes_constants import get_hermes_home

    home = get_hermes_home()
    return home.parent.parent if home.parent.name == "profiles" else home


def _api() -> Dict[str, str]:
    return json.loads((_root_home() / "agora-code" / "api.json").read_text())


def _call(method: str, path: str, body: Optional[dict] = None, query: Optional[dict] = None) -> dict:
    api = _api()
    url = api["url"] + path + (("?" + urllib.parse.urlencode(query)) if query else "")
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {api['token']}",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return json.loads(res.read() or b"{}")
    except urllib.error.HTTPError as err:
        try:
            payload = json.loads(err.read() or b"{}")
        except ValueError:
            payload = {}
        raise RuntimeError(payload.get("message") or payload.get("detail") or payload.get("error") or f"HTTP {err.code}") from None


def _interrupted() -> bool:
    try:
        from tools.interrupt import is_interrupted

        return is_interrupted()
    except Exception:
        return False


def _minutes(args: dict) -> float:
    try:
        value = float(args.get("timeout_minutes", DEFAULT_WAIT_MINUTES))
    except (TypeError, ValueError):
        value = DEFAULT_WAIT_MINUTES
    return max(0.0, min(value, MAX_WAIT_MINUTES))


def _report(report: dict) -> str:
    status = report.get("status")
    if report.get("question"):
        report["note"] = ("Claude Code is asking you a question (`question.text`) and waits for your answer before it "
                          "goes on. Answer it with claude_code_send: your message is the answer it gets. If the decision "
                          "belongs to the user, ask them first, then answer.")
    elif status == "running":
        report["note"] = ("Claude Code is still working. The members follow it live in the conversation. "
                          "Call claude_code_wait again to keep waiting, or answer the user now.")
    elif status == "waiting":
        report["note"] = ("Claude Code is waiting for its owner, in the conversation's Claude Code card: to approve an "
                          "action, answer its questions or approve its plan (`approval.kind`: tool, question or plan). "
                          "Tell them what it asks, then call claude_code_wait.")
    elif status == "idle":
        report["note"] = ("Claude Code finished what it was asked: `result` is its answer. Check it before reporting; "
                          "send a follow-up with claude_code_send if something is missing. `history` lists every "
                          "instruction (the owner's from the panel too) and git action; `git` is where its branch stands.")
    elif status == "done":
        report["note"] = ("The session's pull request is merged: its task is over. Report its result; any further "
                          "work goes into a new session with claude_code_start.")
    elif status == "stopped":
        report["note"] = "The session was stopped. Do not restart it unless the user asks."
    elif status == "failed":
        report["note"] = "The session failed: say so plainly, with the error from its last steps."
    return json.dumps(report, ensure_ascii=False)


def _wait(session_id: str, hermes_session: str, minutes: float, report: Optional[dict] = None) -> str:
    deadline = time.monotonic() + minutes * 60
    while True:
        if report is None or report.get("status") == "running":
            report = _call("GET", f"/sessions/{urllib.parse.quote(session_id)}", query={"hermes_session": hermes_session})
        if report.get("status") != "running" or report.get("question") or time.monotonic() >= deadline or _interrupted():
            return _report(report)
        time.sleep(POLL_SECONDS)
        report = None


def _error(message: str) -> str:
    return json.dumps({"success": False, "error": message}, ensure_ascii=False)


def claude_code_start(args: dict, session_id: str = "", **_: Any) -> str:
    task = str(args.get("task") or "").strip()
    if not task:
        return _error("task is required")
    body = {"hermes_session": session_id, "task": task}
    for key in ("title", "repo", "branch", "project", "model"):
        if args.get(key):
            body[key] = str(args[key])
    try:
        report = _call("POST", "/sessions", body)
        if args.get("wait", True) is False:
            return _report(report)
        return _wait(report["session_id"], session_id, _minutes(args), report)
    except Exception as exc:
        return _error(str(exc))


def claude_code_wait(args: dict, session_id: str = "", **_: Any) -> str:
    target = str(args.get("session_id") or "")
    if not target:
        return _error("session_id is required")
    try:
        return _wait(target, session_id, _minutes(args))
    except Exception as exc:
        return _error(str(exc))


def claude_code_send(args: dict, session_id: str = "", **_: Any) -> str:
    target = str(args.get("session_id") or "")
    message = str(args.get("message") or "").strip()
    if not target or not message:
        return _error("session_id and message are required")
    try:
        report = _call("POST", f"/sessions/{urllib.parse.quote(target)}/messages", {"hermes_session": session_id, "text": message})
        if args.get("wait", True) is False:
            return _report(report)
        return _wait(target, session_id, _minutes(args))
    except Exception as exc:
        return _error(str(exc))


def claude_code_stop(args: dict, session_id: str = "", **_: Any) -> str:
    target = str(args.get("session_id") or "")
    if not target:
        return _error("session_id is required")
    try:
        return _report(_call("POST", f"/sessions/{urllib.parse.quote(target)}/stop", {"hermes_session": session_id}))
    except Exception as exc:
        return _error(str(exc))


_WAIT = {
    "type": "number",
    "description": f"How long to wait for Claude Code before this call returns (default {DEFAULT_WAIT_MINUTES}, max {MAX_WAIT_MINUTES}). It keeps working after.",
    "minimum": 0,
    "maximum": MAX_WAIT_MINUTES,
}

START = {
    "name": "claude_code_start",
    "description": (
        "Delegate a coding task to a Claude Code agent running on the server, on its owner's Claude subscription. "
        "Never run or install the `claude` CLI in a terminal: use this. Every step it takes (files read and edited, "
        "commands, results) is shown live to the conversation's members, and its owner can talk to it and stop it. "
        "It runs without permission prompts (files, commands, network): write its brief accordingly. When it stops on "
        "its subscription's limit, its owner can move it to another Claude account from its panel. For work on a GitHub repository, pass `repo`: Agora gives the session a git worktree of its own, "
        "from a clone of the repository shared by its sessions, on a working branch, with the project's credentials (.env) already in place, "
        "using the organization's GitHub access; Claude Code can then commit, push and use `gh`, and the owner can commit, "
        "push, open and merge the pull request from the session's panel. Do not copy code into its directory yourself. "
        "Once started, the session does the work: do not do it yourself in parallel; follow it with claude_code_wait. "
        "One session per task: a new issue or feature gets its own session, with a title naming it, even on the "
        "same repository (each gets its own worktree, sessions on one repository never get in each other's way); claude_code_send is only for following up on "
        "the task a session was started for. Start several sessions for independent tasks. Write a complete brief: goal, constraints, how to check the "
        "result. Waits for it to finish, then returns its answer and the actions it took. Only available in replies "
        "to the subscription's owner."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "task": {"type": "string", "description": "The full brief for Claude Code."},
            "title": {"type": "string", "description": "Short title shown in the conversation (a few words)."},
            "repo": {"type": "string", "description": "GitHub repository to work on: owner/name or its URL. The session works in a worktree of its own, made before Claude Code starts."},
            "branch": {
                "type": "string",
                "description": "Branch of `repo` to work on: checked out when it exists on GitHub, created from the default "
                               "branch otherwise. Default: a new branch named after the session.",
            },
            "project": {
                "type": "string",
                "description": "Name of a directory on the server (letters, digits, . _ -). When it holds a clone of a GitHub "
                               "repository, the session gets a worktree of that clone of its own, as with `repo`; otherwise the sessions "
                               "with the same project share the directory. Default: a new directory.",
            },
            "model": {"type": "string", "description": "Claude model (alias like opus or sonnet, or a full id). Default: Claude Code's own."},
            "wait": {"type": "boolean", "description": "Wait for the result (default true). False: return right away with its id."},
            "timeout_minutes": _WAIT,
        },
        "required": ["task"],
        "additionalProperties": False,
    },
}

WAIT = {
    "name": "claude_code_wait",
    "description": "Wait for a Claude Code session to finish its current work (or to need an approval, or to ask you a question), then return its status, answer and recent actions.",
    "parameters": {
        "type": "object",
        "properties": {"session_id": {"type": "string"}, "timeout_minutes": _WAIT},
        "required": ["session_id"],
        "additionalProperties": False,
    },
}

SEND = {
    "name": "claude_code_send",
    "description": (
        "Send another instruction to a Claude Code session (it keeps its context): a follow-up or a correction of "
        "the task it was started for. Never a new task (another issue, another feature): start a new session for it "
        "with claude_code_start (it gets a worktree of its own). Refused once its pull request is merged or closed. If it is working, it reads it at its "
        "next step; if it waits on its question to you, the message is your answer. Then waits like claude_code_wait."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "session_id": {"type": "string"},
            "message": {"type": "string"},
            "wait": {"type": "boolean", "description": "Wait for the result (default true)."},
            "timeout_minutes": _WAIT,
        },
        "required": ["session_id", "message"],
        "additionalProperties": False,
    },
}

STOP = {
    "name": "claude_code_stop",
    "description": "Stop a Claude Code session's current work (the command in progress is interrupted).",
    "parameters": {
        "type": "object",
        "properties": {"session_id": {"type": "string"}},
        "required": ["session_id"],
        "additionalProperties": False,
    },
}


def register(ctx) -> None:
    ctx.register_tool(name="claude_code_start", toolset=TOOLSET, schema=START, handler=claude_code_start, emoji="🧑‍💻")
    ctx.register_tool(name="claude_code_wait", toolset=TOOLSET, schema=WAIT, handler=claude_code_wait, emoji="⏳")
    ctx.register_tool(name="claude_code_send", toolset=TOOLSET, schema=SEND, handler=claude_code_send, emoji="💬")
    ctx.register_tool(name="claude_code_stop", toolset=TOOLSET, schema=STOP, handler=claude_code_stop, emoji="⏹")
