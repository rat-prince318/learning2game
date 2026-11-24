import io
import json

import pymupdf
from fastapi.testclient import TestClient
from PIL import Image

from backend.main import create_app
from backend.material_adapter import MaterialProvider, Point, _dedupe, extract_material
from backend.rpg.validation import eligible


def test_lecture_cover_cannot_become_evidence_or_an_answer(tmp_path, monkeypatch):
    path = tmp_path / "agents.txt"
    path.write_text("AIE1903: Multimodal Agentic Assistant-Tool Use and Autonomous Systems\n"
                    "Lecture 1: Introduction to the course\nGoal: Overview of upcoming lectures\n"
                    "A calculator evaluates a supplied expression.\nOpening remarks: Welcome to the seminar.", encoding="utf8")
    monkeypatch.setenv("LLM_API_KEY", "test")
    def extract(self, content, *, vision):
        assert "AIE1903" not in content and "upcoming lectures" not in content
        return [{"term": "Function matching", "definition": "Use the calculator for an expression.",
                 "evidence": "A calculator evaluates a supplied expression.", "source_id": "line:4"}]

    monkeypatch.setattr(MaterialProvider, "complete", extract)
    item, = extract_material(path, live=True).knowledge
    assert item.term == "Function matching" and item.source_ids == ["line:4"]
    # Previously extracted material is also rechecked when planning a new expedition.
    assert not eligible([item.model_copy(update={"term": "Lecture 1"})])


def test_paraphrase_of_literal_definition_survives_but_conflict_does_not():
    quote = "Resistance: Voltage divided by current."
    def point(definition, source, evidence):
        return Point("Resistance", definition, evidence, [source], source, 1, "text")
    literal = point("Voltage divided by current.", "line:1", quote)
    paraphrase = point("The ratio of potential difference to current.", "line:1", quote)
    assert _dedupe([literal, paraphrase])[0] == [literal]
    assert not _dedupe([literal, point("Distance divided by time.", "line:2", "Distance divided by time.")])[0]


def test_unnumbered_scanned_exam_keeps_formula_source(tmp_path, monkeypatch):
    target = tmp_path / "mechanics-exam.png"
    Image.new("RGB", (200, 100), "white").save(target)
    monkeypatch.setenv("DASHSCOPE_API_KEY", "test")
    def read(self, content, *, vision):
        assert vision and content[1]["image_url"]["url"].startswith("data:image/jpeg")
        return [{"text": "Time Allowed: Two hours\nA cart has mass 7 kg and travels at 6 m/s. What is its kinetic energy?"}]

    monkeypatch.setattr(MaterialProvider, "complete", read)
    item, = extract_material(target, live=True).knowledge
    assert item.exam_question.zh.options[0] == r"\(126\,\mathrm{J}\)"
    assert item.source_ids == ["image:1:ocr"] and "Time Allowed" not in item.evidence


def test_textbook_selected_page_keeps_original_page_number(tmp_path):
    with pymupdf.open() as doc:
        for _ in range(106):
            doc.new_page()
        doc[-1].insert_text((40, 50), "Inertia: Resistance to a change in velocity.")
        data = doc.tobytes()
    with TestClient(create_app(data_dir=tmp_path)) as client:
        def upload(pages):
            return client.post("/materials", data={"pages": pages},
                               files={"file": ("mechanics.pdf", io.BytesIO(data), "application/pdf")})
        assert upload("").status_code == 422
        res = upload("106")
        assert res.status_code == 202
        item, = client.get("/materials/" + res.json()["material_id"] + "/knowledge").json()["knowledge"]
        assert item["page"] == 106 and item["term"] == "Inertia"

def test_model_retries_truncated_json_without_discarding_other_source_pages(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "fixture")
    calls = []

    def respond(request, *, timeout):
        payload = json.loads(request.data)
        calls.append(payload["max_tokens"])
        choice = ({"finish_reason": "length", "message": {"content": "{"}} if len(calls) == 1 else
                  {"finish_reason": "stop", "message": {"content": '{"points":[{"term":"torque"}]}'}})
        return io.BytesIO(json.dumps({"choices": [choice]}).encode())

    monkeypatch.setattr("urllib.request.urlopen", respond)
    monkeypatch.setattr("backend.material_adapter.time.sleep", lambda _: None)
    assert MaterialProvider().complete("example", vision=False) == [{"term": "torque"}]
    assert calls == [4096, 8192]
