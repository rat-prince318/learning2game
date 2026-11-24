"""Publication, independent checking and reuse of authored course exercises."""

import copy
from types import SimpleNamespace

import pytest

from backend.models import KnowledgeItem
from backend.rpg import service
from backend.rpg.lesson_text import math_ok, reusable_exam
from backend.rpg.battle_content import _review, _tower_exam
from backend.rpg.battle_rules import _record_card
from backend.rpg.encounter_drills import build_drills, drill_key
from backend.rpg.models import RPGPreferences
from backend.rpg.validation import RPGContentError


def lecture():
    return KnowledgeItem(knowledge_id="k_force", term="Net force", source_ref="Lecture p. 3",
                         definition="Net force equals mass times acceleration.",
                         evidence="For constant mass, net force equals mass times acceleration.")


def exercises(count):
    prompts = [
        "一辆质量为 2 kg 的小车加速度为 3 m/s²，合力是多少？",
        "相同的合力分别作用在两辆小车上，哪辆车的加速度更大？",
        "小车受到向西的合力，哪个量的方向也朝西？",
        "小车质量固定。如果合力变成原来的两倍，加速度怎样变化？",
        "实验中已测得合力和加速度，怎样求小车的质量？",
    ]
    options = [["6 N", "5 N", "1 N"], ["质量较小的小车", "质量较大的小车", "两辆车的加速度相同"],
               ["加速度", "位置", "速率"], ["增至两倍", "减至一半", "保持原值"],
               ["用合力除以加速度", "用合力乘以加速度", "用加速度除以合力"]]
    reasons = [r"代入 \(F=ma\)，得到 \(2\times 3=6\) N。", "合力相同时，质量越小，加速度越大。",
               "对于质量固定的小车，加速度沿着合力方向。", "固定质量时，加速度与合力成正比。",
               "将等式两边除以加速度即可求出质量。"]
    return [{"prompt": p, "options": o, "correct_index": 0, "hint": "先用关系式写出各量的联系。",
             "explanation": r} for p, o, r in zip(prompts[:count], options, reasons)]


class Flash:
    def __init__(self, *, corrupt=None):
        self.corrupt = corrupt
        self.authors = []
        self.reviews = []
        self.closed = False

    async def structured(self, task, instruction, payload, schema):
        if task == "author_course_lesson":
            self.authors.append(copy.deepcopy(payload))
            if payload.get("replace_these"):
                questions = exercises(5)[:payload["count"]]
            else:
                questions = exercises(payload["count"])
            if self.corrupt == "image" or (len(self.authors) == 1 and self.corrupt == "repair"):
                questions[0]["prompt"] = "如图所示，哪辆小车的加速度更大？"
            return {"title": "力、质量和加速度",
                    "note": r"质量固定时，合力决定加速度的方向和大小。写出 \(F=ma\)，代入已知的两个量便能求第三个量。",
                    "questions": questions}
        if task == "teach_course_idea":
            return {"title": "力、质量和加速度", "note": r"质量固定时，合力决定加速度的方向和大小。写出 \(F=ma\)，代入已知的两个量便能求第三个量。"}
        if task == "author_one_course_exercise":
            question = exercises(1)[0]
            if self.corrupt == "image":
                question["prompt"] = "如图所示，哪辆小车的加速度更大？"
            return question
        if task == "audit_course_evidence":
            assert "source" in payload and "lesson" in payload
            return {"issues": []}
        assert task == "solve_course_exercises"
        assert "source" not in payload and "lesson" not in payload
        self.reviews.append(copy.deepcopy(payload))
        known = {q["prompt"]: q for q in exercises(5)}
        indices = [q["choices"].index(known[q["prompt"]]["options"][0]) for q in payload["questions"]]
        ambiguous = self.corrupt == "ambiguous" or (self.corrupt == "bulk" and len(indices) > 1)
        return {"choices": [-1] * len(indices) if ambiguous else indices,
                "solutions": [known[q["prompt"]]["explanation"] for q in payload["questions"]], "issues": []}

    async def close(self):
        self.closed = True


def publish(monkeypatch, flash):
    monkeypatch.setattr(service, "lesson_client", lambda: flash)
    monkeypatch.setenv("DASHSCOPE_API_KEY", "test-local-transport")
    monkeypatch.setenv("EDUGAME_MODE", "live")
    rows = [lecture()]
    svc = service.RPGService(live=True)
    plan = svc.plan_rpg(rows, RPGPreferences(question_language="zh", challenge_count=1,
                                            scene_count=1, selected_knowledge_ids=["k_force"]))
    return svc.generate_rpg(rows, plan)


def test_flash_publication_retries_and_uses_same_material_in_camp_and_tower(monkeypatch):
    client = Flash(corrupt="repair")
    game = publish(monkeypatch, client)
    scene = game.scenes[0]
    q = scene.challenges[0]
    assert q.lesson_authored and q.evidence == lecture().evidence
    assert q.study_term == "力、质量和加速度" and r"\(F=ma\)" in q.study_definition
    assert len(client.authors) == 2 and "repair" in client.authors[-1] and client.closed
    assert all(set(ex) == {"prompt", "choices"} for ex in client.reviews[0]["questions"])
    assert len(q.practice_exercises) == 4
    deck = build_drills(scene, [lecture()], "zh", "ash_crown")
    assert len(deck) == 4 and all(d.kind == "application" for d in deck)
    assert all(d.card.source_ref == lecture().source_ref for d in deck)
    seen = [drill_key(d.card) for d in deck]
    assert {d.card.prompt for d in build_drills(scene, [lecture()], "zh", "ash_crown", seen)} == {
        x.prompt for x in q.practice_exercises}
    state = SimpleNamespace(defeats=1, review_index=0, hinted=True, camp_key="camp",
                            expedition=SimpleNamespace(tower_floor=2))
    camp = _review(state, "turn", q, game, [lecture()])
    assert camp.prompt.text == q.practice_exercises[1].prompt and camp.lesson.definition == q.study_definition
    tower = _tower_exam(state, "turn", q, scene, [lecture()])
    assert tower.prompt.text == q.practice_exercises[0].prompt and tower.question.challenge_id == q.challenge_id
    state.pending, state.retry_ids = [q.challenge_id], []
    _record_card(state, scene, tower.question, correct=True)
    assert state.pending == [] and state.finishing_turn == 0


def test_batch_disagreement_recovers_with_five_verified_single_exercises(monkeypatch):
    client = Flash(corrupt="bulk")
    game = publish(monkeypatch, client)
    questions = game.scenes[0].challenges[0]
    assert len(questions.practice_exercises) == 4
    single = [view["questions"][0]["prompt"] for view in client.reviews if len(view["questions"]) == 1]
    assert set(single) == {q["prompt"] for q in exercises(5)}


def test_older_exam_requires_self_contained_renderable_primary():
    q = exercises(1)[0]
    wording = SimpleNamespace(**q)
    item = SimpleNamespace(exam_question=SimpleNamespace(zh=wording, correct_index=0))
    assert reusable_exam(item, "zh").prompt == q["prompt"]
    wording.prompt = "如图所示，电阻两端的电压是多少？"
    assert reusable_exam(item, "zh") is None
    wording.prompt = "函数 f(x)=x^2 在原点的导数是多少？"
    assert reusable_exam(item, "zh") is None


@pytest.mark.parametrize("failure", ["image", "ambiguous"])
def test_flash_never_publishes_a_missing_diagram_or_a_disputed_solution(monkeypatch, failure):
    client = Flash(corrupt=failure)
    with pytest.raises(RPGContentError, match="独立复核"):
        publish(monkeypatch, client)
    assert len(client.authors) == 4 and client.closed


@pytest.mark.parametrize("formula,valid", [(r"化简 \(\frac{2F}{3Mg}\)。", True),
                                          (r"化简 \(\frac{2F}{3Mg}。", False),
                                          (r"Value: $\frac{a}{b$.", False),
                                          ("It costs $10 today.", True), ("有 f(x)=x^2。", False), ("函数f(x)。", False), ("(9-1)/(3-1)=4", False),
                                          (r"区间 \[1,3\]。", False), (r"区间 \([1,3]\)。", True)])
def test_balanced_math(formula, valid):
    assert math_ok(formula) is valid

def test_publication_checks_the_browser_renderer_for_unknown_tex_commands():
    import asyncio
    import shutil
    from types import SimpleNamespace

    from backend.rpg.formula_check import verify_rendering

    if not shutil.which("node"):
        pytest.skip("Shared KaTeX rendering check requires Node")
    lesson = SimpleNamespace(title="动能", note=r"动能为 \(\frac{1}{2}mv^2\)。", questions=[])
    asyncio.run(verify_rendering(lesson))
    lesson.note = r"动能为 \(\nonexistentCourseMacro{1}\)。"
    with pytest.raises(ValueError, match="KaTeX"):
        asyncio.run(verify_rendering(lesson))
