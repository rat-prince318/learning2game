import pytest
from backend.rpg import expedition as ex
from backend.rpg.battle_rules import BattleError
from backend.rpg.quest_story import CHOICES
from test_expedition import answer, bookshelf, command, win_current


def test_finale_requires_battle_and_allied_witnesses_have_to_be_earned():
    courses = bookshelf(books=1, chapters=1)
    state = ex.new_expedition("liberation", courses, campaign_story=True)
    with pytest.raises(BattleError):
        command(state, courses, "story_choice", choice="wake_towns")
    with pytest.raises(BattleError):
        command(state, courses, "story_choice", choice="forge_knight")
    state = command(state, courses, "story_choice", choice="ferry_decree")
    assert state.coins == 2 and state.story_marks == {"willow_ferry": "ferry_decree"}
    with pytest.raises(BattleError):
        command(state, courses, "story_choice", choice="ferry_child")
    protected = command(state, courses, "inspect_landmark")
    for run, ending in ((state, "shatter_crown"), (protected, "wake_towns")):
        run = command(run, courses, "choose_route", route_id="boss_daring")
        assert run.battle.expedition.encounter_id == "ash_crown"
        assert run.battle.expedition.shield == 3
        phases = set()
        while run.phase == "combat":
            phases.add(run.battle.expedition.phase)
            run = answer(run, courses)
        assert run.phase == "victory" and phases == {1, 2}
        if ending == "shatter_crown":
            with pytest.raises(BattleError):
                command(run, courses, "story_choice", choice="wake_towns")
        run = command(run, courses, "story_choice", choice=ending)
        assert ex.report(run, courses).story_ending == ending
        assert ex.view(run, courses).bounty_seals[0].boss_id == "ash_crown"
        with pytest.raises(BattleError):
            command(run, courses, "story_choice", choice="keep_watch")


def test_all_eight_stations_can_reach_the_final_battle_and_legacy_ferry_stays_local():
    courses = bookshelf(books=8, chapters=1)
    state = ex.new_expedition("eight", courses, campaign_story=True)
    for region, marks in CHOICES.items():
        state = command(state, courses, "story_choice", choice=marks[0])
        state = command(state, courses, "inspect_landmark")
        state = command(state, courses, "choose_route", route_id="boss_steady")
        state = win_current(state, courses)
        if state.phase == "reward":
            state = command(state, courses, "choose_reward", reward_id="purse")
    assert len(state.story_marks) == len(state.field_signals) == 8
    assert state.journal[-1].encounter_id == "ash_crown"
    assert (
        command(state, courses, "story_choice", choice="keep_watch").story_ending
        == "keep_watch"
    )
    legacy = ex.new_expedition("legacy", bookshelf(1, 1))
    with pytest.raises(BattleError):
        command(legacy, bookshelf(1, 1), "story_choice", choice="ferry_decree")
    assert ex.view(legacy, bookshelf(1, 1)).routes[0].encounter_id == "willow_lock"
