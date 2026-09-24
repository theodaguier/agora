"""agora_files — read-only access to a conversation's attachments.

Hermes's `file` toolset reads AND writes anywhere the gateway user can: with
it, an agent (or whoever steers it through a prompt) can rewrite another
profile's config.yaml, declare an MCP server whose command runs on the next
restart, or drop a plugin. Agora turns that toolset off and gives agents this
single tool instead:

    read_attachment(path, offset, limit)

It only opens files under `<root HERMES_HOME>/agora-attachments/<conversation>/`
and only for the Hermes sessions of that conversation (`agora-<conversation>…`,
see hermesSessionId in the API). The read itself is Hermes's read_file
(pagination, document extraction, secret redaction), so the agent gets the
same output as before.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

TOOLSET = "agora_files"
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def _root_home() -> Path:
    from hermes_constants import get_hermes_home

    home = get_hermes_home()
    return home.parent.parent if home.parent.name == "profiles" else home


def attachments_dir() -> Path:
    return _root_home() / "agora-attachments"


def _error(message: str) -> str:
    return json.dumps({"success": False, "error": message})


def resolve_attachment(path: str, session_id: str) -> tuple[Optional[Path], Optional[str]]:
    """(resolved path, None) when this session may read `path`, else (None, error)."""
    if not path:
        return None, "path is required"
    try:
        resolved = Path(path).expanduser().resolve(strict=True)
        base = attachments_dir().resolve(strict=True)
    except (OSError, RuntimeError):
        return None, f"File not found: {path}"
    try:
        parts = resolved.relative_to(base).parts
    except ValueError:
        return None, "Only the files attached to this conversation can be read."
    conversation = parts[0] if len(parts) >= 2 else ""
    session = str(session_id or "")
    if not UUID.match(conversation) or not (session == f"agora-{conversation}" or session.startswith(f"agora-{conversation}-")):
        return None, "Only the files attached to this conversation can be read."
    if not resolved.is_file():
        return None, f"File not found: {path}"
    return resolved, None


def read_attachment(args: dict, session_id: str = "", task_id: str = "", **_: Any) -> str:
    resolved, error = resolve_attachment(str(args.get("path") or ""), session_id)
    if error:
        return _error(error)
    from tools.file_tools import DEFAULT_READ_LIMIT, read_file_tool

    return read_file_tool(
        path=str(resolved),
        offset=args.get("offset", 1),
        limit=args.get("limit", DEFAULT_READ_LIMIT),
        task_id=task_id or "default",
    )


SCHEMA = {
    "name": "read_attachment",
    "description": (
        "Read a file the user attached to this conversation, by the absolute path given with the "
        "message. Text, PDF and office documents come back as text with line numbers; page through "
        "long files with offset and limit. Use vision_analyze for images. Only this conversation's "
        "attachments can be read."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "Absolute path of the attachment, as given in the message."},
            "offset": {"type": "integer", "description": "First line to read (1-based).", "minimum": 1},
            "limit": {"type": "integer", "description": "Number of lines to read.", "minimum": 1},
        },
        "required": ["path"],
        "additionalProperties": False,
    },
}


def register(ctx) -> None:
    ctx.register_tool(name="read_attachment", toolset=TOOLSET, schema=SCHEMA, handler=read_attachment, emoji="📎")
