"""Compatibility across the two game types and the real shared job/store boundaries."""

from concurrent.futures import ThreadPoolExecutor
from threading import Event

import pytest
from fastapi.testclient import TestClient

from backend.db import connection
from backend.main import create_app
from backend.metrics import summarize
from backend.provider import trace_tool
from backend.services import DEMO_MATERIAL_TEXT
from rpg_play_scenario import play


GLOSSARY = """Vertex: A point where two edges meet.
Edge: A segment joining adjacent vertices.
Face: A flat surface bounded by edges.
Radius: The distance from the center of a circle to its boundary."""
RPG = "rpg_quest"


def observe(client, response, status, game_type):
    assert response.status_code == 202, response.text
    receipt = response.json()
    job = client.get("/jobs/" + receipt["job_id"]).json()
    assert job["status"] == status and job["game_type"] == game_type, job
    return job


def upload(client, text=GLOSSARY):
    response = client.post("/materials", files={"file": ("review.txt", text, "text/plain")})
    observe(client, response, "completed", None)
    return response.json()


@pytest.fixture
def studio(tmp_path, monkeypatch):
    monkeypatch.setenv("EDUGAME_MODE", "offline")
    monkeypatch.delenv("EDUGAME_SERVICE_FACTORY", raising=False)
    with TestClient(create_app(data_dir=tmp_path)) as client:
        yield client, upload(client)


def plan(client, material_id, game_type, **preferences):
    route = "/rpg/plans" if game_type == RPG else "/matching-plans"
    result = observe(client, client.post(route, json={
        "material_id": material_id, "preferences": preferences,
    }), "awaiting_confirmation", game_type)["result"]
    assert result["material_id"] == material_id
    return result


def publish(client, plan_id, game_type):
    route = "/rpg/games" if game_type == RPG else "/games"
    body = {"plan_id": plan_id, "confirmed": True}
    result = observe(client, client.post(route, json=body), "completed", game_type)["result"]
    assert result["plan_id"] == plan_id
    return result["game_id"]


def test_two_recommendations_shared_source_cross_type_and_cleanup(studio, tmp_path):
    client, receipt = studio
    mid = receipt["material_id"]
    assert client.get("/health").json()["supported_game_types"] == ["matching", RPG]
    for goal, expected in [("recognize", "matching"), ("distinguish", RPG)]:
        recommendation = observe(client, client.post("/game-recommendations", json={
            "material_id": mid, "preferences": {"goal": goal},
        }), "completed", None)["result"]["recommendation"]
        assert recommendation["recommended_type"] == expected
        assert recommendation["mode"] == "offline" and recommendation["rationale"]
        assert set(recommendation["supported_types"]) == {"matching", RPG}
    with connection(client.app) as conn:
        assert conn.execute("SELECT count(*) FROM plans").fetchone()[0] == 0
        assert conn.execute("SELECT count(*) FROM games").fetchone()[0] == 0

    matching = plan(client, mid, "matching", pair_count=3)
    mg = publish(client, matching["plan_id"], "matching")
    ms = client.post(f"/games/{mg}/sessions").json()["session_id"]
    card = client.get("/games/" + mg).json()["left_cards"][0]["id"]
    assert client.post(f"/sessions/{ms}/hints", json={"event_id": "h", "left_id": card}).status_code == 200
    m_report = client.post(f"/sessions/{ms}/finish").json()
    observe(client, client.post(f"/sessions/{ms}/feedback"), "completed", "matching")

    draft = plan(client, mid, RPG, challenge_count=4)
    scope = draft["plan"]["knowledge_ids"][:3]
    altered = {**draft["plan"], "knowledge_ids": scope}
    assert client.post("/rpg/games", json={"plan_id": draft["plan_id"], "confirmed": True,
                                           "plan": altered}).status_code == 422
    assert client.post("/rpg/games", json={"plan_id": draft["plan_id"]}).status_code == 422
    final_plan = plan(client, mid, RPG, challenge_count=3, selected_knowledge_ids=scope, theme="campus")
    assert final_plan["plan_id"] != draft["plan_id"]
    assert final_plan["plan"]["theme"] == "campus" and final_plan["plan"]["knowledge_ids"] == scope
    rg = publish(client, final_plan["plan_id"], RPG)
    with connection(client.app) as conn:
        old = conn.execute("SELECT game_id,game_job_id,confirmed_at FROM plans WHERE id=?",
                           (draft["plan_id"],)).fetchone()
        assert tuple(old) == (None, None, None)

    rs = client.post(f"/rpg/games/{rg}/sessions").json()["session_id"]
    scene = client.get("/rpg/games/" + rg).json()["scenes"][0]
    assert client.post(f"/rpg/sessions/{rs}/actions", json={
        "event_id": "quest", "action": "accept_quest", "quest_id": scene["quest"]["quest_id"],
    }).status_code == 200
    r_report = client.post(f"/rpg/sessions/{rs}/finish").json()
    observe(client, client.post(f"/rpg/sessions/{rs}/feedback"), "completed", RPG)
    observe(client, client.post(f"/rpg/sessions/{rs}/practice"), "awaiting_confirmation", RPG)

    for prefix, wrong_game, wrong_session, wrong_plan in [
        ("", rg, rs, final_plan["plan_id"]), ("/rpg", mg, ms, matching["plan_id"]),
    ]:
        url = prefix + "/sessions/" + wrong_session
        assert client.get(prefix + "/games/" + wrong_game).status_code == 409
        assert client.post(prefix + "/games/" + wrong_game + "/sessions").status_code == 409
        assert client.post(prefix + "/games", json={"plan_id": wrong_plan, "confirmed": True}).status_code == 409
        assert client.get(url).status_code == client.get(url + "/report").status_code == 409
        for operation in ("finish", "practice", "feedback"):
            assert client.post(f"{url}/{operation}").status_code == 409
    assert client.post(f"/sessions/{rs}/attempts", json={
        "event_id": "cross", "left_id": "l", "right_id": "r",
    }).status_code == 409
    assert client.post(f"/rpg/sessions/{ms}/actions", json={
        "event_id": "cross", "action": "hint", "challenge_id": "q",
    }).status_code == 409

    next_match = observe(client, client.post(f"/sessions/{ms}/practice"), "awaiting_confirmation", "matching")
    assert publish(client, next_match["result"]["plan_id"], "matching") != mg
    assert client.get(f"/sessions/{ms}/report").json() == m_report
    assert client.get(f"/rpg/sessions/{rs}/report").json() == r_report
    file = tmp_path / "uploads" / (mid + ".txt")
    assert file.is_file()
    assert client.delete("/materials/" + mid).status_code == 403
    with connection(client.app) as conn:
        jobs = [row[0] for row in conn.execute("SELECT id FROM jobs")]
    assert client.delete("/materials/" + mid, headers={"X-Material-Token": receipt["delete_token"]}).status_code == 204
    assert not file.exists()
    assert all(client.get("/jobs/" + j).status_code == 404 for j in jobs)
    with connection(client.app) as conn:
        for table in ("materials", "plans", "games", "sessions", "jobs", "events", "rpg_events",
                      "reports", "pending_file_deletions"):
            assert conn.execute(f"SELECT count(*) FROM {table}").fetchone()[0] == 0, table
        assert not list(conn.execute("PRAGMA foreign_key_check"))


def test_atomic_confirm_retry_and_terminal_metrics(studio, tmp_path, monkeypatch):
    client, receipt = studio
    material_id = receipt["material_id"]
    earlier = plan(client, material_id, "matching", pair_count=3)
    publish(client, earlier["plan_id"], "matching")
    plan_id = plan(client, material_id, RPG, challenge_count=3)["plan_id"]
    endpoint, body = "/rpg/games", {"plan_id": plan_id, "confirmed": True}
    services = client.app.state.services
    generate = services.generate_rpg

    def rejected(*args):
        raise RuntimeError("private upstream content")

    monkeypatch.setattr(services, "generate_rpg", rejected)
    failed = observe(client, client.post(endpoint, json=body), "failed", RPG)
    assert "private upstream" not in str(failed)
    start, release = Event(), Event()

    def held(*args):
        start.set()
        assert release.wait(10)
        return generate(*args)

    monkeypatch.setattr(services, "generate_rpg", held)
    with ThreadPoolExecutor(1) as pool:
        retry = pool.submit(client.post, endpoint, json=body)
        try:
            assert start.wait(5)
            pending = observe(client, client.post(endpoint, json=body), "generating", RPG)
            assert pending["job_id"] != failed["job_id"]
            split = summarize(tmp_path)["generation_by_mode_and_game_type"]["offline"]
            assert split[RPG] == {"succeeded": 0, "failed": 1, "pending": 1, "terminal": 1, "success_rate": 0}
            assert split["matching"]["success_rate"] == 1 and split["matching"]["terminal"] == 1
            assert client.delete("/materials/" + material_id,
                                 headers={"X-Material-Token": receipt["delete_token"]}).status_code == 409
        finally:
            release.set()
        done = observe(client, retry.result(timeout=10), "completed", RPG)
    assert done["job_id"] == pending["job_id"]
    assert observe(client, client.post(endpoint, json=body), "completed", RPG)["job_id"] == done["job_id"]
    split = summarize(tmp_path)["generation_by_mode_and_game_type"]["offline"]
    assert split[RPG] == {"succeeded": 1, "failed": 1, "pending": 0, "terminal": 2, "success_rate": .5}
    with connection(client.app) as conn:
        assert conn.execute("SELECT count(*) FROM games WHERE plan_id=?", (plan_id,)).fetchone()[0] == 1


def test_feedback_can_retry_without_changing_saved_report(play, monkeypatch):
    client = play.client
    saved = client.post(play.session + "/finish").json()
    feedback = client.app.state.services.feedback_rpg

    def fail(*args):
        with trace_tool("write_rpg_feedback"):
            raise TimeoutError("private course text")

    monkeypatch.setattr(client.app.state.services, "feedback_rpg", fail)
    failed = observe(client, client.post(play.session + "/feedback"), "failed", RPG)
    assert failed["tool_calls"][0]["status"] == "failed"
    assert failed["result"] is None and "private course" not in str(failed)
    assert client.get(play.session + "/report").json() == saved
    monkeypatch.setattr(client.app.state.services, "feedback_rpg", feedback)
    done = observe(client, client.post(play.session + "/feedback"), "completed", RPG)
    assert done["job_id"] != failed["job_id"] and done["result"]["feedback"]
    assert observe(client, client.post(play.session + "/feedback"), "completed", RPG)["job_id"] == done["job_id"]
    assert client.get(play.session + "/report").json() == saved
    with connection(client.app) as conn:
        row = conn.execute("SELECT feedback FROM reports WHERE session_id=?", (saved["session_id"],)).fetchone()
        assert row["feedback"] == done["result"]["feedback"]


def test_legacy_external_factory_and_unconfigured_capabilities(tmp_path, monkeypatch):
    monkeypatch.setenv("EDUGAME_DEMO", "0")
    monkeypatch.setenv("EDUGAME_SERVICE_FACTORY", "backend.services:DemoServices")
    monkeypatch.delenv("EDUGAME_MODE", raising=False)
    with TestClient(create_app(data_dir=tmp_path / "legacy")) as client:
        assert client.get("/health").json()["supported_game_types"] == ["matching"]
        mid = upload(client, DEMO_MATERIAL_TEXT)["material_id"]
        result = observe(client, client.post("/game-recommendations", json={"material_id": mid}), "completed", None)
        assert result["result"]["recommendation"]["supported_types"] == ["matching"]
        assert client.post("/rpg/plans", json={"material_id": mid}).status_code == 503
    monkeypatch.delenv("EDUGAME_SERVICE_FACTORY")
    monkeypatch.setenv("EDUGAME_MODE", "unconfigured")
    with TestClient(create_app(data_dir=tmp_path / "empty")) as client:
        assert client.get("/health").json()["supported_game_types"] == []
        for endpoint in ("/game-recommendations", "/rpg/plans"):
            assert client.post(endpoint, json={"material_id": "missing"}).status_code == 503
