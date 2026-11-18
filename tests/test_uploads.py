from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from pypdf import PdfWriter

from backend.db import connection
from backend.main import create_app
from backend.models import KnowledgeItem, MaterialResult
from backend.provider import trace_tool


class Extractor:
    def extract(self, path):
        # Exercises the adapter boundary without implementing B's model.
        with trace_tool("test_read_material"):
            assert path.is_file()
        return MaterialResult(knowledge=[KnowledgeItem(
            knowledge_id="test", term="sample", definition="A format-validation test.", source_ref="p.1"
        )])


def file_bytes(ext):
    stream = BytesIO()
    if ext == "pdf":
        pdf = PdfWriter()
        pdf.add_blank_page(width=50, height=50)
        pdf.write(stream)
    elif ext == "txt":
        return b"A course note."
    else:
        Image.new("RGB", (3, 2)).save(stream, "JPEG" if ext == "jpg" else "PNG")
    return stream.getvalue()


@pytest.mark.parametrize("ext", ["pdf", "txt", "png", "jpg"])
def test_supported_files_are_checked_stored_and_given_to_adapter(tmp_path, ext):
    app = create_app(data_dir=tmp_path, services=Extractor(), demo=False)
    with TestClient(app) as client:
        raw = file_bytes(ext)
        upload = client.post("/materials", files={"file": (f"../../user.{ext}", raw)})
        assert upload.status_code == 202, upload.text
        data = upload.json()
        job = client.get("/jobs/" + data["job_id"]).json()
        assert job["status"] == "completed" and job["mode"] == "integrated"
        assert [(t["name"], t["status"]) for t in job["tool_calls"]] == [("test_read_material", "ok")]
        with connection(app) as conn:
            row = conn.execute("SELECT original_name,path FROM materials WHERE id=?",
                               (data["material_id"],)).fetchone()
        assert row["original_name"] == f"user.{ext}"
        path = Path(row["path"])
        assert path == tmp_path / "uploads" / (data["material_id"] + "." + ext)
        assert path.read_bytes() == raw


def test_invalid_bytes_size_and_multipart_do_not_create_files(tmp_path):
    app = create_app(data_dir=tmp_path, services=Extractor(), demo=False, max_upload_bytes=32)
    with TestClient(app) as client:
        for filename, content, status in [
            ("fake.jpg", b"not an image", 422), ("broken.pdf", b"%PDF-not really", 422),
            ("bin.txt", b"\x00bad", 422), ("x.txt", b"", 422), ("a.exe", b"test", 415),
            ("size.txt", b"x" * 33, 413),
        ]:
            assert client.post("/materials", files={"file": (filename, content)}).status_code == status
        assert client.post("/materials", files={"wrong": ("x.txt", b"ok")}).status_code == 422
        assert client.post("/materials", files=[("file", ("a.txt", b"a")), ("file", ("b.txt", b"b"))]).status_code == 400
        assert client.post("/materials", json={"file": "x"}).status_code == 415
        # The stream limit applies even without a Content-Length.
        boundary = "edugame"
        def big_body():
            yield b'--edugame\r\nContent-Disposition: form-data; name="file"; filename="a.txt"\r\n\r\n'
            yield b"z" * 70000
            yield b"\r\n--edugame--\r\n"
        response = client.post("/materials", content=big_body(), headers={
            "content-type": f"multipart/form-data; boundary={boundary}"})
        assert response.status_code == 413
        assert not list((tmp_path / "uploads").iterdir())


def test_unconfigured_mode_and_browser_cors(tmp_path, monkeypatch):
    monkeypatch.setenv("EDUGAME_MODE", "unconfigured")
    with TestClient(create_app(data_dir=tmp_path, demo=False)) as client:
        assert client.get("/health").json()["mode"] == "unconfigured"
        assert client.get("/demo/game").status_code == 404
        response = client.post("/materials", files={"file": ("x.txt", b"notes")})
        assert response.status_code == 503
        assert "error" in response.json()
        allowed = client.options("/materials", headers={"Origin": "http://localhost:5173",
                                 "Access-Control-Request-Method": "POST"})
        assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
