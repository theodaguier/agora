"""agora_screen — lets Agora members watch the browser an agent drives.

Hermes's browser tools run a headless Chromium per task (agent-browser), under
a random session name. After each `browser_*` call, this plugin records which
DevTools (CDP) endpoint belongs to the Agora session that made it:

    <root HERMES_HOME>/agora-screen/<session_id>.json   {"cdp": "http://127.0.0.1:<port>", ...}

The Agora API shares the gateway's network, reads that file only while someone
has the screen open, and streams the page from the endpoint (Page.startScreencast).
Nothing is launched here: no viewer, no cost; no browser, no file.

Only sessions opened by Agora (`agora-…`) are recorded. Everything is
best-effort: a failure means no screen, never a failed tool call.
"""

from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

SESSION_PREFIX = "agora-"
SAFE_ID = re.compile(r"^[A-Za-z0-9_-]{1,200}$")
STALE_AFTER = 24 * 3600

_lock = threading.Lock()
_in_flight: set = set()
# session_id -> (agent-browser session name, CDP endpoint): one lookup per browser.
_known: Dict[str, tuple] = {}


def _root_home() -> Path:
    from hermes_constants import get_hermes_home

    home = get_hermes_home()
    return home.parent.parent if home.parent.name == "profiles" else home


def screen_dir() -> Path:
    return _root_home() / "agora-screen"


def _session_info(task_id: str) -> Optional[Dict[str, Any]]:
    from tools import browser_tool as bt

    with bt._cleanup_lock:
        key = bt._last_active_session_key.get(task_id) or task_id
        info = bt._active_sessions.get(key) or bt._active_sessions.get(task_id)
        return dict(info) if info else None


# Browser helpers, split out of tools/browser_tool.py in Hermes's September 2026 decomposition.
_HELPER_MODULES = ("tools.browser_tool_session", "tools.browser_tool_install", "tools.browser_tool")


def _helper(name: str):
    import importlib

    for module in _HELPER_MODULES:
        try:
            fn = getattr(importlib.import_module(module), name, None)
        except ImportError:
            continue
        if callable(fn):
            return fn
    raise AttributeError(f"Hermes browser helper {name} not found")


def _local_cdp(session_name: str) -> Optional[str]:
    """CDP endpoint of a running agent-browser session (never starts one: called after a browser tool)."""
    socket_dir = os.path.join(_helper("_socket_safe_tmpdir")(), f"agent-browser-{session_name}")
    if not os.path.isdir(socket_dir):
        return None
    env = _helper("_build_browser_env")()
    env["PATH"] = _helper("_merge_browser_path")(env.get("PATH", ""))
    env["AGENT_BROWSER_SOCKET_DIR"] = socket_dir
    argv = [*_helper("_agent_browser_argv")(_helper("_find_agent_browser")()), "--session", session_name, "get", "cdp-url"]
    proc = subprocess.run(argv, capture_output=True, text=True, timeout=10, stdin=subprocess.DEVNULL, env=env)
    m = re.search(r"ws://127\.0\.0\.1:(\d+)/", proc.stdout or "")
    return f"http://127.0.0.1:{m.group(1)}" if m else None


def _cdp_for(info: Dict[str, Any]) -> Optional[str]:
    remote = str(info.get("cdp_url") or "")
    m = re.match(r"^(?:ws|http)s?://(127\.0\.0\.1|localhost):(\d+)", remote)
    if m:
        return f"http://127.0.0.1:{m.group(2)}"
    if remote:
        return None  # Cloud browser: not reachable from Agora.
    name = str(info.get("session_name") or "")
    return _local_cdp(name) if name else None


def _write(session_id: str, session_name: str, cdp: str) -> None:
    folder = screen_dir()
    folder.mkdir(parents=True, exist_ok=True)
    tmp = folder / f".{session_id}.tmp"
    tmp.write_text(json.dumps({
        "cdp": cdp,
        "session": session_name,
        "at": datetime.now(timezone.utc).isoformat(),
    }))
    tmp.replace(folder / f"{session_id}.json")
    cutoff = time.time() - STALE_AFTER
    for f in folder.glob("*.json"):
        try:
            if f.stat().st_mtime < cutoff:
                f.unlink()
        except OSError:
            pass


def _touch(session_id: str) -> None:
    try:
        os.utime(screen_dir() / f"{session_id}.json")
    except OSError:
        pass


def record(session_id: str, task_id: str) -> None:
    try:
        info = _session_info(task_id or session_id)
        if not info:
            return
        name = str(info.get("session_name") or info.get("cdp_url") or "")
        known = _known.get(session_id)
        if known and known[0] == name:
            _touch(session_id)
            return
        cdp = _cdp_for(info)
        if not cdp:
            return
        _known[session_id] = (name, cdp)
        _write(session_id, name, cdp)
    except Exception as exc:  # never break the agent for a preview
        logger.debug("agora_screen: %s", exc)
    finally:
        with _lock:
            _in_flight.discard(session_id)


def on_post_tool_call(tool_name: str = "", session_id: str = "", task_id: str = "", **_: Any) -> None:
    if not str(tool_name).startswith("browser_") or not str(session_id).startswith(SESSION_PREFIX):
        return
    if not SAFE_ID.match(session_id):
        return
    with _lock:
        if session_id in _in_flight:
            return
        _in_flight.add(session_id)
    # Off the agent's thread: the lookup can spawn the agent-browser CLI.
    threading.Thread(target=record, args=(session_id, task_id), name="agora-screen", daemon=True).start()


def register(ctx) -> None:
    ctx.register_hook("post_tool_call", on_post_tool_call)
