"""agora_vault — the Coffre-fort an agent reads on behalf of the person it replies to.

The vault lives in the Agora API (apps/api/src/vaults.ts). A bot reads the vaults
its person allowed it to, and only during a turn that person started:

    vault_search(query, kind)        items: titles, websites, usernames, contact fields, card's last 4 digits
    vault_contact(item_id)           a contact's details, given without asking
    vault_use_login(item_id, reason) asks the person on a card in the conversation, waits for the answer,
                                     then returns the login (username, password, website)
    vault_ask_login(website, reason) no login for that site: the person types it on a card, it is saved
                                     in their vault, then returned like vault_use_login

A payment card's number and security code are never given to a bot.

The API listens on 127.0.0.1 (same network as the gateway) and wrote its URL
and a token to `<root HERMES_HOME>/agora-vault/api.json` when it started. Each
call names the Hermes session it comes from. Passwords are never logged.
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

TOOLSET = "agora_vault"
POLL_SECONDS = 2
WAIT_SECONDS = 5 * 60


def _root_home() -> Path:
    from hermes_constants import get_hermes_home

    home = get_hermes_home()
    return home.parent.parent if home.parent.name == "profiles" else home


def _api() -> Dict[str, str]:
    return json.loads((_root_home() / "agora-vault" / "api.json").read_text())


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
        raise RuntimeError(payload.get("message") or payload.get("error") or f"HTTP {err.code}") from None


def _interrupted() -> bool:
    try:
        from tools.interrupt import is_interrupted

        return is_interrupted()
    except Exception:
        return False


def _error(message: str) -> str:
    return json.dumps({"success": False, "error": message}, ensure_ascii=False)


def vault_search(args: dict, session_id: str = "", **_: Any) -> str:
    body: Dict[str, Any] = {"hermes_session": session_id}
    if args.get("query"):
        body["query"] = str(args["query"])
    if args.get("kind") in ("login", "card", "contact"):
        body["kind"] = args["kind"]
    try:
        result = _call("POST", "/search", body)
        if not result.get("items"):
            result["note"] = ("Nothing found in the vaults you may read for this person. They can add the item, "
                              "or allow you to read a vault, from Coffre-fort in Agora.")
        return json.dumps(result, ensure_ascii=False)
    except Exception as exc:
        return _error(str(exc))


def vault_contact(args: dict, session_id: str = "", **_: Any) -> str:
    item = str(args.get("item_id") or "")
    if not item:
        return _error("item_id is required")
    try:
        return json.dumps(_call("POST", "/contact", {"hermes_session": session_id, "item_id": item}), ensure_ascii=False)
    except Exception as exc:
        return _error(str(exc))


def _wait(request_id: str, session_id: str, retry_tool: str) -> str:
    """Polls the request until its person answered on the card, it expired, or the wait ran out."""
    deadline = time.monotonic() + WAIT_SECONDS
    while True:
        status = _call("GET", f"/requests/{urllib.parse.quote(request_id)}", query={"hermes_session": session_id})
        state = status.get("status")
        if state == "approved":
            return json.dumps({
                "success": True,
                "website": status.get("website"),
                "username": status.get("username"),
                "password": status.get("password"),
                "note": "Approved. Type the password where it is needed; never repeat it in your reply, a file or your memory.",
            }, ensure_ascii=False)
        if state == "denied":
            return _error("The person refused. Do not ask again unless they tell you to.")
        if state == "expired":
            return _error("The request expired without an answer. Ask the person in your reply whether to try again.")
        if time.monotonic() >= deadline or _interrupted():
            return _error("No answer yet: the request is still waiting on the card in the conversation. "
                          f"Tell the person, and call {retry_tool} again once they answered it.")
        time.sleep(POLL_SECONDS)


def vault_use_login(args: dict, session_id: str = "", **_: Any) -> str:
    item = str(args.get("item_id") or "")
    reason = str(args.get("reason") or "").strip()
    if not item or not reason:
        return _error("item_id and reason are required")
    try:
        request = _call("POST", "/requests", {"hermes_session": session_id, "item_id": item, "reason": reason})
        return _wait(request["request_id"], session_id, "vault_use_login")
    except Exception as exc:
        return _error(str(exc))


def vault_ask_login(args: dict, session_id: str = "", **_: Any) -> str:
    website = str(args.get("website") or "").strip()
    reason = str(args.get("reason") or "").strip()
    if not website or not reason:
        return _error("website and reason are required")
    try:
        request = _call("POST", "/ask", {"hermes_session": session_id, "website": website, "reason": reason})
        return _wait(request["request_id"], session_id, "vault_ask_login")
    except Exception as exc:
        return _error(str(exc))


SEARCH = {
    "name": "vault_search",
    "description": (
        "Search the Coffre-fort (password manager) of the person you are replying to: the vaults they allowed you "
        "to read. Returns items without secrets: id, vault, kind, title, website, and username (login), name/email/"
        "phone/address/company (contact) or holder/brand/last4/expiry (payment card). A card's number and security "
        "code are never given to bots."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Words of the title, website or fields (e.g. a site's domain). Empty: everything."},
            "kind": {"type": "string", "enum": ["login", "card", "contact"]},
        },
        "additionalProperties": False,
    },
}

CONTACT = {
    "name": "vault_contact",
    "description": "Get a contact item's details (name, email, phone, address, company) to fill a form for the person. No approval needed.",
    "parameters": {
        "type": "object",
        "properties": {"item_id": {"type": "string", "description": "From vault_search."}},
        "required": ["item_id"],
        "additionalProperties": False,
    },
}

USE_LOGIN = {
    "name": "vault_use_login",
    "description": (
        "Ask to use a login's password. The person gets a card in the conversation (Allow / Refuse) with your reason; "
        "this call waits for their answer (up to 5 minutes), then returns username, password and website, or their "
        "refusal. Use the password only where it is needed: never write it in your reply, a file or your memory."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "item_id": {"type": "string", "description": "A login's id, from vault_search."},
            "reason": {"type": "string", "description": "What you will do with it, in one sentence, in the person's language (shown on the card)."},
        },
        "required": ["item_id", "reason"],
        "additionalProperties": False,
    },
}


ASK_LOGIN = {
    "name": "vault_ask_login",
    "description": (
        "A site asks you to sign in and vault_search found no login for it: ask the person for one. They get a card "
        "in the conversation with your reason, type their username and password there (never in the chat), and the "
        "login is saved in their Coffre-fort. This call waits for their answer (up to 5 minutes), then returns "
        "username, password and website, or their refusal. Never write the password in your reply, a file or your memory."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "website": {"type": "string", "description": "The site's address, e.g. https://www.example.com (its sign-in page is fine)."},
            "reason": {"type": "string", "description": "What you will do there, in one sentence, in the person's language (shown on the card)."},
        },
        "required": ["website", "reason"],
        "additionalProperties": False,
    },
}


def register(ctx) -> None:
    ctx.register_tool(name="vault_search", toolset=TOOLSET, schema=SEARCH, handler=vault_search, emoji="🔐")
    ctx.register_tool(name="vault_contact", toolset=TOOLSET, schema=CONTACT, handler=vault_contact, emoji="📇")
    ctx.register_tool(name="vault_use_login", toolset=TOOLSET, schema=USE_LOGIN, handler=vault_use_login, emoji="🔑")
    ctx.register_tool(name="vault_ask_login", toolset=TOOLSET, schema=ASK_LOGIN, handler=vault_ask_login, emoji="🔑")
