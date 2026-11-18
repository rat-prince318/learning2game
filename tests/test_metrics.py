import json
import sqlite3
from contextlib import closing
from pathlib import Path

import pytest

from backend.metrics import summarize


def test_aggregates_attempts_and_recorded_timings_by_service_mode(tmp_path):
    db = tmp_path / "edugame.sqlite3"
    schema = Path(__file__).resolve().parents[1] / "backend" / "schema.sql"
    jobs = [
        ("demo", "generation", "completed", {"generating": 1, "validating": 0.5}),
        ("integrated", "extraction", "completed", {"extracting": 12, "validating": 2}),
        ("integrated", "planning", "awaiting_confirmation", {"planning": 6}),
        ("integrated", "generation", "completed", {"generating": 20, "validating": 4}),
        ("integrated", "generation", "failed", {"generating": 40}),
        ("integrated", "generation", "queued", {}),
        ("integrated", "practice", "awaiting_confirmation", {"planning": 10}),
        ("unconfigured", "extraction", "queued", {}),
    ]
    with closing(sqlite3.connect(db)) as conn:
        conn.executescript(schema.read_text(encoding="utf-8"))
        conn.executemany("INSERT INTO jobs(id,kind,status,mode,stages_json,resource_id) VALUES(?,?,?,?,?,'r')",
                         [(str(i), k, s, m, json.dumps(t)) for i, (m, k, s, t) in enumerate(jobs)])
        conn.commit()
    original = db.read_bytes()
    modes = summarize(tmp_path)["by_mode"]
    assert db.read_bytes() == original
    assert modes["demo"]["generation"]["success_rate"] == 1.0
    assert modes["demo"]["generation"]["stage_ms"]["generating"] == {"mean_ms": 1.0, "n": 1}
    assert modes["integrated"]["generation"] == {
        "total": 3, "terminal": 2, "succeeded": 1, "failed": 1, "pending": 1, "success_rate": 0.5,
        "stage_ms": {"generating": {"mean_ms": 30.0, "n": 2}, "validating": {"mean_ms": 4.0, "n": 1}},
    }
    assert modes["integrated"]["practice"]["succeeded"] == modes["integrated"]["planning"]["succeeded"] == 1
    assert modes["unconfigured"]["generation"]["success_rate"] is None


def test_missing_database_is_never_created(tmp_path):
    with pytest.raises(FileNotFoundError):
        summarize(tmp_path)
    assert not list(tmp_path.iterdir())


def test_legacy_jobs_have_unknown_provenance(tmp_path):
    with closing(sqlite3.connect(tmp_path / "edugame.sqlite3")) as conn:
        conn.execute("CREATE TABLE jobs(kind TEXT, status TEXT, stages_json TEXT)")
        conn.execute("INSERT INTO jobs VALUES('generation','failed','{}')")
        conn.commit()
    modes = summarize(tmp_path)["by_mode"]
    assert set(modes) == {"unknown"}
    assert modes["unknown"]["generation"]["failed"] == 1
