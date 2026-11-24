import json
from concurrent.futures import ThreadPoolExecutor
from threading import Event

from fastapi.testclient import TestClient

from backend.db import connection
from backend.main import create_app
from backend.provider import trace_tool
from backend.services import DEMO_MATERIAL_TEXT, DemoServices


def job(client, response):
    assert response.status_code == 202, response.text
    polled = client.get("/jobs/" + response.json()["job_id"])
    assert polled.status_code == 200, polled.text
    return polled.json()


def upload(client):
    response = client.post("/materials", files={"file": ("sample.txt", DEMO_MATERIAL_TEXT, "text/plain")})
    extraction = job(client, response)
    assert extraction["status"] == "completed", extraction
    assert extraction["result"]["knowledge_count"] == 6
    assert {"extracting", "validating"} == extraction["stages_ms"].keys()
    return response.json()["material_id"]


def plan_for(client, material_id, count=6):
    response = client.post("/matching-plans", json={
        "material_id": material_id, "preferences": {"pair_count": count},
    })
    planned = job(client, response)
    assert planned["status"] == "awaiting_confirmation", planned
    return planned["result"]


def confirm(plan_id, plan=None):
    body = {"plan_id": plan_id, "confirmed": True}
    if plan is not None:
        body["plan"] = plan
    return body


def test_user_confirmation_edits_scope_and_duplicate_replay(tmp_path):
    app = create_app(data_dir=tmp_path, services=DemoServices())
    with TestClient(app) as client:
        material_id = upload(client)
        result = plan_for(client, material_id, 12)
        assert len(result["plan"]["knowledge_ids"]) == 6 and result["plan"]["warnings"]
        with connection(app) as conn:
            assert conn.execute("SELECT COUNT(*) FROM games").fetchone()[0] == 0
            saved = conn.execute("SELECT preferences_json FROM plans").fetchone()[0]
            assert json.loads(saved)["pair_count"] == 12
        original = result["plan"]
        plan_id = result["plan_id"]
        assert client.post("/games", json={"plan_id": plan_id, "confirmed": False}).status_code == 422
        edited = {**original, "title": "My review", "difficulty": "easy", "knowledge_ids": original["knowledge_ids"][:2]}
        foreign = {**edited, "knowledge_ids": [edited["knowledge_ids"][0], "outside-this-material"]}
        assert client.post("/games", json=confirm(plan_id, foreign)).status_code == 422

        created = job(client, client.post("/games", json=confirm(plan_id, edited)))
        assert created["status"] == "completed" and created["mode"] == "integrated"
        assert created["result"].keys() == {"game_id", "plan_id"}
        game = client.get("/games/" + created["result"]["game_id"]).json()
        assert game["title"] == "My review" and len(game["left_cards"]) == 2
        assert client.post("/games", json=confirm(plan_id, original)).status_code == 409
        assert job(client, client.post("/games", json=confirm(plan_id))) == created


class BrokenSource(DemoServices):
    def __init__(self):
        self.generations = 0

    def generate(self, knowledge, plan, previous=None):
        self.generations += 1
        game = super().generate(knowledge, plan)
        if self.generations == 1:
            game.pairs[0].source_ref = "See a different document"
        return game


def test_reject_untraceable_game_and_allow_explicit_retry(tmp_path):
    services = BrokenSource()
    app = create_app(data_dir=tmp_path, services=services)
    with TestClient(app) as client:
        plan = plan_for(client, upload(client))
        body = confirm(plan["plan_id"])
        failed = job(client, client.post("/games", json=body))
        assert failed["status"] == "failed" and "source" in failed["error"]
        with connection(app) as conn:
            assert conn.execute("SELECT COUNT(*) FROM games").fetchone()[0] == 0
        retried = job(client, client.post("/games", json=body))
        assert retried["status"] == "completed" and retried["job_id"] != failed["job_id"]
        assert services.generations == 2


class WaitingGenerator(DemoServices):
    def __init__(self):
        self.started = Event()
        self.release = Event()
        self.generated = Event()

    def generate(self, knowledge, plan, previous=None):
        self.started.set()
        assert self.release.wait(8)
        self.generated.set()
        return super().generate(knowledge, plan)


def test_duplicate_confirmation_while_first_call_is_in_flight(tmp_path):
    services = WaitingGenerator()
    app = create_app(data_dir=tmp_path, services=services)
    with TestClient(app) as client:
        plan = plan_for(client, upload(client))
        body = confirm(plan["plan_id"])
        with ThreadPoolExecutor(1) as pool:
            first = pool.submit(client.post, "/games", json=body)
            try:
                assert services.started.wait(3)
                duplicate = client.post("/games", json=body)
                job_id = duplicate.json()["job_id"]
                assert client.get(f"/jobs/{job_id}").json()["status"] == "generating"
                changed = {**plan["plan"], "title": "Another round"}
                assert client.post("/games", json=confirm(plan["plan_id"], changed)).status_code == 409
            finally:
                services.release.set()
            assert first.result().json()["job_id"] == job_id
        assert client.get(f"/jobs/{job_id}").json()["status"] == "completed"
        with connection(app) as conn:
            assert conn.execute("SELECT COUNT(*) FROM games").fetchone()[0] == 1


def test_timed_out_provider_cannot_publish_late_game(tmp_path):
    services = WaitingGenerator()
    app = create_app(data_dir=tmp_path, services=services)
    with TestClient(app) as client:
        plan = plan_for(client, upload(client))
        app.state.service_timeout = .05
        try:
            outcome = job(client, client.post("/games", json=confirm(plan["plan_id"])))
            assert outcome["status"] == "failed" and "timed out" in outcome["error"]
        finally:
            services.release.set()
        assert services.generated.wait(1)
        with connection(app) as conn:
            assert conn.execute("SELECT COUNT(*) FROM games").fetchone()[0] == 0


def test_practice_one_weak_concept_and_feedback_from_source_material(tmp_path):
    app = create_app(data_dir=tmp_path, demo=True)
    with TestClient(app) as client:
        material_id = upload(client)
        knowledge = client.get(f"/materials/{material_id}/knowledge").json()["knowledge"]
        initial = plan_for(client, material_id)
        start = job(client, client.post("/games", json=confirm(initial["plan_id"])))
        game_id = start["result"]["game_id"]
        game = client.get(f"/games/{game_id}").json()
        def sourced_balls(public):
            with connection(app) as conn:
                row = conn.execute("SELECT internal_json,card_map_json FROM games WHERE id=?",
                                   (public["game_id"],)).fetchone()
            pairs = {p["pair_id"]: p["knowledge_id"] for p in json.loads(row["internal_json"])["pairs"]}
            key = json.loads(row["card_map_json"])
            result = {}
            for ball in public["left_cards"]:
                left = ball["id"]
                pair = key["left"][left]
                correct = next(r for r in public["court_options"][left] if key["right"].get(r) == pair)
                result[pairs[pair]] = (left, correct, ball["text"])
            return result
        originals = sourced_balls(game)
        session_id = client.post(f"/games/{game_id}/sessions").json()["session_id"]
        prefix = f"/sessions/{session_id}"
        assert client.post(f"{prefix}/practice").status_code == 409
        for item in knowledge[:-1]:
            left, right, _ = originals[item["knowledge_id"]]
            scored = client.post(f"{prefix}/attempts", json={
                "event_id": item["knowledge_id"], "left_id": left, "right_id": right,
            })
            assert scored.json()["correct"]
        report = client.post(f"{prefix}/finish").json()
        target = knowledge[-1]
        assert report["weak_knowledge_ids"] == [target["knowledge_id"]]

        feedback = job(client, client.post(f"{prefix}/feedback"))
        assert target["source_ref"] in feedback["result"]["feedback"]
        assert job(client, client.post(f"{prefix}/feedback")) == feedback
        practice = job(client, client.post(f"{prefix}/practice"))
        new_plan = practice["result"]["plan"]
        assert target["knowledge_id"] in new_plan["knowledge_ids"] and len(new_plan["knowledge_ids"]) == 2
        assert new_plan["warnings"]
        next_round = job(client, client.post("/games", json=confirm(practice["result"]["plan_id"])))
        assert next_round["status"] == "completed", next_round
        changed = client.get("/games/" + next_round["result"]["game_id"]).json()
        revised = sourced_balls(changed)
        assert target["knowledge_id"] in revised
        assert all(prompt != originals[kid][2] for kid, (_, _, prompt) in revised.items())


def test_bad_demo_upload_and_missing_resource_handling(tmp_path):
    with TestClient(create_app(data_dir=tmp_path, demo=True)) as client:
        response = client.post("/materials", files={"file": ("other.txt", "valid text but not the demo")})
        outcome = job(client, response)
        assert outcome["status"] == "failed" and "sample" in outcome["error"]
        material_id = response.json()["material_id"]
        assert client.get(f"/materials/{material_id}/knowledge").status_code == 409
        failed_again = job(client, client.post(f"/materials/{material_id}/retry"))
        assert failed_again["job_id"] != outcome["job_id"]
        assert client.get("/jobs/missing").status_code == 404
        assert client.get("/materials/missing/knowledge").status_code == 404
        assert client.post("/games", json=confirm("missing")).status_code == 404


def test_reject_plan_with_unrelated_concept(tmp_path):
    class InvalidPlanner(DemoServices):
        def plan(self, knowledge, preferences):
            plan = super().plan(knowledge, preferences)
            plan.knowledge_ids[0] = "foreign-concept"
            return plan

    app = create_app(data_dir=tmp_path, services=InvalidPlanner())
    with TestClient(app) as client:
        material_id = upload(client)
        result = job(client, client.post("/matching-plans", json={"material_id": material_id}))
        assert result["status"] == "failed" and result["result"] is None
        with connection(app) as conn:
            assert conn.execute("SELECT COUNT(*) FROM plans").fetchone()[0] == 0


def test_failed_feedback_preserves_statistics_and_sanitizes_tool_trace(tmp_path):
    class UnavailableFeedback(DemoServices):
        def feedback(self, report, knowledge):
            with trace_tool("summarize_performance"):
                raise RuntimeError("unpublishable text from a provider request")

    app = create_app(data_dir=tmp_path, services=UnavailableFeedback())
    with TestClient(app) as client:
        plan = plan_for(client, upload(client))
        generated = job(client, client.post("/games", json=confirm(plan["plan_id"])))
        session = client.post("/games/" + generated["result"]["game_id"] + "/sessions").json()["session_id"]
        report = client.post(f"/sessions/{session}/finish").json()
        failed = job(client, client.post(f"/sessions/{session}/feedback"))
        assert failed["status"] == "failed" and "unpublishable" not in str(failed)
        assert len(failed["tool_calls"]) == 1
        entry = failed["tool_calls"][0]
        assert entry["name"] == "summarize_performance" and entry["status"] == "failed"
        assert entry["duration_ms"] >= 0
        assert client.get(f"/sessions/{session}/report").json() == report
