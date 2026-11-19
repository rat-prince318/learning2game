"""Upgrade a store populated by the pre-RPG schema without changing its Matching records."""

import sqlite3
from types import SimpleNamespace

import pytest

from backend.db import initialize, open_database


def test_upgrade_restarts_and_events_integrity(tmp_path):
    path = tmp_path / "old.sqlite3"
    app = SimpleNamespace(state=SimpleNamespace(db_path=path))
    # The legacy tables changed by this migration are intentionally independent of schema.sql.
    # Other tables are created by the current schema, as on a new install.
    with open_database(path, write=True) as conn:
        conn.executescript("""
            CREATE TABLE materials(id TEXT PRIMARY KEY, original_name TEXT NOT NULL, path TEXT NOT NULL,
                media_type TEXT NOT NULL, result_json TEXT);
            CREATE TABLE plans(id TEXT PRIMARY KEY, material_id TEXT REFERENCES materials(id) ON DELETE CASCADE,
                config_json TEXT, preferences_json TEXT, scope_json TEXT, game_id TEXT, game_job_id TEXT,
                practice_session_id TEXT, created_at TEXT);
            CREATE TABLE games(id TEXT PRIMARY KEY, plan_id TEXT REFERENCES plans(id) ON DELETE CASCADE,
                internal_json TEXT, public_json TEXT, card_map_json TEXT);
            CREATE TABLE jobs(id TEXT PRIMARY KEY, kind TEXT, resource_id TEXT, status TEXT, error TEXT,
                result_json TEXT, stages_json TEXT, tools_json TEXT, mode TEXT, created_at TEXT, updated_at TEXT);
            INSERT INTO materials VALUES('m','slides.txt','slides.txt','text/plain','{}');
            INSERT INTO plans(id,material_id) VALUES('old-plan','m');
            INSERT INTO games VALUES('old-game','old-plan','private','public','map');
        """)
        kinds = ["extraction", "planning", "generation", "practice", "feedback"]
        conn.executemany("INSERT INTO jobs(id,kind,resource_id,status) VALUES (?,?,'m','completed')",
                         [(k, k) for k in kinds])
    initialize(app)
    with open_database(path, write=True) as conn:
        types = dict(conn.execute("SELECT kind,game_type FROM jobs"))
        assert types == {k: None if k == "extraction" else "matching" for k in kinds}
        assert tuple(conn.execute("SELECT game_type,confirmed_at FROM plans").fetchone()) == ("matching", None)
        assert tuple(conn.execute("SELECT game_type,public_json FROM games").fetchone()) == ("matching", "public")
        conn.execute("INSERT INTO jobs(id,kind,resource_id,status) VALUES ('rec','planning','m','completed')")
        conn.execute("INSERT INTO plans(id,material_id,game_type) VALUES('rpg-plan','m','rpg_quest')")
        conn.execute("INSERT INTO games(id,plan_id,game_type) VALUES('rpg-game','rpg-plan','rpg_quest')")
        conn.execute("INSERT INTO sessions(id,game_id,status) VALUES('s','rpg-game','active')")
    initialize(app)
    with open_database(path, write=True) as conn:
        assert conn.execute("SELECT game_type FROM jobs WHERE id='rec'").fetchone()[0] is None
        assert conn.execute("SELECT game_type FROM plans WHERE id='rpg-plan'").fetchone()[0] == "rpg_quest"
        sql = """INSERT INTO rpg_events(session_id,event_id,kind,payload_json,knowledge_id,correct,result_json)
                 VALUES ('s',?,?,'{}',?,?,'{}')"""
        for invalid in [("e", "attempt", "k", None), ("e", "attempt", None, 1),
                        ("e", "enter_scene", None, 0), ("e", "hint", "k", 1)]:
            with pytest.raises(sqlite3.IntegrityError):
                conn.execute(sql, invalid)
        conn.execute(sql, ("e", "attempt", "k", 1))
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(sql, ("e", "attempt", "k", 1))
        conn.execute("INSERT INTO reports(session_id,stats_json) VALUES ('s','{}')")
        conn.execute("DELETE FROM materials WHERE id='m'")
        for table in ("plans", "games", "sessions", "reports", "rpg_events"):
            assert conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] == 0
        assert not list(conn.execute("PRAGMA foreign_key_check"))
