"""Exercise the same uploaded material, published game and API a student uses."""

import json
from contextlib import ExitStack
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.db import connection
from backend.main import create_app


def job_result(client, response, status):
    assert response.status_code == 202, response.text
    job = client.get("/jobs/" + response.json()["job_id"]).json()
    assert job["status"] == status, job
    return job["result"]


@dataclass
class PlayRound:
    client: TestClient
    lifespan: ExitStack
    session: str
    game_id: str
    scenes: list

    def action(self, action, *, event_id=None, **fields):
        return self.client.post(self.session + "/actions", json={
            "action": action, "event_id": event_id or uuid4().hex, **fields,
        })

    def accept(self, index):
        scene = self.scenes[index]
        assert self.action("enter_scene", scene_id=scene["scene_id"]).status_code == 200
        result = self.action("accept_quest", quest_id=scene["quest"]["quest_id"])
        assert result.status_code == 200, result.text
        return result.json()

    def answer(self, question, *, correct, event_id=None):
        option_id = next(o["id"] for o in question["options"]
                         if (o["id"] == question["correct_option_id"]) == correct)
        return self.action("attempt", challenge_id=question["challenge_id"], option_id=option_id,
                           event_id=event_id)


@pytest.fixture
def play(tmp_path, monkeypatch):
    monkeypatch.setenv("EDUGAME_MODE", "offline")
    monkeypatch.delenv("EDUGAME_SERVICE_FACTORY", raising=False)
    app = create_app(data_dir=tmp_path)
    material = Path(__file__).resolve().parents[1] / "public/examples/cell-notes.txt"
    with ExitStack() as lifespan:
        client = lifespan.enter_context(TestClient(app))
        upload = client.post("/materials", files={"file": (material.name, material.read_bytes(), "text/plain")})
        extracted = job_result(client, upload, "completed")
        planned = job_result(client, client.post("/rpg/plans", json={
            "material_id": extracted["material_id"],
            "preferences": {"challenge_count": 3, "scene_count": 2},
        }), "awaiting_confirmation")
        generated = job_result(client, client.post("/rpg/games", json={
            "plan_id": planned["plan_id"], "confirmed": True,
        }), "completed")
        game_id = generated["game_id"]
        # Only the test referee reads the server's key. All student moves go over HTTP.
        with connection(app) as conn:
            game = json.loads(conn.execute("SELECT internal_json FROM games WHERE id=?",
                                           (game_id,)).fetchone()[0])
        scenes = []
        key = game["start_scene_id"]
        while key is not None:
            scene = next(s for s in game["scenes"] if s["scene_id"] == key)
            questions = {q["challenge_id"]: q for q in scene["challenges"]}
            scene["challenges"] = [questions[c] for c in scene["quest"]["challenge_ids"]]
            scenes.append(scene)
            key = scene["next_scene_id"]
        response = client.post(f"/rpg/games/{game_id}/sessions")
        assert response.status_code == 201, response.text
        yield PlayRound(client, lifespan, "/rpg/sessions/" + response.json()["session_id"], game_id, scenes)
