"""Hermes contract for the agora_files plugin and the agent confinement (apps/api/src/sandbox.ts).

    python infra/hermes-plugins/agora_files/contract_check.py   # exit code 0 = compatible

Everything happens in a temporary HERMES_HOME: nothing touches the real
instance. The script checks what the confinement depends on:
- loading a user plugin from `$HERMES_HOME/plugins/<name>` once listed in
  `plugins.enabled`, and its `read_attachment` tool landing in the
  `agora_files` toolset;
- tool handlers receiving `session_id` (the conversation check relies on it);
- the read itself: this conversation's file is read, another conversation's
  file and a file outside the attachments are refused;
- `agent.disabled_toolsets` still being honored by the gateway's turns and by
  cron jobs (the one list a cron job created by an agent cannot widen).
"""

from __future__ import annotations

import importlib
import inspect
import json
import os
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
CONVERSATION = "11111111-2222-4333-8444-555555555555"
OTHER = "66666666-7777-4888-9999-000000000000"


def fail(msg: str) -> None:
    print(f"agora_files contract: FAILED — {msg}")
    sys.exit(1)


def main() -> None:
    tmp = Path(tempfile.mkdtemp(prefix="agora-files-contract-"))
    home = tmp / "home"
    (home / "plugins").mkdir(parents=True)
    (home / "plugins" / "agora_files").symlink_to(HERE)
    (home / "config.yaml").write_text("plugins:\n  enabled:\n    - agora_files\n")
    os.environ["HERMES_HOME"] = str(home)
    mine = home / "agora-attachments" / CONVERSATION / "note.txt"
    other = home / "agora-attachments" / OTHER / "note.txt"
    outside = home / "outside.txt"
    for path, text in ((mine, "contract-mine"), (other, "contract-other"), (outside, "contract-outside")):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text + "\n")

    # 1. Loading through Hermes's plugin manager, tool in its toolset.
    try:
        from hermes_cli.plugins import discover_plugins, get_plugin_manager
        from tools.registry import registry
    except Exception as exc:
        fail(f"Hermes import: {exc!r}")
    discover_plugins(force=True)
    loaded = next((p for p in get_plugin_manager()._plugins.values() if p.manifest.name == "agora_files"), None)
    if loaded is None or not loaded.enabled:
        fail(f"user plugin not loaded ({getattr(loaded, 'error', 'not found')})")
    entry = registry.get_entry("read_attachment", scope=get_plugin_manager().scope_key)
    if entry is None:
        fail("read_attachment not registered")
    if getattr(entry, "toolset", None) != "agora_files":
        fail(f"read_attachment in toolset {getattr(entry, 'toolset', None)!r}")

    # 2. Tool handlers get the session id.
    try:
        import model_tools
    except Exception as exc:
        fail(f"model_tools import: {exc!r}")
    source = inspect.getsource(model_tools)
    if '"session_id"' not in source or "dispatch_kwargs" not in source:
        fail("model_tools no longer passes session_id to tool handlers")

    # 3. The read, through the registry as the agent loop calls it.
    def read(path: Path, session: str) -> dict:
        out = registry.dispatch("read_attachment", {"path": str(path)}, scope=get_plugin_manager().scope_key,
                                task_id="contract", session_id=session)
        return out if isinstance(out, dict) else json.loads(out)

    session = f"agora-{CONVERSATION}-r2"
    if "contract-mine" not in json.dumps(read(mine, session)):
        fail(f"this conversation's attachment not read: {read(mine, session)}")
    for path in (other, outside):
        result = json.dumps(read(path, session))
        if "contract-" in result.replace("contract-mine", ""):
            fail(f"{path.name} outside this conversation was read: {result}")
    if "contract-mine" in json.dumps(read(mine, "20260101_000000_subagent")):
        fail("a session outside the conversation read its attachment")

    # 4. agent.disabled_toolsets: gateway turns and cron jobs.
    try:
        run_turn = importlib.import_module("gateway.run_turn")
    except Exception as exc:
        fail(f"gateway.run_turn import: {exc!r}")
    if "disabled_toolsets" not in inspect.getsource(run_turn):
        fail("gateway turns no longer read agent.disabled_toolsets")
    try:
        from cron.scheduler import _resolve_cron_disabled_toolsets
    except Exception as exc:
        fail(f"cron denylist: {exc!r}")
    if "terminal" not in (_resolve_cron_disabled_toolsets({"agent": {"disabled_toolsets": ["terminal"]}}) or []):
        fail("cron jobs no longer honor agent.disabled_toolsets")

    print("agora_files contract: OK")


if __name__ == "__main__":
    main()
