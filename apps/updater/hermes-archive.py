"""Stream Hermes files and online SQLite snapshots into a standard tar.gz archive."""
import fnmatch
import fcntl
import gzip
import json
import shutil
import signal
import sqlite3
import sys
import tarfile
import tempfile
import time
from contextlib import closing
from pathlib import Path


class ReservedWriter:
    def __init__(self, file, reserve, path):
        self.file, self.reserve, self.path, self.written = file, reserve, path, 4 * 1024 ** 2

    def write(self, data):
        if self.reserve and self.written >= 4 * 1024 ** 2:
            if shutil.disk_usage(self.path).free < self.reserve + len(data):
                raise OSError("Insufficient archive space")
            self.written = 0
        self.written += len(data)
        return self.file.write(data)

    def __getattr__(self, name):
        return getattr(self.file, name)


def create_archive(root, output, excludes, reserve_bytes=0):
    root, output = Path(root).resolve(), Path(output)
    sqlite_paths = set()
    files = 0

    def excluded(relative):
        return any(fnmatch.fnmatch("./" + relative, pattern) or
                   any(fnmatch.fnmatch(part, pattern) for part in Path(relative).parts)
                   for pattern in excludes)

    try:
        with tempfile.TemporaryDirectory(prefix=".sqlite-", dir=output.parent) as scratch:
            with output.open("wb") as file, gzip.GzipFile(fileobj=ReservedWriter(file, reserve_bytes, output.parent), mode="wb", compresslevel=1) as compressed:
                with tarfile.open(fileobj=compressed, mode="w|", pax_headers={"agora.archive.format": "sqlite-online-v1"}) as archive:
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
                        # Unix sockets are transient endpoints, not restorable files.
                        if info is None:
                            return
                        if info.islnk() and info.linkname.removeprefix("./") in sqlite_paths:
                            sqlite_paths.add(relative)
                        if info.isfile():
                            files += 1
                            is_sqlite = False
                            # Runtime databases can be extensionless (for example Chromium's
                            # Cookies). Coding worktrees, uploads and Git objects are user files:
                            # preserve their bytes, including deliberately invalid DB fixtures.
                            raw_files = {".git", "worktrees", "repos", "projects", "uploads", "attachments", "shared-skills"}
                            if not any(part in raw_files for part in Path(relative).parts):
                                with path.open("rb") as header:
                                    is_sqlite = header.read(16) == b"SQLite format 3\x00"
                            if is_sqlite:
                                target = Path(scratch, "snapshot.db")
                                deadline = time.monotonic() + 60

                                def progress(*_):
                                    if time.monotonic() > deadline:
                                        raise TimeoutError("SQLite snapshot timed out")

                                with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=5)) as source:
                                    size = source.execute("PRAGMA page_count").fetchone()[0] * source.execute("PRAGMA page_size").fetchone()[0]
                                    if reserve_bytes and shutil.disk_usage(output.parent).free < size + reserve_bytes:
                                        raise OSError("Insufficient SQLite snapshot space")
                                    with closing(sqlite3.connect(target)) as destination:
                                        source.backup(destination, pages=1024, progress=progress, sleep=0.05)
                                info.size = target.stat().st_size
                                info.pax_headers["agora.sqlite.snapshot"] = "1"
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
        with open(sys.argv[4], "a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            print(json.dumps(create_archive(sys.argv[1], sys.argv[2], json.loads(sys.argv[3]), reserve_bytes=1024 ** 3)))
    except Exception as error:
        print("Hermes archive failed: " + type(error).__name__, file=sys.stderr)
        sys.exit(1)
