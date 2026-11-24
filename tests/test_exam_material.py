"""Exam uploads keep the assessed task and verifying evidence together across page boundaries."""

import pytest
import pymupdf

from backend.exam_material import parse_exam, knowledge_from_exam
from backend.material_adapter import extract_material
from backend.material_processing import Material, MaterialError
from backend.physics_exam import solve_part


def test_pdf_uses_full_conditions_and_the_requested_quantity(tmp_path):
    path = tmp_path / "rotations.pdf"
    with pymupdf.open() as doc:
        for lines in [
            ["Sample Mechanics Exam", "Time Allowed: 2 Hours", "Calculator: only one permitted."],
            ["Summary of Basic Calculus:", "C is a constant."],
            [
                "1. A flywheel is undergoing constant angular acceleration. Its angular acceleration is",
                "0.500 rad/s2. The flywheel reaches an angular velocity of 6.00 rad/s at t = 4.00 s.",
                "(a) Find the magnitude of initial angular velocity.",
            ],
            ["(b) Calculate the angular displacement in this process. (4 pts)", "Solution: 20 radians."],
        ]:
            page = doc.new_page()
            for j, line in enumerate(lines):
                page.insert_text((40, 60 + j * 28), line, fontsize=10)
        doc.save(path)
    notes = extract_material(path).knowledge
    assert len(notes) == 2
    a, b = notes
    assert a.source_ref.endswith("p. 3 / Q1(a)") and b.source_ref.endswith("p. 3–4 / Q1(b)")
    assert len(a.source_ids) >= 2
    assert "6.00 rad/s" in a.evidence and "angular velocity" in a.evidence
    assert all("Time Allowed" not in n.evidence and "20 radians" not in n.evidence for n in notes)
    assert "初始角速度" in a.exam_question.zh.prompt and "6 rad/s" in a.exam_question.zh.prompt
    assert a.exam_question.zh.options[0] == r"\(4\,\mathrm{rad/s}\)"
    assert b.exam_question.en.options[0] == r"\(20\,\mathrm{rad}\)"


def test_unseen_numeric_questions_use_input_quantities_and_exclude_administration(tmp_path):
    path = tmp_path / "force.txt"
    path.write_text(
        "PHYSICS EXAM\nTime Allowed: Three hours\n"
        "1. A cart has mass 7 kg and travels at 6 m/s. What is its kinetic energy?\n"
        "2. An object of mass 8 kg accelerates at 3 m/s². Find the net force.\n"
        "3. A particle of mass 4 kg moves at 8 m/s. Determine its momentum.\n"
        "4. A particle moves as shown in the figure. Find the speed at point P.",
        encoding="utf8",
    )
    data = extract_material(path)
    assert [n.exam_question.en.options[0] for n in data.knowledge] == [
        r"\(126\,\mathrm{J}\)",
        r"\(24\,\mathrm{N}\)",
        r"\(32\,\mathrm{kg\,m/s}\)",
    ]
    assert len(data.knowledge) == 3 and all(n.exam_question.correct_index == 0 for n in data.knowledge)
    assert any("1 个题项" in w for w in data.warnings)
    assert [n.source_ids for n in data.knowledge] == [["line:3"], ["line:4"], ["line:5"]]


def test_numerical_ambiguity_skips_instead_of_guessing(tmp_path):
    path = tmp_path / "Quiz.txt"
    path.write_text(
        "Quiz\nTime Allowed: Two Hours\n1. A cart of mass 2 kg and a cart of mass 3 kg "
        "move at 4 m/s. Find their kinetic energy.\n2. Refer to the diagram. Find a speed.",
        encoding="utf8",
    )
    with pytest.raises(MaterialError, match="未找到"):
        extract_material(path)


def test_unknown_worked_problem_requires_verbatim_evidence_and_independent_bilingual_verdict():
    m = Material()
    for i, text in enumerate(
        [
            "Exam",
            "1. Two identical calibrated samples are compared.",
            "(a) Which property stays fixed?",
            "Solution: The density remains equal.",
        ]
    ):
        m.add_text(f"line:{i}", f"line {i + 1}", text)
    problem = parse_exam(m, "unfamiliar.txt")
    question = solve_part("A cart of mass 2 kg moves at 3 m/s.", "What is the kinetic energy?").model_dump()

    class Fake:
        def __init__(self, quote, valid):
            self.quote, self.valid, self.calls = quote, valid, 0

        def complete(self, prompt, **kwargs):
            self.calls += 1
            if self.calls == 1:
                return [{"answer_quote": self.quote, "question": question}]
            return [{"zh_index": 0, "en_index": 0, "valid": self.valid}]

    no_quote = Fake("unrelated", True)
    with pytest.raises(MaterialError):
        knowledge_from_exam(m, problem, "x", live_provider=no_quote)
    assert no_quote.calls == 1
    rejected = Fake("density remains equal", False)
    with pytest.raises(MaterialError):
        knowledge_from_exam(m, problem, "x", live_provider=rejected)
    assert rejected.calls == 2


def test_worked_solution_cannot_become_the_statement():
    m = Material()
    m.add_text("line:1", "line 1", "Mechanics Exam")
    m.add_text(
        "line:2",
        "line 2",
        "1. Determine a distance from the diagram. Solution: A cart of mass 3 kg travels at 5 m/s.",
    )
    p = parse_exam(m, "sample")
    assert p[0].setup.text.endswith("diagram.") and "3 kg" in p[0].parts[0].solution.text
    with pytest.raises(MaterialError):
        knowledge_from_exam(m, p, "sample")


def test_followup_conditions_and_conflicting_keys_require_review(tmp_path):
    source = (
        "A uniform solid cylinder is placed on a rough horizontal surface. "
        "A string is wrapped around the top of the cylinder and pulled horizontally to the right. "
        "It rolls without slipping."
    )
    ask = "Find the center-of-mass acceleration."
    assert solve_part(source, ask) is not None
    for variation in (
        source.replace("solid", "hollow"),
        source.replace("horizontally to the right", "downward"),
        source + " An additional force is applied at the center.",
        source + " It is then placed on an inclined plane.",
        source + " The cylinder now slips.",
    ):
        assert solve_part(variation, ask) is None
    path = tmp_path / "worked-exam.txt"
    for answer in ("a = 6F/(5M)", "a = 4F/(3M) to the left."):
        path.write_text(f"Mechanics Exam\n1. {source}\n(a) {ask}\nSolution: {answer}", encoding="utf8")
        with pytest.raises(MaterialError):
            extract_material(path)
    for answer, expected in [("48 J", False), ("36 joules", True)]:
        path.write_text(
            f"Quiz\n1. A cart of mass 2 kg travels at 6 m/s. What is its kinetic energy?\nSolution: {answer}",
            encoding="utf8",
        )
        if expected:
            assert extract_material(path).knowledge[0].exam_question.en.options[0] == r"\(36\,\mathrm{J}\)"
        else:
            with pytest.raises(MaterialError):
                extract_material(path)


def test_unknown_subject_with_scanned_task_and_numbered_cover_never_becomes_glossary(tmp_path):
    path = tmp_path / "folder-scan.pdf"
    with pymupdf.open() as doc:
        page = doc.new_page()
        for idx, line in enumerate(
            (
                "World History",
                "1. Time Allowed: 3 Hours",
                "2. Approved reference: one sheet",
                "Seat number: 40",
            )
        ):
            page.insert_text((40, 60 + idx * 30), line)
        page = doc.new_page()
        # A scan without a text layer supplies no recoverable task or answer.
        page.draw_rect((25, 25, 500, 730), fill=(0.7, 0.7, 0.7))
        doc.save(path)
    with pytest.raises(MaterialError, match="已识别出试卷"):
        extract_material(path)


def test_cross_product_requires_original_order_and_exact_operands():
    setup = "Two vectors u = 1^i + 2^j and v = 2^i + 3^k."
    forward = solve_part(setup, "Find u × v.")
    reverse = solve_part(setup, "Find v × u.")
    assert forward.en.options[0] == r"\(\left(6,-3,-4\right)\)"
    assert reverse.en.options[0] == r"\(\left(-6,3,4\right)\)"
    assert solve_part(setup, "Find u × v, projected onto the vertical axis.") is None


def test_blind_review_checks_answer_identity_in_separate_choice_orders():
    import json
    from backend.exam_provider import grounded_question

    setup = "A cart of mass 2 kg travels at 6 m/s."
    ask = "What is its kinetic energy?"
    data = Material()
    for i, line in enumerate(["Quiz", "1. " + setup, "(a) " + ask, "Solution: The kinetic energy is 36 J."]):
        data.add_text(f"line:{i}", str(i), line)
    p = parse_exam(data, "sample")[0]
    exercise = solve_part(setup, ask)

    class Referee:
        def complete(self, prompt, **kwargs):
            if "independently" not in prompt:
                return [{"answer_quote": "kinetic energy is 36 J", "question": exercise.model_dump()}]
            case = json.loads(prompt.split("\n", 1)[1])
            assert "correct_index" not in case["zh"] and "hint" not in case["en"]
            correct = exercise.en.options[exercise.correct_index]
            zh, en = [case[lang]["options"].index(correct) for lang in ["zh", "en"]]
            assert zh != en
            return [{"zh_index": zh, "en_index": en, "valid": True}]

    assert grounded_question(Referee(), p, p.parts[0]) == exercise
