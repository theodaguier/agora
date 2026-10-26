import io
import sqlite3
import tarfile
import tempfile
import unittest
from pathlib import Path

from importlib.util import module_from_spec, spec_from_file_location

spec = spec_from_file_location("verify_backup", Path(__file__).with_name("verify-hermes-backup.py"))
module = module_from_spec(spec)
spec.loader.exec_module(module)


def archive(files):
    out = io.BytesIO()
    with tarfile.open(fileobj=out, mode="w:gz") as tar:
        for name, data in files.items():
            member = tarfile.TarInfo(name)
            member.size = len(data)
            tar.addfile(member, io.BytesIO(data))
    return out.getvalue()


class BackupRestoreTests(unittest.TestCase):
    def test_restores_sqlite_with_its_wal_and_contains_archive_paths(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root, "state.db")
            db = sqlite3.connect(path)
            try:
                db.execute("PRAGMA journal_mode=WAL")
                db.execute("CREATE TABLE sample (value TEXT)")
                db.execute("INSERT INTO sample VALUES ('fixture')")
                db.commit()
                # Also exercise a hostile path: verification never extracts paths verbatim.
                payload = archive({"../../escape.db": path.read_bytes(), "../../escape.db-wal": Path(str(path) + "-wal").read_bytes(), "notes.txt": b"source"})
                result = module.verify(io.BytesIO(payload))
                self.assertEqual(result, {"archive": "ok", "files": 3, "sqliteDatabasesRestored": 1})
                self.assertFalse(Path(root, "escape.db").exists())
            finally:
                db.close()

    def test_bad_gzip_checksum_is_rejected_even_after_tar_end(self):
        payload = bytearray(archive({"notes.txt": b"fixture"}))
        payload[-8] ^= 1
        with self.assertRaises((OSError, EOFError, tarfile.TarError)):
            module.verify(io.BytesIO(payload))

    def test_corrupt_sqlite_is_rejected(self):
        payload = archive({"state.db": b"SQLite format 3\x00" + b"bad database" * 512})
        with self.assertRaises(sqlite3.DatabaseError):
            module.verify(io.BytesIO(payload))


if __name__ == "__main__":
    unittest.main()
