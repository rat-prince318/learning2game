"""Portal acceptance across B's real parser, A's offline agent and D's public API."""

from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
import hashlib
import json
import sqlite3
from threading import Event

import pymupdf
from fastapi.testclient import TestClient

from backend.cleanup import delete_material
from backend.db import connection
from backend.main import create_app


def _offline_app(monkeypatch, data_dir):
    for name in ("EDUGAME_MODE", "EDUGAME_DEMO", "EDUGAME_SERVICE_FACTORY"):
        monkeypatch.delenv(name, raising=False)
    return create_app(data_dir=data_dir)


def _course_pdf():
    with pymupdf.open() as doc:
        doc.new_page().insert_text((20, 30), "Circle: The set of points at one fixed distance from a centre.")
        page = doc.new_page()
        page.insert_text((20, 30), "Vertex: A point where two edges meet.")
        page.insert_text((20, 80), "Face: An enclosed flat surface of a solid.")
        page.insert_text((20, 130), "Edge: A segment joining two neighbouring vertices.")
        return doc.tobytes()


def _result(client, handle, expected):
    assert handle.status_code == 202, handle.text
    ticket = handle.json()
    job = client.get("/jobs/" + ticket["job_id"]).json()
    assert job["status"] == expected, job
    return ticket, job


def test_studio_selected_pages_game_and_owner_cleanup(tmp_path, monkeypatch):
    app = _offline_app(monkeypatch, tmp_path)
    with TestClient(app) as client:
        health = client.get("/health").json()
        assert health["mode"] == "offline" and health["external_models"] is False
        assert client.get("/").status_code == 200
        receipt, extraction = _result(client, client.post(
            "/materials", files={"file": ("geometry.pdf", _course_pdf(), "application/pdf")},
            data={"pages": "2", "include_images": "false"}), "completed")
        material_id = receipt["material_id"]
        token = receipt["delete_token"]
        endpoint = "/materials/" + material_id
        items = client.get(endpoint + "/knowledge").json()["knowledge"]
        assert {p["term"] for p in items} == {"Vertex", "Face", "Edge"}
        assert all(p["page"] == 2 and "geometry.pdf" in p["source_ref"] for p in items)
        assert "extract_glossary_pairs" in {t["name"] for t in extraction["tool_calls"]}
        with connection(app) as conn:
            row = conn.execute("SELECT options_json,delete_token_hash FROM materials WHERE id=?",
                               (material_id,)).fetchone()
        assert json.loads(row["options_json"]) == {"pages": [2], "include_images": False}
        assert row["delete_token_hash"] == hashlib.sha256(token.encode()).hexdigest()
        assert token not in json.dumps(extraction)
        assert client.delete(endpoint).status_code == 403
        assert client.delete(endpoint, headers={"X-Material-Token": "another-browser"}).status_code == 403

        plan_ticket, planning = _result(client, client.post("/matching-plans", json={
            "material_id": material_id, "preferences": {"pair_count": 3}
        }), "awaiting_confirmation")
        plan = planning["result"]["plan"]
        assert planning["result"]["plan_id"] and "design_matching_plan" in {
            item["name"] for item in planning["tool_calls"]}
        plan["knowledge_ids"] = plan["knowledge_ids"][:2]
        confirmed = {"plan_id": planning["result"]["plan_id"], "plan": plan, "confirmed": True}
        # Pause the actual A service at its entry while another request attempts deletion.
        entered, resume = Event(), Event()
        generate = app.state.services.generate
        def gate(*args):
            entered.set()
            assert resume.wait(timeout=10)
            return generate(*args)
        monkeypatch.setattr(app.state.services, "generate", gate)
        with ThreadPoolExecutor(max_workers=1) as workers:
            running = workers.submit(client.post, "/games", json=confirmed)
            try:
                assert entered.wait(timeout=5)
                assert client.delete(endpoint, headers={"X-Material-Token": token}).status_code == 409
            finally:
                resume.set()
            game_ticket, generation = _result(client, running.result(timeout=10), "completed")
        game_id = generation["result"]["game_id"]
        game = client.get("/games/" + game_id).json()
        assert len(game["left_cards"]) == len(game["right_cards"]) == 2
        assert all(set(c) == {"id", "text"} for c in game["left_cards"] + game["right_cards"])
        assert "validate_matching_config" in {t["name"] for t in generation["tool_calls"]}
        session = client.post(f"/games/{game_id}/sessions").json()["session_id"]
        attempt = client.post(f"/sessions/{session}/attempts", json={
            "event_id": "student-click", "left_id": game["left_cards"][0]["id"],
            "right_id": game["right_cards"][0]["id"]})
        assert attempt.status_code == 200
        assert client.post(f"/sessions/{session}/finish").json()["valid_attempts"] == 1

    # Restart keeps the upload settings and the capability supplied by the first response.
    app = _offline_app(monkeypatch, tmp_path)
    with TestClient(app) as client:
        assert client.get(f"/sessions/{session}/report").status_code == 200
        assert client.delete(endpoint, headers={"X-Material-Token": token}).status_code == 204
        assert not (tmp_path / "uploads" / f"{material_id}.pdf").exists()
        for url in (endpoint + "/knowledge", f"/games/{game_id}", f"/sessions/{session}/report",
                    *(f'/jobs/{ticket["job_id"]}' for ticket in (receipt, plan_ticket, game_ticket))):
            assert client.get(url).status_code == 404, url
        with connection(app) as conn:
            for table in ("materials", "plans", "games", "sessions", "reports", "jobs", "events",
                          "pending_file_deletions"):
                assert conn.execute(f"SELECT count(*) FROM {table}").fetchone()[0] == 0, table


def test_legacy_material_migration_retains_knowledge_and_restricts_deletion(tmp_path, monkeypatch):
    directory = tmp_path / "uploads"
    directory.mkdir()
    course = directory / "existing.txt"
    course.write_text("Vertex: A point where two edges meet.", encoding="utf-8")
    historical = {"knowledge": [{"knowledge_id": "k1", "term": "Vertex", "definition":
        "A point where two edges meet.", "source_ref": "Page 1"}]}
    # Pre-portal D installations had neither upload options nor a per-browser deletion capability.
    with closing(sqlite3.connect(tmp_path / "edugame.sqlite3")) as db:
        db.execute("""CREATE TABLE materials (
            id TEXT PRIMARY KEY, original_name TEXT NOT NULL, path TEXT NOT NULL UNIQUE,
            media_type TEXT NOT NULL, result_json TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)""")
        db.execute("INSERT INTO materials(id,original_name,path,media_type,result_json) VALUES(?,?,?,?,?)",
                   ("existing", "notes.txt", str(course), "text/plain", json.dumps(historical)))
        db.commit()
    app = _offline_app(monkeypatch, tmp_path)
    with TestClient(app) as client:
        original = client.get("/materials/existing/knowledge").json()["knowledge"][0]
        assert original["term"] == "Vertex" and original["source_ref"] == "Page 1"
        assert client.delete("/materials/existing", headers={"X-Material-Token": "invalid"}).status_code == 403
        with connection(app) as conn:
            row = conn.execute("SELECT options_json,delete_token_hash FROM materials WHERE id='existing'").fetchone()
        assert json.loads(row["options_json"]) == {} and row["delete_token_hash"] is None and course.exists()
    assert delete_material(tmp_path, "existing") and not course.exists()
