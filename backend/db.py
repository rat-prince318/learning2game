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
        # SQLite ALTER TABLE and the data backfill must either both commit or both roll back.
        db.executescript("PRAGMA foreign_keys = ON;\nBEGIN IMMEDIATE;\n" + schema)
        # Preserve uploads and sessions from earlier D checkouts.
        columns = {row[1] for row in db.execute("PRAGMA table_info(materials)")}
        if "options_json" not in columns:
            db.execute("ALTER TABLE materials ADD COLUMN options_json TEXT NOT NULL DEFAULT '{}'")
        if "delete_token_hash" not in columns:
            db.execute("ALTER TABLE materials ADD COLUMN delete_token_hash TEXT")
        typed = "TEXT NOT NULL DEFAULT 'matching' CHECK(game_type IN ('matching','rpg_quest'))"
        for table in ("plans", "games"):
            columns = {row[1] for row in db.execute(f"PRAGMA table_info({table})")}
            if "game_type" not in columns:
                db.execute(f"ALTER TABLE {table} ADD COLUMN game_type {typed}")
            if table == "plans" and "confirmed_at" not in columns:
                db.execute("ALTER TABLE plans ADD COLUMN confirmed_at TEXT")
        job_columns = {row[1] for row in db.execute("PRAGMA table_info(jobs)")}
        if "game_type" not in job_columns:
            db.execute("ALTER TABLE jobs ADD COLUMN game_type TEXT CHECK(game_type IN ('matching','rpg_quest'))")
            # Only pre-RPG planning jobs were guaranteed to be Matching-specific.
            # New recommendation jobs also use planning and intentionally remain untyped.
            db.execute("""UPDATE jobs SET game_type='matching'
                          WHERE kind IN ('planning','generation','practice','feedback')""")
        db.execute(
            """UPDATE jobs SET status='failed', error='Server restarted. Retry this operation.',
                      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
               WHERE status NOT IN ('completed','failed','awaiting_confirmation')"""
        )
        db.commit()
    finally:
        db.close()
