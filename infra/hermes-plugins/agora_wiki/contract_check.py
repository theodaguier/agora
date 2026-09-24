"""Hermes contract for the agora_wiki plugin: run it with Hermes's Python.

    python infra/hermes-plugins/agora_wiki/contract_check.py   # exit code 0 = compatible

Everything happens in a temporary HERMES_HOME and vault: nothing touches the
real instance. The script checks what the plugin depends on:
- loading a user provider from `$HERMES_HOME/plugins/<name>`
  (`plugins.memory.load_memory_provider`, `register(ctx).register_memory_provider`);
- the `memory.provider` key, read by `hermes memory status`;
- `agent.memory_provider.MemoryProvider` and `is_trivial_prompt`, as well as
  `hermes_constants.get_hermes_home`;
- the signatures called by MemoryManager: system_prompt_block(),
  prefetch(query, session_id=), sync_turn(user, assistant, session_id=, messages=),
  on_memory_write(action, target, content, metadata), get_tool_schemas() and
  handle_tool_call().
"""

from __future__ import annotations

import inspect
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent


def fail(msg: str) -> None:
    print(f"agora_wiki contract: FAILED — {msg}")
    sys.exit(1)


def main() -> None:
    tmp = Path(tempfile.mkdtemp(prefix="agora-wiki-contract-"))
    home, vault = tmp / "home", tmp / "vault"
    (home / "plugins").mkdir(parents=True)
    (home / "plugins" / "agora_wiki").symlink_to(HERE)
    (home / "config.yaml").write_text("memory:\n  provider: agora_wiki\n")
    vault.mkdir()
    os.environ["HERMES_HOME"] = str(home)
    os.environ["AGORA_WIKI_DIR"] = str(vault)

    # 1. Python surfaces imported by the plugin.
    try:
        from agent.memory_provider import MemoryProvider, is_trivial_prompt  # noqa: F401
        from hermes_constants import get_hermes_home  # noqa: F401
        from plugins.memory import load_memory_provider
    except Exception as exc:
        fail(f"Hermes import: {exc!r}")
    for hook in ("system_prompt_block", "prefetch", "sync_turn", "on_memory_write", "get_tool_schemas", "handle_tool_call", "initialize", "is_available"):
        if not hasattr(MemoryProvider, hook):
            fail(f"MemoryProvider.{hook} no longer exists")
    params = inspect.signature(MemoryProvider.sync_turn).parameters
    if "session_id" not in params:
        fail("sync_turn no longer accepts session_id")

    # 2. Loading through Hermes's mechanism (not a direct import).
    provider = load_memory_provider("agora_wiki")
    if provider is None or provider.name != "agora_wiki":
        fail("load_memory_provider('agora_wiki') no longer finds the user plugin")
    if not provider.is_available():
        fail("is_available() is false with a vault present")

    # 3. Lifecycle, with MemoryManager's exact calls.
    provider.initialize("contract-session", hermes_home=str(home))
    write = json.loads(provider.handle_tool_call("wiki_write", {"page": "contract", "type": "concept", "title": "Contract", "summary": "Test page", "body": "See [[a]] and [[b]]."}))
    if not write.get("ok"):
        fail(f"wiki_write: {write}")
    if "Contract" not in provider.system_prompt_block():
        fail("system_prompt_block() does not expose the catalog")
    if "contract" not in provider.prefetch("tell me about the test contract", session_id="contract-session"):
        fail("prefetch() does not find the page")
    provider.sync_turn("question", "answer", session_id="contract-session", messages=[])
    provider.on_memory_write("add", "memory", "test fact", {})
    if not list((vault / "raw" / "conversations").rglob("*.md")):
        fail("sync_turn logged nothing")
    if not (vault / "raw" / "memories").is_dir():
        fail("on_memory_write copied nothing")
    names = {t["name"] for t in provider.get_tool_schemas()}
    if names != {"wiki_search", "wiki_read", "wiki_write", "wiki_log_session"}:
        fail(f"unexpected tools: {names}")

    # 4. The memory.provider config key is still the one Hermes reads.
    hermes = os.environ.get("HERMES_BIN", "hermes")
    try:
        out = subprocess.run([hermes, "memory", "status"], capture_output=True, text=True, timeout=120, env=os.environ).stdout
    except Exception as exc:
        fail(f"`hermes memory status`: {exc!r}")
    if "agora_wiki" not in out or "active" not in out:
        fail("`memory.provider: agora_wiki` is no longer recognized by `hermes memory status`")

    print("agora_wiki contract: OK")


if __name__ == "__main__":
    main()
