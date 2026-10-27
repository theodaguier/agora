"""Stream Hermes files and online SQLite snapshots into a standard tar.gz archive."""
import fnmatch
import gzip
import json
import signal
import sqlite3
import sys
import tarfile
import tempfile
import time
from contextlib import closing
from pathlib import Path


def create_archive(root, output, excludes):
    root, output = Path(root).resolve(), Path(output)
    sqlite_paths = set()
    files = 0

    def excluded(relative):
        return any(fnmatch.fnmatch("./" + relative, pattern) or
                   any(fnmatch.fnmatch(part, pattern) for part in Path(relative).parts)
                   for pattern in excludes)

    try:
        with tempfile.TemporaryDirectory(prefix=".sqlite-", dir=output.parent) as scratch:
            with gzip.open(output, "wb", compresslevel=1) as compressed:
                with tarfile.open(fileobj=compressed, mode="w|") as archive:
                    def add(path, relative):
                        nonlocal files
                        if excluded(relative):
                            return
                        # SQLite is saved via its online backup API, so its live WAL/journal
                        # must not be restored on top of the standalone snapshot.
                        for suffix in ("-wal", "-shm", "-journal"):
                            if relative.endswith(suffix) and relative[:-len(suffix)] in sqlite_paths:
                                return
                        info = archive.gettarinfo(str(path), arcname="./" + relative if relative != "." else ".")
                        if info.islnk() and info.linkname.removeprefix("./") in sqlite_paths:
                            sqlite_paths.add(relative)
                        if info.isfile():
                            files += 1
                            is_sqlite = False
                            if path.suffix.lower() in (".db", ".sqlite", ".sqlite3"):
                                with path.open("rb") as header:
                                    is_sqlite = header.read(16) == b"SQLite format 3\x00"
                            if is_sqlite:
                                target = Path(scratch, "snapshot.db")
                                deadline = time.monotonic() + 60

                                def progress(*_):
                                    if time.monotonic() > deadline:
                                        raise TimeoutError("SQLite snapshot timed out")

                                with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=5)) as source:
                                    with closing(sqlite3.connect(target)) as destination:
                                        source.backup(destination, pages=1024, progress=progress, sleep=0.05)
                                info.size = target.stat().st_size
                                with target.open("rb") as content:
                                    archive.addfile(info, content)
                                target.unlink()
                                sqlite_paths.add(relative)
                            else:
                                with path.open("rb") as content:
                                    archive.addfile(info, content)
                        else:
                            archive.addfile(info)
                        if info.isdir():
                            # The database precedes its -wal/-shm siblings.
                            for child in sorted(path.iterdir(), key=lambda p: p.name):
                                add(child, child.relative_to(root).as_posix())
                    add(root, ".")
        return {"files": files, "sqliteSnapshots": len(sqlite_paths)}
    except BaseException:
        output.unlink(missing_ok=True)
        raise


if __name__ == "__main__":
    signal.alarm(1200)
    try:
        print(json.dumps(create_archive(sys.argv[1], sys.argv[2], json.loads(sys.argv[3]))))
    except Exception as error:
        print("Hermes archive failed: " + type(error).__name__, file=sys.stderr)
        sys.exit(1)
