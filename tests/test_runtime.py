from pathlib import Path
from threading import Event

import pytest
from fastapi.testclient import TestClient

from backend.cleanup import delete_material
from backend.db import connection
from backend.main import create_app
from backend.services import DEMO_MATERIAL_TEXT


def test_example_supports_one_key_live_and_explicit_offline(tmp_path, monkeypatch):
    from dotenv import dotenv_values

    for name in ("EDUGAME_MODE", "EDUGAME_DEMO", "EDUGAME_SERVICE_FACTORY", "DASHSCOPE_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    example = Path(__file__).resolve().parents[1] / ".env.example"
    for name, value in dotenv_values(example).items():
        if value is not None:
            monkeypatch.setenv(name, value)
    assert create_app(data_dir=tmp_path).state.mode == "offline"
    monkeypatch.setenv("DASHSCOPE_API_KEY", "test-placeholder")
    assert create_app(data_dir=tmp_path).state.mode == "live"
    monkeypatch.setenv("EDUGAME_MODE", "offline")
    assert create_app(data_dir=tmp_path).state.mode == "offline"


def test_launcher_reuses_its_own_checkout_and_skips_another(monkeypatch):
    import run

    occupied = {8000, 8001}
    class Probe:
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def bind(self, address):
            if address[1] in occupied:
                raise OSError("occupied")
    monkeypatch.setattr(run.socket, "socket", Probe)
    monkeypatch.setattr(run, "ready", lambda url, launch_id: ":8001/" in url and launch_id == "this-checkout")
    assert run.choose_port(None, "this-checkout") == (8001, True)
    assert run.choose_port(None, "other-checkout") == (8002, False)
    with pytest.raises(OSError):
        run.choose_port(8000, "this-checkout")
    occupied.remove(8000)
    assert run.choose_port(None, "this-checkout") == (8001, True)


def test_windows_file_lock_keeps_cleanup_pending_across_restart(tmp_path, monkeypatch):
    app = create_app(data_dir=tmp_path, demo=True)
    with TestClient(app) as client:
        upload = client.post("/materials", files={"file": ("course.txt", DEMO_MATERIAL_TEXT.encode())}).json()
        material = upload["material_id"]
        path = tmp_path / "uploads" / (material + ".txt")
        real_unlink = Path.unlink

        def busy_file(other, *args, **kwargs):
            if other == path:
                raise PermissionError("File still open")
            return real_unlink(other, *args, **kwargs)

        with monkeypatch.context() as patch:
            patch.setattr(Path, "unlink", busy_file)
            response = client.delete("/materials/" + material, headers={"X-Material-Token": upload["delete_token"]})
        assert response.status_code == 202 and response.json()["file_pending"]
        assert path.exists()
        assert client.get("/materials/" + material + "/knowledge").status_code == 404
    with TestClient(create_app(data_dir=tmp_path, demo=True)):
        assert not path.exists()


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
