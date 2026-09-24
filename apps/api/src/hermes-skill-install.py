"""
Installs a skill whose files Agora downloaded itself (skills-sh-install.ts), through
Hermes's own pipeline: quarantine, security scan, install policy, then install and
lock.json entry, exactly as `hermes skills install` does after its download step.

Run with Hermes's interpreter, HERMES_HOME set to the target profile's home.
stdin: {"name", "identifier", "metadata", "files": {relative path: base64}}
stdout (last line): {"status": "installed" | "exists" | "blocked", "verdict", "path", "reason"}
"""

import base64
import json
import shutil
import sys
from pathlib import Path


def main() -> None:
    req = json.load(sys.stdin)
    from tools.skills_guard import TRUSTED_REPOS, scan_skill_cached, should_allow_install
    from tools.skills_hub import HUB_DIR, HubLockFile, SKILLS_DIR, ensure_hub_dirs
    from tools.skills_hub_install import install_from_quarantine, quarantine_bundle
    from tools.skills_hub_models import SkillBundle, source_url_for_bundle

    ensure_hub_dirs()
    existing = HubLockFile().get_installed(req["name"])
    if existing:
        print(json.dumps({"status": "exists", "verdict": existing.get("scan_verdict"), "path": existing.get("install_path")}))
        return

    # Same trust rule as Hermes's GitHub adapter: owner/repo in the trusted list, community otherwise.
    repo = "/".join(req["identifier"].split("/")[1:3])
    bundle = SkillBundle(
        name=req["name"],
        files={path: base64.b64decode(content) for path, content in req["files"].items()},
        source="skills.sh",
        identifier=req["identifier"],
        trust_level="trusted" if repo in TRUSTED_REPOS else "community",
        metadata=req.get("metadata") or {},
    )
    q_path = quarantine_bundle(bundle)
    result, _prov = scan_skill_cached(
        q_path, source=bundle.identifier, source_url=source_url_for_bundle(bundle), cache_dir=HUB_DIR / "scan-cache"
    )
    allowed, reason = should_allow_install(result)
    if not allowed:
        shutil.rmtree(q_path, ignore_errors=True)
        print(json.dumps({"status": "blocked", "verdict": result.verdict, "reason": reason}))
        return
    install_dir = install_from_quarantine(q_path, bundle.name, "", bundle, result)
    try:
        # What `hermes skills install` does last: the change shows up without waiting for a new session.
        from agent.prompt_builder import clear_skills_system_prompt_cache

        clear_skills_system_prompt_cache(clear_snapshot=True)
    except Exception:
        pass
    path = install_dir.resolve().relative_to(Path(SKILLS_DIR).resolve()).as_posix()
    print(json.dumps({"status": "installed", "verdict": result.verdict, "path": path}))


if __name__ == "__main__":
    main()
