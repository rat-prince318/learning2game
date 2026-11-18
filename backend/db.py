"""SQLite persistence. Each mutating request owns a short, atomic transaction."""

import sqlite3
from contextlib import contextmanager
from pathlib import Path

from filelock import FileLock, Timeout


@contextmanager
def exclusive_store(data_dir: Path):
    """Only one worker may recover jobs or modify files in this store."""
    data_dir.mkdir(parents=True, exist_ok=True)
    lock = FileLock(data_dir / "server.lock", timeout=0)
    try:
        lock.acquire()
    except Timeout as exc:
        raise RuntimeError("This data directory is in use. Run one backend worker per directory.") from exc
    try:
        yield
    finally:
        lock.release()


@contextmanager
def open_database(path: Path, *, write: bool = False):
    conn = sqlite3.connect(path, timeout=10, isolation_level=None)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("BEGIN IMMEDIATE" if write else "BEGIN")
        yield conn
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        conn.close()


def connection(app, *, write: bool = False):
    return open_database(app.state.db_path, write=write)


def initialize(app):
    # Set journal mode outside a transaction, once per process startup.
    db = sqlite3.connect(app.state.db_path)
    try:
        db.execute("PRAGMA journal_mode = WAL")
        schema = Path(__file__).with_name("schema.sql").read_text(encoding="utf-8")
        db.executescript(schema)
        db.execute(
            """UPDATE jobs SET status='failed', error='Server restarted. Retry this operation.',
                      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
               WHERE status NOT IN ('completed','failed','awaiting_confirmation')"""
        )
        db.commit()
    finally:
        db.close()
