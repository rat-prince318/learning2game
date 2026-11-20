"""Study battles should only ask a resolved exercise again for an explicit reason."""

import pytest

from backend.rpg.battle_content import active_exam
from backend.rpg.battle_models import BattleState
from backend.rpg.battle_rules import BattleError, begin_encounter, new_battle, view
from test_battle_rules import answer, campaign, command
from test_expedition_combat import answer as tactical_answer


@pytest.mark.parametrize("count", [1, 2, 5])
def test_mastering_a_short_book_finishes_a_tough_boss_without_replaying_it(count):
    base, game, book = campaign(count, 1)
    fight = begin_encounter(base, game, "willow_lock", [], region_index=0)
    questions, phases = [], []
    while fight.phase == "combat" and len(questions) <= count:
        current = view(fight, game, book)
        assert current.prompt.purpose is None
        questions.append(current.prompt.text)
        phases.append(current.tactics.phase)
        after = tactical_answer(fight, (game, book), "guard")
        assert after.last_event.damage_dealt == fight.enemy_hp - after.enemy_hp
        fight = after
    assert fight.phase == "victory" and len(set(questions)) == len(questions) == count
    assert all(t.combat_attempts == t.combat_correct == 1 for t in fight.concepts.values())
    if count > 1:
        assert set(phases) == {1, 2}


def test_wrong_answer_waits_behind_unsolved_material_and_is_identified_on_resume():
    state, game, course = campaign(3, 1)
    first = view(state, game, course).prompt
    state = answer(state, game, course, correct=False)
    rest = []
    for _ in range(2):
        fresh = view(state, game, course).prompt
        assert fresh.purpose is None
        rest.append(fresh.text)
        state = answer(state, game, course)
    assert len(set([first.text, *rest])) == 3
    state = BattleState.model_validate_json(state.model_dump_json())
    retry = view(state, game, course).prompt
    assert retry.text == first.text and retry.purpose == "retry" and retry.prompt_id != first.prompt_id
    hinted = command(state, game, course, "hint", prompt_id=retry.prompt_id)
    assert view(hinted, game, course).prompt.purpose == "retry"
    final = answer(hinted, game, course)
    assert final.phase == "victory" and final.last_event.damage_dealt == hinted.enemy_hp
    assert sum(t.combat_attempts for t in final.concepts.values()) == 4


def test_camp_preserves_solved_exercises_and_keeps_the_failed_one_for_a_formal_retry():
    state, game, course = campaign(3, 1)
    first = active_exam(state, game, course).question
    state = answer(state, game, course)
    failed = active_exam(state, game, course).question
    state.hp = 1
    camp = answer(state, game, course, correct=False)
    assert camp.review_queue == [failed.knowledge_id]
    recovered = answer(BattleState.model_validate_json(camp.model_dump_json()), game, course)
    assert recovered.phase == "combat" and first.challenge_id not in recovered.pending
    assert recovered.enemy_hp == view(recovered, game, course).enemy.max_hp
    recovered = answer(recovered, game, course)
    retry = view(recovered, game, course).prompt
    assert retry.text == failed.prompt and retry.purpose == "retry"
    final = answer(recovered, game, course)
    assert final.phase == "victory"
    assert final.concepts[first.knowledge_id].combat_attempts == 1
    assert final.concepts[failed.knowledge_id].combat_attempts == 2


def test_old_finishing_turn_is_stable_until_submitted_then_resolves_the_remaining_health():
    state, game, course = campaign(3, 1)
    old = state.model_dump(exclude={"retry_ids"})
    old.update(pending=[], finishing_turn=2, prompt_serial=8, enemy_hp=18)
    old_state = BattleState.model_validate(old)
    prompt = view(old_state, game, course).prompt
    assert prompt.text == game.scenes[0].challenges[2].prompt and prompt.purpose == "finisher"
    assert view(BattleState.model_validate(old), game, course).prompt == prompt
    assert answer(old_state, game, course).last_event.damage_dealt == 18
    missed = answer(old_state, game, course, correct=False)
    retry = view(missed, game, course).prompt
    assert retry.text == prompt.text and retry.purpose == "retry"
    assert answer(missed, game, course).phase == "victory"


def test_duplicate_rows_from_an_old_publisher_do_not_turn_into_extra_answers():
    state, game, course = campaign(3, 1)
    first, duplicate, distinct = game.scenes[0].challenges
    duplicate.prompt = first.prompt
    correct_text = next(o.text for o in first.options if o.id == first.correct_option_id)
    next(o for o in duplicate.options if o.id == duplicate.correct_option_id).text = correct_text
    rebuilt = new_battle("other-run", state.game_id, game, course)
    assert rebuilt.pending == [first.challenge_id, distinct.challenge_id]
    # A stored pre-upgrade queue still presents its outstanding prompt verbatim.
    assert state.pending == [first.challenge_id, duplicate.challenge_id, distinct.challenge_id]
    after = answer(state, game, course)
    assert after.pending == [distinct.challenge_id]
    final = answer(after, game, course)
    assert final.phase == "victory" and sum(t.combat_attempts for t in final.concepts.values()) == 2


def test_old_rematch_keeps_the_outstanding_card_and_then_removes_previously_mastered_rows():
    state, game, course = campaign(3, 1)
    current, cleared, fresh = game.scenes[0].challenges
    state = BattleState.model_validate(state.model_dump(exclude={"retry_ids"}))
    state.concepts[cleared.knowledge_id].combat_attempts = 1
    state.concepts[cleared.knowledge_id].combat_correct = 1
    assert active_exam(state, game, course).question.challenge_id == current.challenge_id
    next_turn = answer(state, game, course)
    assert next_turn.pending == [fresh.challenge_id]
    assert answer(next_turn, game, course).phase == "victory"


def test_camp_rotates_only_the_unfinished_suffix_and_rejects_the_pre_rotation_prompt():
    state, game, course = campaign(3, 1)
    for _ in range(3):
        state = answer(state, game, course, correct=False)
    assert state.phase == "sidequest" and len(state.review_queue) == 3
    state = answer(state, game, course)
    completed, deferred, waiting = state.review_queue
    old_exam = active_exam(state, game, course)
    next_turn = answer(state, game, course, correct=False)
    assert next_turn.review_queue == [completed, waiting, deferred]
    assert next_turn.review_index == 1 and next_turn.last_event.correct is False
    reopened = BattleState.model_validate_json(next_turn.model_dump_json())
    next_exam = active_exam(reopened, game, course)
    assert next_exam.question.knowledge_id == waiting
    assert next_exam.prompt.prompt_id != old_exam.prompt.prompt_id
    with pytest.raises(BattleError) as stale:
        command(reopened, game, course, "answer", prompt_id=old_exam.prompt.prompt_id,
                option_id=old_exam.answer_id)
    assert stale.value.status_code == 409
    last = answer(reopened, game, course)
    assert active_exam(last, game, course).question.knowledge_id == deferred
    wrong_last = answer(last, game, course, correct=False)
    assert wrong_last.review_index == 2 and active_exam(wrong_last, game, course).question.knowledge_id == deferred
    assert answer(wrong_last, game, course).phase == "combat"
