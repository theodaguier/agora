"""agora_ssh — the remote machines an agent reaches over SSH.

The machines live in the Agora API (apps/api/src/ssh.ts): an admin declares them in
Settings › Machines, Agora holds their keys and pinned host keys, and every agent may
use them except the ones the admin left out. The API runs the command and logs it:

    ssh_hosts()                                   the machines this agent may use
    ssh_run(host, command, timeout_seconds, stdin) runs one command, returns its exit code and output
    ssh_add_host(name, host, username, port, description)
                                                  declares a new machine for every agent; returns the
                                                  public key to install on it
    ssh_test_host(host)                           connects with Agora's key; the first success pins the
                                                  machine's host key and makes it usable

The API listens on 127.0.0.1 (same network as the gateway) and wrote its URL and a
token to `<root HERMES_HOME>/agora-ssh/api.json` when it started. Each call names the
Hermes session it comes from.
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

TOOLSET = "agora_ssh"
# The API stops the command at its timeout (600 s at most); the call waits a little longer.
MAX_TIMEOUT = 600


def _root_home() -> Path:
    from hermes_constants import get_hermes_home

    home = get_hermes_home()
    return home.parent.parent if home.parent.name == "profiles" else home


def _call(path: str, body: dict, timeout: float = 30) -> dict:
    api = json.loads((_root_home() / "agora-ssh" / "api.json").read_text())
    req = urllib.request.Request(api["url"] + path, data=json.dumps(body).encode(), method="POST", headers={
        "Authorization": f"Bearer {api['token']}",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return json.loads(res.read() or b"{}")
    except urllib.error.HTTPError as err:
        try:
            payload = json.loads(err.read() or b"{}")
        except ValueError:
            payload = {}
        raise RuntimeError(payload.get("message") or payload.get("error") or f"HTTP {err.code}") from None


def _error(message: str) -> str:
    return json.dumps({"success": False, "error": message}, ensure_ascii=False)


def ssh_hosts(args: dict, session_id: str = "", **_: Any) -> str:
    try:
        result = _call("/hosts", {"hermes_session": session_id})
        if not result.get("hosts"):
            result["note"] = ("No machine yet. Add one with ssh_add_host (or an admin does it in Agora's "
                              "Settings › SSH machines), install its public key there, then ssh_test_host.")
        return json.dumps(result, ensure_ascii=False)
    except Exception as exc:
        return _error(str(exc))


def ssh_run(args: dict, session_id: str = "", **_: Any) -> str:
    host = str(args.get("host") or "").strip()
    command = str(args.get("command") or "")
    if not host or not command.strip():
        return _error("host and command are required")
    body: Dict[str, Any] = {"hermes_session": session_id, "host": host, "command": command}
    timeout: Optional[int] = None
    if args.get("timeout_seconds"):
        try:
            timeout = max(1, min(int(args["timeout_seconds"]), MAX_TIMEOUT))
            body["timeout_seconds"] = timeout
        except (TypeError, ValueError):
            pass
    if args.get("stdin") is not None:
        body["stdin"] = str(args["stdin"])
    try:
        return json.dumps(_call("/run", body, timeout=(timeout or 120) + 45), ensure_ascii=False)
    except Exception as exc:
        return _error(str(exc))


def ssh_add_host(args: dict, session_id: str = "", **_: Any) -> str:
    body: Dict[str, Any] = {"hermes_session": session_id}
    for key in ("name", "host", "username", "description"):
        if args.get(key) is not None:
            body[key] = str(args[key]).strip()
    if args.get("port") is not None:
        try:
            body["port"] = int(args["port"])
        except (TypeError, ValueError):
            return _error("port must be a number")
    if not body.get("name") or not body.get("host") or not body.get("username"):
        return _error("name, host and username are required")
    try:
        return json.dumps(_call("/add", body), ensure_ascii=False)
    except Exception as exc:
        return _error(str(exc))


def ssh_test_host(args: dict, session_id: str = "", **_: Any) -> str:
    host = str(args.get("host") or "").strip()
    if not host:
        return _error("host is required")
    try:
        return json.dumps(_call("/test", {"hermes_session": session_id, "host": host}, timeout=90), ensure_ascii=False)
    except Exception as exc:
        return _error(str(exc))


HOSTS = {
    "name": "ssh_hosts",
    "description": "List the remote machines you may reach over SSH: name, user@address and what each one is for.",
    "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
}

RUN = {
    "name": "ssh_run",
    "description": (
        "Run one shell command on a remote machine over SSH (non-interactive) and get its exit code, stdout and stderr "
        "(the last 60,000 characters of each). Chain steps with && or a script; to write a file, pass its content in "
        "stdin with e.g. `cat > /path/file`. Every command is logged in Agora."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "host": {"type": "string", "description": "The machine's name, from ssh_hosts."},
            "command": {"type": "string", "description": "The command, run by the machine user's shell."},
            "timeout_seconds": {"type": "integer", "description": "Stop it after this long (default 120, at most 600)."},
            "stdin": {"type": "string", "description": "Text given to the command on its standard input."},
        },
        "required": ["host", "command"],
        "additionalProperties": False,
    },
}


ADD = {
    "name": "ssh_add_host",
    "description": (
        "Declare a new remote machine in Agora, reachable over SSH by every agent and code session once tested. "
        "Agora makes a key for it and returns its public key and a command that installs it in ~/.ssh/authorized_keys: "
        "run that command on the machine with any access you already have, or give it to the person. Then call "
        "ssh_test_host. Check ssh_hosts first: never add a machine twice."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "Short name agents will use: lowercase letters, digits and dashes (e.g. prod-web)."},
            "host": {"type": "string", "description": "Host name or IP address, without user or port."},
            "username": {"type": "string", "description": "The account to log in as on the machine."},
            "port": {"type": "integer", "description": "SSH port (default 22)."},
            "description": {"type": "string", "description": "What runs there and what agents may do on it, in one or two sentences."},
        },
        "required": ["name", "host", "username"],
        "additionalProperties": False,
    },
}

TEST = {
    "name": "ssh_test_host",
    "description": (
        "Connect to a machine with Agora's key. The first success pins the machine's host key: from then on, it is "
        "usable with ssh_run. On failure, the error says what to fix (key not installed, port closed…)."
    ),
    "parameters": {
        "type": "object",
        "properties": {"host": {"type": "string", "description": "The machine's name."}},
        "required": ["host"],
        "additionalProperties": False,
    },
}


def register(ctx) -> None:
    ctx.register_tool(name="ssh_hosts", toolset=TOOLSET, schema=HOSTS, handler=ssh_hosts, emoji="🖥️")
    ctx.register_tool(name="ssh_run", toolset=TOOLSET, schema=RUN, handler=ssh_run, emoji="🖥️")
    ctx.register_tool(name="ssh_add_host", toolset=TOOLSET, schema=ADD, handler=ssh_add_host, emoji="🖥️")
    ctx.register_tool(name="ssh_test_host", toolset=TOOLSET, schema=TEST, handler=ssh_test_host, emoji="🖥️")
