"""Hermes contract for the agora_screen plugin: run it with Hermes's Python.

    python infra/hermes-plugins/agora_screen/contract_check.py   # exit code 0 = compatible

Everything happens in a temporary HERMES_HOME: nothing touches the real
instance. The script checks what the plugin depends on:
- loading a user plugin from `$HERMES_HOME/plugins/<name>` once listed in
  `plugins.enabled`, and its `post_tool_call` hook being registered;
- the `post_tool_call` payload (tool_name, session_id, task_id);
- the browser internals it reads: `_active_sessions`, `_last_active_session_key`,
  `_cleanup_lock`, and the agent-browser helpers `_socket_safe_tmpdir`,
  `_build_browser_env`, `_merge_browser_path`, `_agent_browser_argv`,
  `_find_agent_browser` (wherever Hermes keeps them);
- the file written for the Agora API, from a fake session.
"""

from __future__ import annotations

import importlib.util
import inspect
import json
import os
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent


def fail(msg: str) -> None:
    print(f"agora_screen contract: FAILED — {msg}")
    sys.exit(1)


def main() -> None:
    tmp = Path(tempfile.mkdtemp(prefix="agora-screen-contract-"))
    home = tmp / "home"
    (home / "plugins").mkdir(parents=True)
    (home / "plugins" / "agora_screen").symlink_to(HERE)
    (home / "config.yaml").write_text("plugins:\n  enabled:\n    - agora_screen\n")
    os.environ["HERMES_HOME"] = str(home)

    # 1. Browser internals.
    try:
        from tools import browser_tool as bt
    except Exception as exc:
        fail(f"Hermes import: {exc!r}")
    for name in ("_active_sessions", "_last_active_session_key", "_cleanup_lock"):
        if not hasattr(bt, name):
            fail(f"tools.browser_tool.{name} no longer exists")
    spec = importlib.util.spec_from_file_location("agora_screen_contract", HERE / "__init__.py")
    plugin = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(plugin)
    for name in ("_socket_safe_tmpdir", "_build_browser_env", "_merge_browser_path", "_agent_browser_argv", "_find_agent_browser"):
        try:
            plugin._helper(name)
        except AttributeError as exc:
            fail(str(exc))

    # 2. The hook payload.
    try:
        import model_tools
    except Exception as exc:
        fail(f"model_tools import: {exc!r}")
    emitter = next((f for n, f in vars(model_tools).items() if callable(f) and "post_tool_call" in (f.__doc__ or "")), None)
    if emitter is None:
        fail("no post_tool_call emitter found in model_tools")
    params = inspect.signature(emitter).parameters
    for name in ("function_name", "session_id", "task_id"):
        if name not in params:
            fail(f"post_tool_call emitter no longer takes {name}")

    # 3. Loading through Hermes's plugin manager (not a direct import).
    from hermes_cli.plugins import discover_plugins, get_plugin_manager, has_hook

    discover_plugins(force=True)
    manager = get_plugin_manager()
    loaded = next((p for p in manager._plugins.values() if p.manifest.name == "agora_screen"), None)
    if loaded is None or not loaded.enabled:
        fail(f"user plugin not loaded ({getattr(loaded, 'error', 'not found')})")
    if not has_hook("post_tool_call"):
        fail("post_tool_call hook not registered")

    # 4. A fake session, as the browser tools leave it after a call.
    sid = "agora-contract-conversation"
    with bt._cleanup_lock:
        bt._active_sessions["contract-task"] = {"session_name": "contract", "cdp_url": "ws://127.0.0.1:9333/devtools/browser/x"}
    try:
        plugin.record(sid, "contract-task")
    finally:
        with bt._cleanup_lock:
            bt._active_sessions.pop("contract-task", None)
    path = plugin.screen_dir() / f"{sid}.json"
    if not path.exists():
        fail(f"{path} not written")
    if json.loads(path.read_text()).get("cdp") != "http://127.0.0.1:9333":
        fail(f"unexpected content: {path.read_text()}")
    print("agora_screen contract: OK")


if __name__ == "__main__":
    main()
