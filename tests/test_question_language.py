"""Cross-language teaching copies and application-mode boundaries, using invented cases only."""

import asyncio
import json
from types import SimpleNamespace

import pytest
from matching_agent.llm import ModelMessage, ToolCall

from backend import question_language
from backend.agent_adapter import AgentAdapter
from backend.models import ExamQuestion, ExamWording, KnowledgeItem, UserPreferences
from backend.rpg.battle_content import active_exam
from backend.rpg.battle_rules import new_battle
from backend.rpg.models import RPGPreferences
from backend.rpg.service import RPGService
from backend.rpg.validation import check_game


@pytest.fixture
def exercises():
    result = []
    for i, (distance, time) in enumerate([(12, 4), (15, 5), (32, 8)]):
        options = [rf"\({distance // time}\,\mathrm{{m/s}}\)", r"\(5\,\mathrm{m/s}\)", r"\(8\,\mathrm{m/s}\)"]
        en = ExamWording(
            term=f"Mean speed on route {i}",
            definition=f"Route {i} covers {distance} metres in {time} seconds.",
            prompt=f"A trolley travels {distance} metres in {time} seconds. What is its mean speed?",
            options=options,
            hint="Divide the total distance by elapsed time.",
            explanation=f"Distance {distance} divided by elapsed time {time} gives {distance // time} metres per second.",
        )
        zh = ExamWording(
            term=f"路线{i}的平均速率",
            definition=f"路线{i}在{time}秒内走过{distance}米。",
            prompt=f"小车在{time}秒内走过{distance}米。它的平均速率是多少？",
            options=options,
            hint="用总路程除以经过的时间。",
            explanation=f"把路程{distance}米除以时间{time}秒，得到平均速率每秒{distance // time}米。",
        )
        result.append(
            KnowledgeItem(
                knowledge_id=f"case-{i}",
                term=en.term,
                definition=en.definition,
                source_ref=f"Study sheet, p. {i + 1}",
                evidence=en.prompt,
                exam_question=ExamQuestion(zh=zh, en=en, correct_index=0),
            )
        )
    return result


@pytest.mark.parametrize("lang", ["zh", "en"])
def test_exam_language_in_matching_camp_tower_and_grounded_grading(exercises, lang):
    service = RPGService()
    prefs = RPGPreferences(scene_count=1, challenge_count=3, question_language=lang)
    plan = service.plan_rpg(exercises, prefs)
    game = service.generate_rpg(exercises, plan)
    table = {item.knowledge_id: getattr(item.exam_question, lang) for item in exercises}
    questions = game.scenes[0].challenges
    for q in questions:
        expected = table[q.knowledge_id]
        assert (q.prompt, q.hint, q.explanation) == (expected.prompt, expected.hint, expected.explanation)
        assert {option.text for option in q.options} == set(expected.options)
        assert next(o.text for o in q.options if o.id == q.correct_option_id) == expected.options[0]
        original = next(k for k in exercises if k.knowledge_id == q.knowledge_id)
        assert (q.evidence, q.source_ref) == (original.evidence, original.source_ref)
    state = new_battle("test-session", "test-game", game, exercises)
    state.phase = "sidequest"
    state.review_queue = [questions[0].knowledge_id]
    camp = active_exam(state, game, exercises)
    assert camp.prompt.text.endswith(questions[0].prompt)
    assert camp.lesson.definition == questions[0].hint
    assert {o.text for o in camp.prompt.options} == {o.text for o in questions[0].options}
    state.phase = "combat"
    for floor, count in [(1, 1), (2, 1), (3, 1), (4, 2), (9, 3)]:
        copy = state.model_copy(update={"expedition": SimpleNamespace(tower_floor=floor)})
        turn = active_exam(copy, game, exercises)
        assert sum(q.prompt in turn.prompt.text for q in questions) == count

    matching = AgentAdapter()
    mp = matching.plan(exercises, UserPreferences(question_language=lang, pair_count=3))
    pairs = matching.generate(exercises, mp).pairs
    # Independent question banks can share the same numerical key.
    assert len(pairs) == 3 and len({p.right for p in pairs}) == 2
    for p in pairs:
        wording = table[p.knowledge_id]
        assert (p.left, p.hint, p.explanation) == (wording.prompt, wording.hint, wording.explanation)
        assert p.right == wording.options[0]
        assert 2 <= len(p.distractors) <= 3
        assert p.right not in p.distractors

    q = questions[0]
    q.correct_option_id = next(o.id for o in q.options if o.id != q.correct_option_id)
    assert "exam_binding" in [i.code for i in check_game(game, plan, exercises).issues]


def test_model_translation_preserves_evidence_math_and_numbers():
    item = KnowledgeItem(
        knowledge_id="speed",
        term="Mean speed",
        definition=r"The speed is \(v\) after 12 seconds.",
        source_ref="Lecture p. 2",
        evidence="Exact original statement.",
    )

    class Translator:
        def __init__(self, number):
            self.number = number

        async def choose(self, messages, tools):
            assert "Simplified Chinese" in messages[0]["content"]
            args = json.dumps({"line_0": "平均速率", "line_1": rf"经过 {self.number} 秒后，速率为 \(v\)。"})
            return ModelMessage(tool_calls=[ToolCall("example", "translate_lesson", args)])

    output = asyncio.run(question_language.localized_items([item], "zh", Translator(12)))[0]
    assert output.term == "平均速率" and r"\(v\)" in output.definition
    assert (output.evidence, output.source_ref) == (item.evidence, item.source_ref)
    with pytest.raises(question_language.LanguageError):
        asyncio.run(question_language.localized_items([item], "zh", Translator(20)))


def test_offline_without_translation_pack_keeps_no_foreign_question(monkeypatch, tmp_path):
    item = KnowledgeItem(
        knowledge_id="speed",
        term="Mean speed",
        definition="Total distance divided by elapsed time.",
        source_ref="Handout p. 3",
    )
    monkeypatch.setattr(question_language, "ROOT", tmp_path)
    question_language._local_model.cache_clear()
    with pytest.raises(question_language.LanguageError, match="install_question_translation"):
        asyncio.run(question_language.localized_items([item], "zh"))
    assert not question_language.accepts("The average speed of the moving cart.", "zh")
    assert question_language.accepts(item.definition, "en")
