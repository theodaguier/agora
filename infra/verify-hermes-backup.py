"""Read the complete gzip stream, restore SQLite files in isolation, and check integrity."""
import gzip
import hashlib
import json
import shutil
import sqlite3
import sys
import tarfile
import tempfile
from contextlib import closing
from pathlib import Path


def verify(stream):
    databases = set()
    files = 0
    with tempfile.TemporaryDirectory(prefix="agora-restore-") as scratch:
        with gzip.GzipFile(fileobj=stream) as compressed:
            with tarfile.open(fileobj=compressed, mode="r|") as archive:
                for member in archive:
                    if not member.isfile():
                        continue
                    files += 1
                    suffix = next((s for s in ("-wal", "-shm") if member.name.endswith(".db" + s)), "")
                    base = member.name[:-len(suffix)] if suffix else member.name
                    if not base.endswith((".db", ".sqlite", ".sqlite3")):
                        continue
                    # Flatten names: no archive path can escape the temporary directory.
                    key = hashlib.sha256(base.encode()).hexdigest() + ".db"
                    target = Path(scratch, key + suffix)
                    with archive.extractfile(member) as source, target.open("wb") as out:
                        shutil.copyfileobj(source, out)
                    if not suffix:
                        with target.open("rb") as header:
                            if header.read(16) == b"SQLite format 3\x00":
                                databases.add(key)
            # tar ends before gzip's trailer: consume it too, so a bad CRC fails the check.
            while compressed.read(1024 * 1024):
                pass
        for name in databases:
            with closing(sqlite3.connect(Path(scratch, name).as_uri() + "?mode=ro", uri=True)) as db:
                if db.execute("PRAGMA quick_check").fetchall() != [("ok",)]:
                    raise RuntimeError("Restored SQLite integrity check failed")
    return {"archive": "ok", "files": files, "sqliteDatabasesRestored": len(databases)}


if __name__ == "__main__":
    print(json.dumps(verify(sys.stdin.buffer)))
