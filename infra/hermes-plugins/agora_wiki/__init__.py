"""agora_wiki — organization memory for Hermes (Agora) (MemoryProvider).

A single markdown vault, shared by all profiles of the instance, following
Karpathy's "LLM Wiki" pattern (Obsidian-compatible):

    <vault>/
    ├── AGENTS.md          the contract (written by the Agora API)
    ├── index.md           catalog, regenerated here after each write
    ├── log.md             append-only log
    ├── hot.md             hot context, injected into every session
    ├── raw/               immutable sources, fed automatically
    │   ├── conversations/<date>/<profile>.md   every turn (sync_turn)
    │   └── memories/<profile>.md               mirror of MEMORY.md/USER.md
    └── wiki/              pages maintained by the agents
        ├── entities/ concepts/ comparisons/ queries/
        └── sessions/<date>.md

The vault lives at the instance root (`<root HERMES_HOME>/wiki`), even
when this plugin runs in a named profile; `AGORA_WIKI_DIR` overrides it.
All writes go through a file lock: several profiles write in parallel
within the same gateway.

The raw → wiki compilation is done by the Agora API curator, which calls
the default profile with an `agora-curator-*` session (never logged).
"""

from __future__ import annotations

import json
import logging
import os
import re
import unicodedata
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from agent.memory_provider import MemoryProvider, is_trivial_prompt

try:
    import fcntl
except ImportError:  # pragma: no cover - Windows
    fcntl = None

logger = logging.getLogger(__name__)

PAGE_DIRS = {"entity": "entities", "concept": "concepts", "comparison": "comparisons", "query": "queries"}
SECTION_TITLES = {"entities": "Entités", "concepts": "Concepts", "comparisons": "Comparaisons", "queries": "Questions"}
SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{0,80}$")
WIKILINK = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]")
CURATOR_PREFIX = "agora-curator"
TURN_CAP = 4000
HOT_CAP = 2500
PREFETCH_CAP = 3500
CATALOG_CAP = 6000


def _root_home() -> Path:
    from hermes_constants import get_hermes_home

    home = get_hermes_home()
    return home.parent.parent if home.parent.name == "profiles" else home


def _profile_name() -> str:
    from hermes_constants import get_hermes_home

    home = get_hermes_home()
    return home.name if home.parent.name == "profiles" else "default"


def vault_dir() -> Path:
    override = os.environ.get("AGORA_WIKI_DIR")
    return Path(override).expanduser() if override else _root_home() / "wiki"


def _now() -> datetime:
    return datetime.now().astimezone()


@contextmanager
def _locked(vault: Path):
    vault.mkdir(parents=True, exist_ok=True)
    with open(vault / ".lock", "a+") as fh:
        if fcntl:
            fcntl.flock(fh, fcntl.LOCK_EX)
        try:
            yield
        finally:
            if fcntl:
                fcntl.flock(fh, fcntl.LOCK_UN)


def _append(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as fh:
        fh.write(text)


# ---------------------------------------------------------------------------
# Frontmatter (YAML subset written by this plugin: `key: value`, lists as [a, b])
# ---------------------------------------------------------------------------

def parse_page(text: str) -> tuple[Dict[str, Any], str]:
    if not text.startswith("---\n"):
        return {}, text
    end = text.find("\n---", 4)
    if end == -1:
        return {}, text
    meta: Dict[str, Any] = {}
    for line in text[4:end].splitlines():
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        value = value.strip()
        if value.startswith("[") and value.endswith("]"):
            meta[key.strip()] = [v.strip().strip("\"'") for v in value[1:-1].split(",") if v.strip()]
        else:
            meta[key.strip()] = value.strip("\"'")
    return meta, text[end + 4 :].lstrip("\n")


def _dump_page(meta: Dict[str, Any], body: str) -> str:
    lines = ["---"]
    for key in ("title", "type", "summary", "created", "updated", "tags", "sources", "authors"):
        value = meta.get(key)
        if value in (None, "", []):
            continue
        if isinstance(value, list):
            lines.append(f"{key}: [{', '.join(str(v).replace(',', ' ') for v in value)}]")
        else:
            lines.append(f"{key}: {str(value).replace(chr(10), ' ')}")
    lines.append("---")
    return "\n".join(lines) + "\n\n" + body.strip() + "\n"


def _pages(vault: Path):
    for d in PAGE_DIRS.values():
        folder = vault / "wiki" / d
        if folder.is_dir():
            yield from sorted(folder.glob("*.md"))


def _find_page(vault: Path, ref: str) -> Optional[Path]:
    ref = ref.strip().removesuffix(".md").strip("/")
    if ref in ("hot", "index", "log", "AGENTS"):
        p = vault / f"{ref}.md"
        return p if p.exists() else None
    candidate = vault / "wiki" / ref
    if "/" in ref and candidate.with_suffix(".md").exists() and ".." not in ref:
        return candidate.with_suffix(".md")
    slug = ref.split("/")[-1]
    for p in _pages(vault):
        if p.stem == slug:
            return p
    sessions = vault / "wiki" / "sessions" / f"{slug}.md"
    return sessions if sessions.exists() else None


def rebuild_index(vault: Path) -> None:
    sections: Dict[str, List[str]] = {d: [] for d in PAGE_DIRS.values()}
    for p in _pages(vault):
        meta, body = parse_page(p.read_text(encoding="utf-8", errors="replace"))
        summary = meta.get("summary") or next((l for l in body.splitlines() if l and not l.startswith("#")), "")
        sections[p.parent.name].append(f"- [[{p.stem}|{meta.get('title') or p.stem}]] — {summary[:160]}")
    out = [
        "# Index — mémoire de l'organisation",
        "",
        "> Généré par le plugin agora_wiki après chaque écriture. Ne pas éditer à la main.",
        "",
    ]
    for d, entries in sections.items():
        if entries:
            out += [f"## {SECTION_TITLES[d]}", "", *entries, ""]
    days = sorted((vault / "wiki" / "sessions").glob("*.md"), reverse=True)[:30]
    if days:
        out += ["## Sessions récentes", "", *(f"- [[{p.stem}]]" for p in days), ""]
    (vault / "index.md").write_text("\n".join(out), encoding="utf-8")


# ---------------------------------------------------------------------------
# Search (lexical, no dependencies: the vault stays small and readable)
# ---------------------------------------------------------------------------

_WORD = re.compile(r"[\wÀ-ÿ]{3,}", re.UNICODE)
_STOP = set(
    "les des une pour que qui dans sur avec est pas mais par plus son ses aux tout nous vous leur elle "
    "the and for with this that from are was what how quoi comment quel quelle quels est-ce fait faire".split()
)


def _fold(text: str) -> str:
    """Lowercase without accents: "Règlement" and "reglement" match each other."""
    return "".join(c for c in unicodedata.normalize("NFKD", text.lower()) if not unicodedata.combining(c))


def _terms(text: str) -> List[str]:
    out = []
    for w in (m.group(0) for m in _WORD.finditer(_fold(text))):
        if w in _STOP:
            continue
        # Crude stemming: "clients", "factures" match "client", "facture".
        out.append(w[:-1] if len(w) > 4 and w[-1] in "sx" else w)
    return out


def catalog(vault: Path, cap: int = CATALOG_CAP) -> str:
    """All pages (title + summary), most recent first, up to `cap`."""
    rows = []
    for p in _pages(vault):
        meta, body = parse_page(p.read_text(encoding="utf-8", errors="replace"))
        summary = meta.get("summary") or next((l for l in body.splitlines() if l and not l.startswith("#")), "")
        rows.append((str(meta.get("updated", "")), f"- [[{p.stem}]] {meta.get('title') or p.stem} — {summary[:140]}"))
    rows.sort(reverse=True)
    out, size = [], 0
    for _, line in rows:
        size += len(line) + 1
        if size > cap:
            out.append(f"- … et {len(rows) - len(out)} autres pages : wiki_search pour les trouver.")
            break
        out.append(line)
    return "\n".join(out)


def search(vault: Path, query: str, limit: int = 8) -> List[Dict[str, Any]]:
    terms = set(_terms(query))
    if not terms:
        return []
    results = []
    for p in _pages(vault):
        text = p.read_text(encoding="utf-8", errors="replace")
        meta, body = parse_page(text)
        title = _fold(str(meta.get("title") or p.stem))
        tags = _fold(" ".join(meta.get("tags") or []))
        low = _fold(body)
        score = 0.0
        for t in terms:
            score += 4 * (t in title) + 3 * (t in _fold(p.stem)) + 2 * (t in tags) + 2 * (t in _fold(str(meta.get("summary", "")))) + min(low.count(t), 5) * 0.5
        if score <= 0:
            continue
        pos = min((low.find(t) for t in terms if t in low), default=0)
        excerpt = body[max(0, pos - 120) : pos + 280].replace("\n", " ").strip()  # _fold preserves the length of Latin letters
        results.append(
            {
                "page": f"{p.parent.name}/{p.stem}",
                "title": meta.get("title") or p.stem,
                "summary": meta.get("summary", ""),
                "excerpt": excerpt,
                "score": round(score, 1),
            }
        )
    results.sort(key=lambda r: r["score"], reverse=True)
    return results[:limit]


# ---------------------------------------------------------------------------
# Tools exposed to the agents
# ---------------------------------------------------------------------------

TOOLS = [
    {
        "name": "wiki_search",
        "description": (
            "Cherche dans la mémoire de l'organisation (wiki partagé par tous les agents). "
            "À utiliser AVANT de répondre sur l'organisation : clients, projets, outils, décisions, process, personnes."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Mots-clés."},
                "limit": {"type": "integer", "description": "Nombre de résultats (défaut 8)."},
            },
            "required": ["query"],
        },
    },
    {
        "name": "wiki_read",
        "description": "Lit une page du wiki de l'organisation (ex. 'concepts/facturation-client', 'client-acme', 'hot', 'index').",
        "parameters": {
            "type": "object",
            "properties": {"page": {"type": "string"}},
            "required": ["page"],
        },
    },
    {
        "name": "wiki_write",
        "description": (
            "Crée ou réécrit une page durable du wiki de l'organisation. Lis la page d'abord si elle existe : "
            "`body` REMPLACE le contenu entier. Une page = une entité (client, outil, personne, projet) "
            "ou un concept (décision, process, règle, cause racine). Relie-la avec au moins 2 [[liens]] "
            "vers d'autres pages (par leur nom, sans dossier). Jamais de secret, token ou mot de passe. "
            "page='hot' réécrit le contexte chaud (≤ 15 lignes : ce qui compte en ce moment dans l'organisation)."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "page": {"type": "string", "description": "Nom en minuscules-tirets, ex. 'client-acme'."},
                "type": {"type": "string", "enum": ["entity", "concept", "comparison", "query"]},
                "title": {"type": "string"},
                "summary": {"type": "string", "description": "Une ligne, reprise dans index.md."},
                "tags": {"type": "array", "items": {"type": "string"}},
                "sources": {"type": "array", "items": {"type": "string"}, "description": "Ex. 'raw/conversations/2026-09-22/compta'."},
                "body": {"type": "string", "description": "Markdown, sans frontmatter."},
            },
            "required": ["page", "body"],
        },
    },
    {
        "name": "wiki_log_session",
        "description": (
            "Ajoute l'entrée d'une conversation au journal du jour (wiki/sessions/<date>.md). "
            "Décris ce qui a été fait ou décidé, pas ce qui a été demandé."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "agent": {"type": "string", "description": "Profil de l'agent qui a tenu la conversation."},
                "summary": {"type": "string"},
                "decisions": {"type": "array", "items": {"type": "string"}},
                "links": {"type": "array", "items": {"type": "string"}, "description": "Pages concernées (noms)."},
                "source": {"type": "string", "description": "Ex. 'raw/conversations/2026-09-22/compta'."},
                "date": {"type": "string", "description": "YYYY-MM-DD, défaut aujourd'hui."},
                "time": {"type": "string", "description": "HHhMM, défaut maintenant."},
            },
            "required": ["title", "summary"],
        },
    },
]


class EdoWikiProvider(MemoryProvider):
    def __init__(self) -> None:
        self._vault: Optional[Path] = None
        self._profile = "default"
        self._session_id = ""
        self._hits = 0

    @property
    def name(self) -> str:
        return "agora_wiki"

    def is_available(self) -> bool:
        try:
            return vault_dir().is_dir()
        except Exception:
            return False

    def get_config_schema(self) -> List[Dict[str, Any]]:
        return []

    def save_config(self, values, hermes_home) -> None:
        return None

    def initialize(self, session_id: str, **kwargs) -> None:
        self._vault = vault_dir()
        self._profile = _profile_name()
        self._session_id = session_id or ""

    @property
    def _curating(self) -> bool:
        return self._session_id.startswith(CURATOR_PREFIX)

    # -- context -------------------------------------------------------------

    def system_prompt_block(self) -> str:
        if not self._vault:
            return ""
        count = sum(1 for _ in _pages(self._vault))
        pages = catalog(self._vault) if count else ""
        hot = ""
        hot_path = self._vault / "hot.md"
        if hot_path.exists():
            hot = hot_path.read_text(encoding="utf-8", errors="replace").strip()[:HOT_CAP]
        block = [
            "# Mémoire de l'organisation",
            f"Wiki partagé par tous les agents de l'organisation ({count} pages). Tu es le profil « {self._profile} ».",
            "- Avant de répondre sur l'organisation (clients, projets, outils, décisions, process), cherche avec wiki_search puis wiki_read.",
            "- Quand la conversation établit un fait durable (décision, règle, info client, process), mets la page à jour avec wiki_write.",
            "- Tes conversations sont journalisées automatiquement et compilées dans le wiki par le curateur : pas besoin de tout recopier.",
            "- La mémoire `memory` (MEMORY.md/USER.md) reste ta mémoire personnelle ; le wiki est la mémoire commune.",
        ]
        if hot:
            block += ["", "## En ce moment dans l'organisation (hot.md)", hot]
        if pages:
            block += ["", "## Catalogue du wiki (toutes les pages ; wiki_read pour le contenu)", pages]
        return "\n".join(block)

    def prefetch(self, query: str, *, session_id: str = "") -> str:
        self._hits = 0
        if not self._vault or self._curating or is_trivial_prompt(query):
            return ""
        try:
            results = [r for r in search(self._vault, query, limit=4) if r["score"] >= 2]
        except Exception as exc:
            logger.debug("agora_wiki prefetch: %s", exc)
            return ""
        if not results:
            return ""
        self._hits = len(results)
        # The top two pages are injected with their content: the agent doesn't have to remember to read them.
        out, size = ["## Mémoire de l'organisation — pages liées à ce message (wiki_read pour la suite)"], 0
        for i, r in enumerate(results):
            text = r["summary"] or r["excerpt"][:200]
            if i < 2:
                path = _find_page(self._vault, r["page"])
                if path:
                    _, body = parse_page(path.read_text(encoding="utf-8", errors="replace"))
                    text = f"{r['summary']}\n{body.strip()[:1200]}".strip()
            line = f"### [[{r['page']}]] {r['title']}\n{text}" if i < 2 else f"- [[{r['page']}]] {r['title']} — {text}"
            size += len(line)
            if size > PREFETCH_CAP:
                break
            out.append(line)
        return "\n\n".join(out)

    # -- automatic feed (raw layer) ------------------------------------------

    def sync_turn(self, user_content: str, assistant_content: str, *, session_id: str = "", messages=None) -> None:
        sid = session_id or self._session_id
        if not self._vault or sid.startswith(CURATOR_PREFIX) or not (user_content or assistant_content):
            return
        now = _now()
        path = self._vault / "raw" / "conversations" / now.strftime("%Y-%m-%d") / f"{self._profile}.md"
        entry = (
            f"\n## {now.strftime('%H:%M')} · {sid or 'session'}\n\n"
            f"**Utilisateur :** {(user_content or '').strip()[:TURN_CAP]}\n\n"
            f"**{self._profile} :** {(assistant_content or '').strip()[:TURN_CAP]}\n"
        )
        try:
            with _locked(self._vault):
                if not path.exists():
                    _append(path, f"# Conversations — {self._profile} — {now.strftime('%Y-%m-%d')}\n")
                _append(path, entry)
        except Exception as exc:
            logger.warning("agora_wiki sync_turn: %s", exc)

    def on_memory_write(self, action: str, target: str, content: str, metadata=None) -> None:
        if not self._vault or self._curating or not content:
            return
        path = self._vault / "raw" / "memories" / f"{self._profile}.md"
        line = f"- {_now().strftime('%Y-%m-%d %H:%M')} · {target} · {action} · {content.strip()[:1200].replace(chr(10), ' ')}\n"
        try:
            with _locked(self._vault):
                if not path.exists():
                    _append(path, f"# Mémoire Hermes — {self._profile}\n\n")
                _append(path, line)
        except Exception as exc:
            logger.warning("agora_wiki on_memory_write: %s", exc)

    # -- tools ---------------------------------------------------------------

    def get_tool_schemas(self) -> List[Dict[str, Any]]:
        return TOOLS

    def handle_tool_call(self, tool_name: str, args: Dict[str, Any], **kwargs) -> str:
        if not self._vault:
            return json.dumps({"error": "Mémoire de l'organisation indisponible"})
        try:
            if tool_name == "wiki_search":
                return json.dumps({"results": search(self._vault, str(args.get("query", "")), int(args.get("limit") or 8))}, ensure_ascii=False)
            if tool_name == "wiki_read":
                return self._read(str(args.get("page", "")))
            if tool_name == "wiki_write":
                return self._write(args)
            if tool_name == "wiki_log_session":
                return self._log_session(args)
        except Exception as exc:
            logger.warning("agora_wiki %s: %s", tool_name, exc)
            return json.dumps({"error": str(exc)})
        return json.dumps({"error": f"Outil inconnu : {tool_name}"})

    def _read(self, ref: str) -> str:
        path = _find_page(self._vault, ref)
        if not path:
            hits = search(self._vault, ref.replace("-", " "), limit=5)
            return json.dumps({"error": "Page introuvable", "suggestions": [h["page"] for h in hits]}, ensure_ascii=False)
        text = path.read_text(encoding="utf-8", errors="replace")
        return json.dumps({"page": str(path.relative_to(self._vault)), "content": text[:20000]}, ensure_ascii=False)

    def _write(self, args: Dict[str, Any]) -> str:
        slug = str(args.get("page", "")).strip().removesuffix(".md").split("/")[-1].lower()
        body = str(args.get("body", "")).strip()
        if not body:
            return json.dumps({"error": "body est vide"})
        now = _now()
        if slug == "hot":
            with _locked(self._vault):
                (self._vault / "hot.md").write_text(body[:HOT_CAP] + "\n", encoding="utf-8")
                _append(self._vault / "log.md", f"\n## [{now:%Y-%m-%d %H:%M}] hot | contexte chaud mis à jour ({self._profile})\n")
            return json.dumps({"ok": True, "page": "hot.md"})
        if not SLUG.match(slug):
            return json.dumps({"error": "Nom de page invalide : minuscules, chiffres et tirets."})
        kind = str(args.get("type") or "concept")
        if kind not in PAGE_DIRS:
            return json.dumps({"error": f"type invalide : {kind}"})
        with _locked(self._vault):
            existing = _find_page(self._vault, slug)
            if existing and existing.parent.name == "sessions":
                existing = None
            target = existing or (self._vault / "wiki" / PAGE_DIRS[kind] / f"{slug}.md")
            meta: Dict[str, Any] = {}
            if existing:
                meta, _ = parse_page(existing.read_text(encoding="utf-8", errors="replace"))
            authors = list(dict.fromkeys([*(meta.get("authors") or []), self._profile]))
            sources = list(dict.fromkeys([*(meta.get("sources") or []), *(args.get("sources") or [])]))
            meta.update(
                {
                    "title": args.get("title") or meta.get("title") or slug.replace("-", " ").capitalize(),
                    "type": kind if not existing else meta.get("type", kind),
                    "summary": args.get("summary") or meta.get("summary", ""),
                    "created": meta.get("created") or now.strftime("%Y-%m-%d"),
                    "updated": now.strftime("%Y-%m-%d"),
                    "tags": args.get("tags") or meta.get("tags") or [],
                    "sources": sources,
                    "authors": authors,
                }
            )
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(_dump_page(meta, body), encoding="utf-8")
            verb = "mise à jour" if existing else "création"
            _append(self._vault / "log.md", f"\n## [{now:%Y-%m-%d %H:%M}] page | {verb} [[{slug}]] ({self._profile})\n")
            rebuild_index(self._vault)
        links = {m.group(1).split("/")[-1].strip() for m in WIKILINK.finditer(body)}
        result: Dict[str, Any] = {"ok": True, "page": f"{target.parent.name}/{slug}", "created": not existing}
        if len(links) < 2:
            result["warning"] = "Moins de 2 [[liens]] sortants : relie la page au reste du wiki."
        return json.dumps(result, ensure_ascii=False)

    def _log_session(self, args: Dict[str, Any]) -> str:
        now = _now()
        date = str(args.get("date") or now.strftime("%Y-%m-%d"))
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", date):
            return json.dumps({"error": "date invalide"})
        time = str(args.get("time") or now.strftime("%Hh%M"))
        agent = str(args.get("agent") or self._profile)
        lines = [f"\n## [{time}] {str(args.get('title', '')).strip()} — {agent}", "", f"**Agent :** {agent}", f"**Résumé :** {str(args.get('summary', '')).strip()}"]
        decisions = [d for d in (args.get("decisions") or []) if str(d).strip()]
        if decisions:
            lines += ["**Décisions :**", *(f"- {d}" for d in decisions)]
        links = [l for l in (args.get("links") or []) if str(l).strip()]
        if links:
            lines.append("**Pages :** " + ", ".join(f"[[{str(l).split('/')[-1]}]]" for l in links))
        if args.get("source"):
            lines.append(f"**Source :** [[{str(args['source']).removesuffix('.md')}]]")
        path = self._vault / "wiki" / "sessions" / f"{date}.md"
        with _locked(self._vault):
            fresh = not path.exists()
            if fresh:
                _append(path, f"# Sessions — {date}\n")
            _append(path, "\n".join(lines) + "\n")
            _append(self._vault / "log.md", f"\n## [{now:%Y-%m-%d %H:%M}] session | {args.get('title', '')} ({agent})\n")
            if fresh:
                rebuild_index(self._vault)
        return json.dumps({"ok": True, "page": f"sessions/{date}"})


def register(ctx) -> None:
    ctx.register_memory_provider(EdoWikiProvider())
