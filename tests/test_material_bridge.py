import base64
import io
import json
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

import docx
import pymupdf
import pytest
from PIL import Image, ImageDraw
from pptx import Presentation
from pptx.util import Inches

from backend.material_adapter import MaterialError, extract_material, validate_office_archive
from backend.material_processing import MAX_IMAGE_SIDE


def test_handout_intro_is_not_a_glossary_entry(tmp_path):
    src = tmp_path / "map-notes.md"
    src.write_text("This is an authored educational test material.\n"
                   "this: A JavaScript keyword referring to the current receiver.\n"
                   "Latitude: Distance north or south of the equator.\n", encoding="utf-8")
    assert [k.term for k in extract_material(src).knowledge] == ["this", "Latitude"]


def test_diagram_keeps_labelled_functions_and_rejects_conflicting_functions(tmp_path, monkeypatch):
    image = tmp_path / "stations.png"
    Image.new("RGB", (80, 80), "white").save(image)
    monkeypatch.setenv("LLM_API_KEY", "fixture")
    records = [
        ("Screen", "Catches leaves", "part_function"), ("Screen", "Feeds sand", "diagram_relation"),
        ("Bed", "Traps grit", "part_function"), ("Bed", "Holds fuel", "part_function"),
        ("Pipe", "Connects the stations", "diagram_relation"),
    ]
    monkeypatch.setattr("backend.material_adapter.MaterialProvider.complete",
                        lambda *args, **kwargs: [{"term": term, "definition": meaning, "relation": kind,
                            "evidence": meaning, "confidence": .95} for term, meaning, kind in records])
    result = extract_material(image, live=True)
    assert [(p.term, p.definition) for p in result.knowledge] == [
        ("Screen", "Catches leaves"), ("Pipe", "Connects the stations")]
    assert result.warnings


def test_custom_offline_text_is_source_based_and_keeps_true_line_numbers(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "test-only")
    def no_network(*args, **kwargs):
        pytest.fail("Offline extraction attempted a remote call")
    monkeypatch.setattr("urllib.request.urlopen", no_network)
    src = tmp_path / "a.txt"
    src.write_text("## Geometry\n\nVertex: A point where two edges meet.\n"
                   "Edge: A segment joining two vertices.\nVertex: A point where two edges meet.\n"
                   "Face is an enclosed flat surface.\n植物细胞示意图：cell-diagram.svg。", encoding="utf-8")
    result = extract_material(src, original_name="Geometry.txt")
    assert [i.term for i in result.knowledge] == ["Vertex", "Edge", "Face"]
    item = result.knowledge[0]
    assert item.source_ids == ["line:3", "line:5"]
    assert item.evidence.startswith("Vertex: A point")
    assert item.source_ref == "Geometry.txt / 第 3 行"
    assert {i.knowledge_id for i in result.knowledge} == {i.knowledge_id for i in extract_material(src).knowledge}


def test_conflicting_cards_and_unwanted_copy_are_filtered_without_changing_their_meaning(tmp_path):
    src = tmp_path / "glossary.md"
    src.write_text(
        "术语甲：这里写下第一种解释。\n术语甲：有不同的含义存在。\n"
        "术语乙：定义并非测试返回。\n| Vertex | A point where two edges meet. |\n"
        "术语丙：学习需要认真观察。\n", encoding="utf-8",
    )
    res = extract_material(src)
    assert [item.term for item in res.knowledge] == ["Vertex", "术语丙"]
    assert res.warnings


def test_selected_pdf_pages_are_checked_and_reflected_in_source(tmp_path):
    file = tmp_path / "notes.pdf"
    with pymupdf.open() as doc:
        doc.new_page().insert_text((30, 50), "Vertex: A point where two edges meet.")
        doc.new_page().insert_text((30, 50), "Face: An enclosed flat surface.")
        doc.save(file)
    result = extract_material(file, pages=[2], original_name="Geometry.pdf")
    assert len(result.knowledge) == 1
    assert result.knowledge[0].term == "Face" and result.knowledge[0].page == 2
    assert result.knowledge[0].source_ref.startswith("Geometry.pdf / 第 2 页")
    with pytest.raises(MaterialError, match="页码"):
        extract_material(file, pages=[3])


def test_word_table_and_pptx_selection_keep_provenance(tmp_path):
    word = docx.Document()
    table = word.add_table(rows=2, cols=2)
    for row, values in zip(table.rows, [("Term", "Definition"), ("Edge", "Segment joining two vertices.")]):
        for cell, value in zip(row.cells, values):
            cell.text = value
    path = tmp_path / "notes.docx"
    word.save(path)
    item = extract_material(path).knowledge[0]
    assert item.term == "Edge" and "表 1 第 2 行" in item.source_ref

    deck = Presentation()
    for text in ("Alpha: The first Greek letter.", "Beta: The second Greek letter."):
        slide = deck.slides.add_slide(deck.slide_layouts[6])
        slide.shapes.add_textbox(Inches(1), Inches(1), Inches(5), Inches(1)).text = text
    path = tmp_path / "notes.pptx"
    deck.save(path)
    result = extract_material(path, pages=[2])
    assert [i.term for i in result.knowledge] == ["Beta"] and result.knowledge[0].page == 2

    fake = io.BytesIO()
    with zipfile.ZipFile(fake, "w") as arc:
        arc.writestr("notes.txt", "This file is a plain zip archive.")
    with pytest.raises(MaterialError):
        validate_office_archive(fake, ".docx")
    assert fake.tell() == 0


def test_diagram_transport_carries_actual_pixels_and_only_grounded_candidates(tmp_path, monkeypatch):
    img = tmp_path / "chart.png"
    image = Image.new("RGB", (2000, 600), "white")
    ImageDraw.Draw(image).line((0, 0, 1999, 599), fill="black", width=40)
    image.save(img)
    with pytest.raises(MaterialError, match="视觉"):
        extract_material(img)
    monkeypatch.setenv("LLM_API_KEY", "test-only")
    def model(self, content, *, vision):
        assert vision and content[1]["type"] == "image_url"
        header, data = content[1]["image_url"]["url"].split(",")
        assert header == "data:image/jpeg;base64"
        with Image.open(io.BytesIO(base64.b64decode(data))) as uploaded:
            assert max(uploaded.size) == MAX_IMAGE_SIDE
            assert uploaded.convert("L").getextrema()[0] < 25
        return [
            {"term": "Line", "definition": "Diagonal from the first corner.",
             "evidence": "Black diagonal across the white canvas.", "confidence": .96},
            {"term": "Unknown", "definition": "A speculative label here.",
             "evidence": "Weak geometry.", "confidence": .25},
        ]
    monkeypatch.setattr("backend.material_adapter.MaterialProvider.complete", model)
    item, = extract_material(img, live=True).knowledge
    assert item.term == "Line" and item.source_type == "image" and item.source_ids == ["image:1"]
    with pytest.raises(MaterialError):
        extract_material(img, live=True, include_images=False)


def test_live_text_evidence_must_match_the_claimed_source(tmp_path, monkeypatch):
    file = tmp_path / "geometry.md"
    file.write_text("The place where two edges meet is called a vertex.", encoding="utf-8")
    monkeypatch.setenv("LLM_API_KEY", "test-only")
    def model(self, content, *, vision):
        assert not vision and "line:1" in content
        return [
            {"term": "Vertex", "definition": "A point where two edges meet.", "source_id": "line:1",
             "evidence": "where two edges meet"},
            {"term": "Invented", "definition": "An invented definition.", "source_id": "line:1",
             "evidence": "made up words"},
            {"term": "Wrong location", "definition": "A point on the boundary.", "source_id": "line:17",
             "evidence": "where two edges meet"},
        ]
    monkeypatch.setattr("backend.material_adapter.MaterialProvider.complete", model)
    assert [i.term for i in extract_material(file, live=True).knowledge] == ["Vertex"]


def test_selected_vector_pdf_renders_the_page_for_the_vision_transport(tmp_path, monkeypatch):
    path = tmp_path / "diagram.pdf"
    with pymupdf.open() as doc:
        doc.new_page().insert_text((20, 40), "Unused page")
        page = doc.new_page(width=1650, height=500)
        for x in (80, 880):
            page.draw_rect(pymupdf.Rect(x, 80, x + 440, 350), color=(0, 0, 0), width=8)
        page.draw_line((520, 230), (880, 230), color=(0, 0, 0), width=8)
        doc.save(path)
    monkeypatch.setenv("LLM_API_KEY", "test-only")

    def model(self, content, *, vision):
        assert vision
        data = base64.b64decode(content[1]["image_url"]["url"].split(",")[1])
        with Image.open(io.BytesIO(data)) as pixels:
            assert pixels.width == MAX_IMAGE_SIDE and pixels.height < pixels.width
            assert pixels.convert("L").getextrema()[0] < 25
        return [{"term": "Connector", "definition": "Joins the two outlined rectangles.",
                 "evidence": "The dark segment extends from one shape to the other.", "confidence": .9}]

    monkeypatch.setattr("backend.material_adapter.MaterialProvider.complete", model)
    result = extract_material(path, live=True, pages=[2])
    feature, = result.knowledge
    assert feature.page == 2 and feature.source_ids == ["pdf:p2:figure"] and feature.source_type == "image"


def test_real_vision_transport_over_loopback(tmp_path, monkeypatch):
    """Use the actual HTTP client. Only the vendor endpoint is replaced."""
    captured = []

    class Endpoint(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_POST(self):
            captured.append((self.path, json.loads(self.rfile.read(int(self.headers["Content-Length"])))))
            # Predefined response from this test server; no external model or credentials.
            points = {"points": [{
                "term": "Blue band", "definition": "Vertical stripe on the left side.",
                "evidence": "Blue pixels fill the left half of the diagram.",
                "relation": "diagram_relation", "confidence": .94,
            }]}
            response = json.dumps({"choices": [{"message": {"content": json.dumps(points)}}]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(response)))
            self.end_headers()
            self.wfile.write(response)

    image = Image.new("RGB", (128, 96), "white")
    ImageDraw.Draw(image).rectangle((0, 0, 63, 95), fill="blue")
    src = tmp_path / "diagram.png"
    image.save(src)
    monkeypatch.setenv("LLM_API_KEY", "loopback-test")
    monkeypatch.setenv("LLM_VISION_MODEL", "vision-fixture")
    monkeypatch.setenv("no_proxy", "127.0.0.1")
    with ThreadingHTTPServer(("127.0.0.1", 0), Endpoint) as server:
        monkeypatch.setenv("LLM_BASE_URL", f"http://127.0.0.1:{server.server_port}/v1")
        listener = Thread(target=server.serve_forever, daemon=True)
        listener.start()
        try:
            result = extract_material(src, live=True, original_name="Course diagram.png")
        finally:
            server.shutdown()
            listener.join(timeout=3)

    (route, payload), = captured
    assert route == "/v1/chat/completions" and payload["model"] == "vision-fixture"
    encoded = payload["messages"][1]["content"][1]["image_url"]["url"]
    header, data = encoded.split(",")
    assert header == "data:image/jpeg;base64"
    with Image.open(io.BytesIO(base64.b64decode(data))) as delivered:
        assert delivered.size == (128, 96)
        assert delivered.getpixel((20, 20))[2] > 240 and delivered.getpixel((20, 20))[0] < 15
        assert min(delivered.getpixel((100, 20))) > 245
    item, = result.knowledge
    assert (item.term, item.source_ids, item.source_ref, item.knowledge_type, item.source_type) == (
        "Blue band", ["image:1"], "Course diagram.png / 图 1", "diagram_relation", "image")
