import importlib.util
import fcntl
import os
import sqlite3
import tarfile
import tempfile
import subprocess
import sys
import unittest
from unittest.mock import patch
from pathlib import Path

spec = importlib.util.spec_from_file_location("hermes_archive", Path(__file__).resolve().parents[1] / "apps/updater/hermes-archive.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class OnlineArchiveTests(unittest.TestCase):
    def test_live_wal_is_folded_into_a_standalone_database_without_pausing_writer(self):
        with tempfile.TemporaryDirectory() as scratch:
            root = Path(scratch, "source"); root.mkdir()
            db = sqlite3.connect(root / "state.db")
            try:
                db.execute("PRAGMA journal_mode=WAL")
                db.execute("CREATE TABLE sample (value TEXT)")
                db.execute("INSERT INTO sample VALUES ('before')"); db.commit()
                output = Path(scratch, "backup.tgz")
                result = module.create_archive(root, output, [])
                db.execute("INSERT INTO sample VALUES ('after')"); db.commit()
                self.assertEqual(result["sqliteSnapshots"], 1)
                with tarfile.open(output) as archive:
                    names = archive.getnames()
                    self.assertNotIn("./state.db-wal", names)
                    self.assertNotIn("./state.db-shm", names)
                    restored = Path(scratch, "restored.db")
                    restored.write_bytes(archive.extractfile("./state.db").read())
                copy = sqlite3.connect(restored)
                try:
                    self.assertEqual(copy.execute("PRAGMA quick_check").fetchone(), ("ok",))
                    self.assertEqual(copy.execute("SELECT value FROM sample").fetchall(), [("before",)])
                finally: copy.close()
                self.assertEqual(db.execute("SELECT count(*) FROM sample").fetchone(), (2,))
            finally: db.close()

    def test_source_lockfiles_git_and_kept_hardlinks_survive_cache_exclusions(self):
        with tempfile.TemporaryDirectory() as scratch:
            root = Path(scratch, "source"); root.mkdir()
            for path in ["project/node_modules", ".bun/install/cache", "project/.git"]:
                (root / path).mkdir(parents=True)
            (root / "project/node_modules/dep").write_text("dependency")
            (root / ".bun/install/cache/pkg").write_text("source")
            os.link(root / ".bun/install/cache/pkg", root / "project/app.ts")
            os.link(root / "project/app.ts", root / "project/other.ts")
            (root / "project/pnpm-lock.yaml").write_text("lockfile")
            (root / "project/.git/config").write_text("git configuration")
            output = Path(scratch, "backup.tgz")
            module.create_archive(root, output, ["node_modules", "*/.bun/install/cache"])
            with tarfile.open(output) as archive:
                names = archive.getnames()
                self.assertNotIn("./project/node_modules/dep", names)
                self.assertNotIn("./.bun/install/cache/pkg", names)
                self.assertEqual(archive.extractfile("./project/app.ts").read(), b"source")
                self.assertEqual(archive.extractfile("./project/other.ts").read(), b"source")
                self.assertEqual(archive.extractfile("./project/pnpm-lock.yaml").read(), b"lockfile")
                self.assertIn("./project/.git/config", names)

    def test_an_invalid_sqlite_database_cannot_publish_an_archive(self):
        with tempfile.TemporaryDirectory() as scratch:
            root = Path(scratch, "source"); root.mkdir()
            (root / "broken.db").write_bytes(b"SQLite format 3\x00" + b"invalid" * 512)
            output = Path(scratch, "backup.tgz")
            with self.assertRaises(sqlite3.DatabaseError):
                module.create_archive(root, output, [])
            self.assertFalse(output.exists())

    def test_a_competing_archiver_cannot_start_a_second_writer(self):
        with tempfile.TemporaryDirectory() as scratch:
            root = Path(scratch, "source"); root.mkdir()
            output = Path(scratch, "backup.tgz")
            lock_path = Path(scratch, "archive.lock")
            with lock_path.open("a") as lock:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                result = subprocess.run([sys.executable, spec.origin, str(root), str(output), "[]", str(lock_path)], capture_output=True, timeout=5)
            self.assertEqual(result.returncode, 1)
            self.assertFalse(output.exists())

    def test_archive_space_reserve_is_checked_during_writes(self):
        with tempfile.TemporaryDirectory() as scratch:
            root = Path(scratch, "source"); root.mkdir()
            output = Path(scratch, "backup.tgz")
            with patch.object(module.shutil, "disk_usage", return_value=type("Usage", (), {"free": 50})()):
                with self.assertRaises(OSError): module.create_archive(root, output, [], reserve_bytes=1000)
            self.assertFalse(output.exists())


if __name__ == "__main__": unittest.main()
