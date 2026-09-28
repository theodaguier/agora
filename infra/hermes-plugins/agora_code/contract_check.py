"""Hermes contract for the agora_code plugin (apps/api/src/code-sessions.ts).

    python infra/hermes-plugins/agora_code/contract_check.py   # exit code 0 = compatible

Everything happens in a temporary HERMES_HOME: nothing touches the real
instance. The script checks what the plugin depends on:
- loading a user plugin from `$HERMES_HOME/plugins/<name>` once listed in
  `plugins.enabled`, its four tools landing in the `agora_code` toolset;
- tool handlers receiving `session_id` (the API authorizes a call by the turn
  of that Hermes session);
- the call to the API: URL and token read from `agora-code/api.json`, the
  session id sent along, the API's answer returned to the agent.
"""

from __future__ import annotations

import inspect
import json
import os
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
TOOLS = ("claude_code_start", "claude_code_wait", "claude_code_send", "claude_code_stop")
SESSION = "agora-11111111-2222-4333-8444-555555555555"


def fail(msg: str) -> None:
    print(f"agora_code contract: FAILED — {msg}")
    sys.exit(1)


class Api(BaseHTTPRequestHandler):
    seen: list = []

    def do_POST(self) -> None:
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        Api.seen.append((self.path, self.headers.get("Authorization"), body))
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"session_id": "s-1", "status": "idle", "result": "contract-done", "actions": []}).encode())

    def log_message(self, *_: object) -> None:
        pass


def main() -> None:
    tmp = Path(tempfile.mkdtemp(prefix="agora-code-contract-"))
    home = tmp / "home"
    (home / "plugins").mkdir(parents=True)
    (home / "plugins" / "agora_code").symlink_to(HERE)
    (home / "config.yaml").write_text("plugins:\n  enabled:\n    - agora_code\n")
    os.environ["HERMES_HOME"] = str(home)
    server = HTTPServer(("127.0.0.1", 0), Api)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    (home / "agora-code").mkdir()
    (home / "agora-code" / "api.json").write_text(json.dumps({"url": f"http://127.0.0.1:{server.server_port}/api/internal/code", "token": "contract-token"}))

    # 1. Loading through Hermes's plugin manager, tools in their toolset.
    try:
        from hermes_cli.plugins import discover_plugins, get_plugin_manager
        from tools.registry import registry
    except Exception as exc:
        fail(f"Hermes import: {exc!r}")
    discover_plugins(force=True)
    loaded = next((p for p in get_plugin_manager()._plugins.values() if p.manifest.name == "agora_code"), None)
    if loaded is None or not loaded.enabled:
        fail(f"user plugin not loaded ({getattr(loaded, 'error', 'not found')})")
    scope = get_plugin_manager().scope_key
    for name in TOOLS:
        entry = registry.get_entry(name, scope=scope)
        if entry is None:
            fail(f"{name} not registered")
        if getattr(entry, "toolset", None) != "agora_code":
            fail(f"{name} in toolset {getattr(entry, 'toolset', None)!r}")

    # 2. Tool handlers get the session id.
    try:
        import model_tools
    except Exception as exc:
        fail(f"model_tools import: {exc!r}")
    source = inspect.getsource(model_tools)
    if '"session_id"' not in source or "dispatch_kwargs" not in source:
        fail("model_tools no longer passes session_id to tool handlers")

    # 3. A call, through the registry as the agent loop makes it.
    out = registry.dispatch("claude_code_start", {"task": "contract task", "wait": False}, scope=scope, task_id="contract", session_id=SESSION)
    result = out if isinstance(out, dict) else json.loads(out)
    if result.get("result") != "contract-done":
        fail(f"API answer not returned: {result}")
    if not Api.seen:
        fail("the API was not called")
    path, authorization, body = Api.seen[0]
    if path != "/api/internal/code/sessions" or authorization != "Bearer contract-token":
        fail(f"unexpected request {path} {authorization}")
    if body.get("hermes_session") != SESSION or body.get("task") != "contract task":
        fail(f"session or task not sent: {body}")

    server.shutdown()
    print("agora_code contract: OK")


if __name__ == "__main__":
    main()
