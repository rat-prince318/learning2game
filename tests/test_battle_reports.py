"""Hand-check the denominators and curriculum coverage of a battle recap."""

from pathlib import Path

import pytest

from backend.material_adapter import extract_material
from backend.rpg.battle_models import BattleTally
from backend.rpg.battle_reports import build_report
from backend.rpg.battle_rules import new_battle
from backend.rpg.models import RPGGameInternal


@pytest.fixture
def campaign():
    root = Path(__file__).resolve().parents[1]
    config = root / "docs/rpg-fixtures/normal/game-internal.private.json"
    game = RPGGameInternal.model_validate_json(config.read_bytes())
    knowledge = extract_material(root / "public/examples/cell-notes.txt").knowledge
    return new_battle("test-battle", "cell-game", game, knowledge), game, knowledge


def test_retreat_before_first_answer_has_null_rates(campaign):
    state, game, knowledge = campaign
    with pytest.raises(ValueError, match="terminal"):
        build_report(state, game, knowledge)
    state = state.model_copy(update={"phase": "retreated"})
    report = build_report(state, game, knowledge)
    assert (report.session_id, report.game_id, report.outcome) == ("test-battle", "cell-game", "retreated")
    assert report.combat_accuracy is report.first_attempt_accuracy is report.review_accuracy is None
    assert report.completion_rate == 0 and report.drops == []
    assert report.weak_knowledge_ids == []
    assert report.untouched_knowledge_ids == [c.knowledge_id for c in report.concepts]
    assert all(c.first_attempt_correct is None and c.source_ref and c.explanation for c in report.concepts)
    assert {c.term for c in report.concepts} == {x.term for x in knowledge[:6]}


def test_hint_then_retreat_marks_one_concept_seen_without_an_attempt(campaign):
    state, game, knowledge = campaign
    kid = game.scenes[0].challenges[0].knowledge_id
    state = state.model_copy(update={"phase": "retreated", "concepts": {kid: BattleTally(hints=1)}})
    report = build_report(state, game, knowledge)
    assert report.weak_knowledge_ids == [kid] and kid not in report.untouched_knowledge_ids
    assert report.combat_attempts == 0 and report.first_attempt_accuracy is None


def test_remediation_and_campaign_retries_use_separate_denominators(campaign):
    state, game, knowledge = campaign
    first, second = game.scenes[0].challenges
    tallies = {
        first.knowledge_id: BattleTally(combat_attempts=4, combat_correct=2, first_attempt_correct=False,
                                        review_attempts=3, review_correct=1, hints=0, review_hints=2),
        second.knowledge_id: BattleTally(combat_attempts=1, combat_correct=1, first_attempt_correct=True,
                                         hints=1, review_attempts=0, review_correct=0),
    }
    state = state.model_copy(update={"phase": "retreated", "cleared_stages": 1, "defeats": 1,
                                     "sidequests_completed": 1, "concepts": tallies})
    report = build_report(state, game, knowledge)
    assert (report.cleared_stages, report.total_stages, report.defeats, report.sidequests_completed) == (1, 3, 1, 1)
    assert report.completion_rate == pytest.approx(1 / 3)
    assert (report.combat_correct, report.combat_attempts, report.first_attempt_accuracy) == (3, 5, .5)
    assert report.combat_accuracy == pytest.approx(3 / 5)
    assert (report.review_correct, report.review_attempts) == (1, 3)
    assert report.review_accuracy == pytest.approx(1 / 3)
    assert report.hints == 1 and report.review_hints == 2
    assert report.weak_knowledge_ids == [first.knowledge_id, second.knowledge_id]
    assert report.untouched_knowledge_ids == [c.knowledge_id for c in report.concepts[2:]]
    row = report.concepts[0]
    assert (row.scene_id, row.source_ref, row.explanation) == (
        game.scenes[0].scene_id, first.source_ref, first.explanation)
    assert row.combat_mistakes == 2 and row.review_hints == 2 and row.hints == 0


def test_legacy_material_labels_can_be_missing_or_rich_text(campaign):
    state, game, knowledge = campaign
    first, second = game.scenes[0].challenges
    legacy = [k.model_copy(update={"term": "<em>标签</em>"}) if k.knowledge_id == first.knowledge_id else k
              for k in knowledge if k.knowledge_id != second.knowledge_id]
    report = build_report(state.model_copy(update={"phase": "retreated"}), game, legacy)
    assert [c.term for c in report.concepts[:2]] == ["知识点 1", "知识点 2"]
    assert report.concepts[0].source_ref == first.source_ref
    assert report.concepts[1].source_ref == second.source_ref
