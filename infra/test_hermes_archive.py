import importlib.util
import fcntl
import os
import sqlite3
import socket
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
verify_spec = importlib.util.spec_from_file_location("verify_archive", Path(__file__).with_name("verify-hermes-backup.py"))
verifier = importlib.util.module_from_spec(verify_spec)
verify_spec.loader.exec_module(verifier)


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

    def test_idle_wal_database_on_a_read_only_mount_is_snapshotted_from_a_copy(self):
        # Production: Hermes' WAL databases have no -shm while closed, and the
        # archiver mounts the volume read-only, so SQLite cannot open them in place.
        with tempfile.TemporaryDirectory() as scratch:
            root = Path(scratch, "source"); (root / "cron").mkdir(parents=True)
            db = sqlite3.connect(root / "cron/executions.db")
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("CREATE TABLE sample (value TEXT)")
            db.execute("INSERT INTO sample VALUES ('kept')"); db.commit(); db.close()
            self.assertFalse((root / "cron/executions.db-shm").exists())
            for path in [root / "cron", root]: path.chmod(0o555)
            try:
                with self.assertRaises(sqlite3.OperationalError):
                    sqlite3.connect((root / "cron/executions.db").as_uri() + "?mode=ro", uri=True).execute("SELECT 1 FROM sample").fetchall()
                output = Path(scratch, "backup.tgz")
                result = module.create_archive(root, output, [])
            finally:
                for path in [root, root / "cron"]: path.chmod(0o755)
            self.assertEqual(result["sqliteSnapshots"], 1)
            self.assertEqual(sorted(p.name for p in Path(scratch).iterdir()), ["backup.tgz", "source"])
            with tarfile.open(output) as archive:
                restored = Path(scratch, "restored.db")
                restored.write_bytes(archive.extractfile("./cron/executions.db").read())
            copy = sqlite3.connect(restored)
            try:
                self.assertEqual(copy.execute("SELECT value FROM sample").fetchall(), [("kept",)])
            finally: copy.close()

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

    def test_a_failed_archive_reports_its_cause_last(self):
        with tempfile.TemporaryDirectory() as scratch:
            root = Path(scratch, "missing")
            output = Path(scratch, "backup.tgz")
            result = subprocess.run([sys.executable, spec.origin, str(root), str(output), "[]", str(Path(scratch, "archive.lock"))], capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode, 1)
            self.assertTrue(result.stderr.strip().splitlines()[-1].startswith("Hermes archive failed: FileNotFoundError: "))
            self.assertFalse(output.exists())

    def test_live_unix_sockets_are_ignored_like_tar(self):
        with tempfile.TemporaryDirectory() as scratch:
            root = Path(scratch, "source"); root.mkdir()
            output = Path(scratch, "backup.tgz")
            (root / "config.yaml").write_text("fixture")
            with socket.socket(socket.AF_UNIX) as endpoint:
                endpoint.bind(str(root / "gateway.sock"))
                module.create_archive(root, output, [])
            with tarfile.open(output) as archive:
                self.assertNotIn("./gateway.sock", archive.getnames())
                self.assertEqual(archive.extractfile("./config.yaml").read(), b"fixture")

    def test_extensionless_runtime_database_is_snapshotted_but_code_fixtures_are_preserved(self):
        with tempfile.TemporaryDirectory() as scratch:
            root = Path(scratch, "source"); root.mkdir()
            code = root / "worktrees/repo"; code.mkdir(parents=True)
            fixture = b"SQLite format 3\x00" + b"deliberately invalid test fixture"
            (code / "fixture.db").write_bytes(fixture)
            db = sqlite3.connect(root / "Cookies")
            try:
                db.execute("PRAGMA journal_mode=WAL")
                db.execute("CREATE TABLE sample(value TEXT)"); db.commit()
                output = Path(scratch, "backup.tgz")
                self.assertEqual(module.create_archive(root, output, [])["sqliteSnapshots"], 1)
                with tarfile.open(output) as archive:
                    self.assertNotIn("./Cookies-wal", archive.getnames())
                    self.assertEqual(archive.extractfile("./worktrees/repo/fixture.db").read(), fixture)
                with output.open("rb") as stream:
                    self.assertEqual(verifier.verify(stream)["sqliteDatabasesRestored"], 1)
            finally: db.close()


if __name__ == "__main__": unittest.main()
