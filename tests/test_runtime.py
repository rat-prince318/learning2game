from threading import Event

import pytest
from fastapi.testclient import TestClient

from backend.cleanup import delete_material
from backend.db import connection
from backend.main import create_app
from backend.services import DEMO_MATERIAL_TEXT


def test_restart_recovers_interrupted_work_and_cleanup_is_scoped(tmp_path):
    app = create_app(data_dir=tmp_path, demo=True)
    with TestClient(app) as client:
        with pytest.raises(RuntimeError, match="in use"):
            with TestClient(create_app(data_dir=tmp_path, demo=True)):
                pass
        upload = client.post("/materials", files={"file": ("course.txt", DEMO_MATERIAL_TEXT.encode())}).json()
        job = client.post("/matching-plans", json={"material_id": upload["material_id"]}).json()
        plan = client.get("/jobs/" + job["job_id"]).json()["result"]
        gjob = client.post("/games", json={"plan_id": plan["plan_id"], "confirmed": True}).json()
        game_id = client.get("/jobs/" + gjob["job_id"]).json()["result"]["game_id"]
        session = client.post(f"/games/{game_id}/sessions").json()["session_id"]
        client.post(f"/sessions/{session}/finish").raise_for_status()
        practice = client.post(f"/sessions/{session}/practice").json()
        feedback = client.post(f"/sessions/{session}/feedback").json()
        with connection(app, write=True) as conn:
            conn.execute("INSERT INTO jobs(id,kind,status,resource_id) VALUES ('interrupted','extraction','extracting',?)",
                         (upload["material_id"],))
    with TestClient(create_app(data_dir=tmp_path, demo=True)) as client:
        assert client.get("/jobs/interrupted").json()["status"] == "failed"
        assert client.get("/jobs/" + practice["job_id"]).json()["status"] == "awaiting_confirmation"
        assert client.get(f"/sessions/{session}/report").status_code == 200
    assert delete_material(tmp_path, upload["material_id"])
    assert not delete_material(tmp_path, upload["material_id"])
    assert not (tmp_path / "uploads" / (upload["material_id"] + ".txt")).exists()
    with TestClient(create_app(data_dir=tmp_path, demo=True)) as client:
        assert client.get("/demo/game").status_code == 200
        assert client.get(f"/sessions/{session}/report").status_code == 404
        for j in (upload, job, gjob, practice, feedback):
            assert client.get("/jobs/" + j["job_id"]).status_code == 404


def test_timed_out_result_cannot_replace_failed_job(tmp_path):
    release = Event()
    exited = Event()

    class SlowService:
        def extract(self, path):
            try:
                release.wait(timeout=3)
                return {"knowledge": []}
            finally:
                exited.set()

    app = create_app(data_dir=tmp_path, services=SlowService(), demo=False)
    app.state.service_timeout = 0.01
    with TestClient(app) as client:
        try:
            upload = client.post("/materials", files={"file": ("x.txt", b"course")}).json()
            url = "/jobs/" + upload["job_id"]
            assert "timed out" in client.get(url).json()["error"]
        finally:
            release.set()
        assert exited.wait(timeout=2)
        assert client.get(url).json()["status"] == "failed"
        assert client.get("/materials/" + upload["material_id"] + "/knowledge").status_code == 409
