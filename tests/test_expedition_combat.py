"""Play expedition rules against published study content, including weak and veteran builds."""

from pathlib import Path

import pytest
from pydantic import ValidationError

from backend.material_adapter import extract_material
from backend.rpg import expedition_combat as tactics, expedition_world as world
from backend.rpg.battle_content import active_exam
from backend.rpg.battle_models import Answer, BattleState, ExpeditionAnswer
from backend.rpg.battle_rules import BattleError, advance, begin_encounter, new_battle, player_stats, view
from backend.rpg.hero_catalog import class_info
from backend.rpg.models import RPGPreferences
from backend.rpg.service import RPGService


@pytest.fixture(scope="module")
def course():
    source = Path(__file__).resolve().parents[1] / "public" / "examples" / "cell-notes.txt"
    knowledge = extract_material(source).knowledge
    generator = RPGService()
    plan = generator.plan_rpg(knowledge, RPGPreferences(challenge_count=8, scene_count=1))
    return generator.generate_rpg(knowledge, plan), knowledge


def start(course, encounter, *, region=0, relics=(), veteran=False, xp=0, hero="arcanist"):
    game, knowledge = course
    state = new_battle("solo", "book", game, knowledge, hero_class=hero)
    state.xp = xp
    if xp:
        weapons = class_info(hero).weapon_ids
        state.inventory_ids.extend(weapons[1:])
        state.loadout.weapon = state.equipped_id = weapons[-1]
    state.hp = player_stats(state, relic_ids=list(relics)).max_hp
    return begin_encounter(state, game, encounter, list(relics), region_index=region, veteran=veteran)


def answer(state, course, skill="strike", *, correct=True):
    game, knowledge = course
    exam = active_exam(state, game, knowledge)
    choice = next(o for o in exam.prompt.options if (o.id == exam.answer_id) == correct)
    action = ExpeditionAnswer(action="answer", event_id=f"event-{state.revision}", expected_revision=state.revision,
                              prompt_id=exam.prompt.prompt_id, option_id=choice.id, skill=skill)
    return advance(state, action, game, knowledge)


def strategy(public):
    turn = public.tactics
    if turn.intent.id in ("heavy", "charge") or turn.strike_exposure > 0:
        return "guard"
    if public.player.burst_ready:
        return "burst"
    return "strike"


def test_guard_break_and_burst_have_different_outcomes_on_the_same_question(course):
    state = start(course, "willow_lock", relics=["shell_tally"])
    initial = view(state, *course)
    assert initial.tactics.intent.id == "charge" and initial.player.focus == 1
    guarded = answer(state, course, "guard")
    struck = answer(state, course)
    assert guarded.last_event.tactics.intercepted_charge and guarded.last_event.tactics.broke_shield
    assert not struck.last_event.tactics.intercepted_charge and struck.expedition.charged
    assert struck.last_event.damage_dealt > guarded.last_event.damage_dealt
    opening = view(guarded, *course).tactics
    assert opening.intent.id == "expose" and opening.broken
    assert answer(guarded, course).last_event.tactics.exploited_break
    assert BattleState.model_validate_json(guarded.model_dump_json()) == guarded


def test_forecast_matches_real_damage_and_veterans_have_distinct_patterns(course):
    normal = start(course, "reef_diver", region=1)
    veteran = start(course, "reef_diver", region=1, veteran=True)
    basic, harder = view(normal, *course), view(veteran, *course)
    assert harder.tactics.veteran and not basic.tactics.veteran
    assert basic.tactics.intent.id == "charge" and harder.tactics.intent.id == "heavy"
    assert harder.enemy.max_hp > basic.enemy.max_hp and harder.tactics.shield_max == basic.tactics.shield_max + 1
    guard = answer(veteran, course, "guard")
    swing = answer(veteran, course)
    assert guard.last_event.damage_received == harder.tactics.guard_exposure == 0
    assert swing.last_event.damage_received == harder.tactics.strike_exposure > 0
    assert guard.expedition.shield < swing.expedition.shield


@pytest.mark.parametrize("veteran", [False, True])
@pytest.mark.parametrize("region", range(8))
def test_every_keeper_has_a_winnable_second_phase_and_all_concepts_are_covered(course, region, veteran):
    # A region-appropriate hero begins in full health and uses the published
    # cues; this route permits no defeat, fabricated correct answer, or retry.
    state = start(course, world.region_at(region).boss_id, region=region,
                  xp=region * 180, veteran=veteran, hero=("vanguard", "arcanist", "ranger")[region % 3])
    intents = set()
    phases = set()
    for _ in range(65):
        public = view(state, *course)
        if public.phase == "victory":
            break
        assert public.phase == "combat"
        phases.add(public.tactics.phase)
        intents.add(public.tactics.intent.id)
        state = answer(state, course, strategy(public))
    assert state.phase == "victory" and state.defeats == 0
    assert phases == {1, 2} and len(intents) >= 2
    assert len(state.concepts) == 8 and all(q.combat_correct > 0 for q in state.concepts.values())


def test_tactical_defeat_and_mistake_trigger_sourced_camp_rematch(course):
    state = start(course, "eclipse_lion")
    # Tactical defeat with a low-HP returnee records the correct answer as correct.
    state.hp = 1
    kid = active_exam(state, *course).question.knowledge_id
    defeated = answer(state, course)
    assert defeated.phase == "sidequest" and defeated.review_queue == [kid]
    assert defeated.concepts[kid].combat_correct == 1 and defeated.concepts[kid].first_attempt_correct
    assert view(defeated, *course).sidequest.lesson.source_ref == active_exam(state, *course).question.source_ref
    recovered = answer(defeated, course)
    assert recovered.last_event.kind == "recovered" and recovered.xp == state.xp
    assert recovered.hp == player_stats(recovered).max_hp and recovered.expedition.turn == 0
    assert recovered.expedition.shield == world.encounter_for("eclipse_lion").shield
    recovered.hp = 1
    missed = answer(recovered, course, "guard", correct=False)
    assert missed.phase == "sidequest" and missed.concepts[kid].combat_attempts == 2
    assert missed.concepts[kid].combat_correct == 1 and missed.defeats == 2


def test_same_all_correct_answers_have_different_results_when_the_player_reads_intents(course):
    start_state = start(course, "willow_lock", veteran=True)
    reckless = start_state
    while reckless.phase == "combat":
        reckless = answer(reckless, course)
    deliberate = start_state
    while deliberate.phase == "combat":
        deliberate = answer(deliberate, course, strategy(view(deliberate, *course)))
    assert reckless.phase == "sidequest" and reckless.hp == 0
    assert deliberate.phase == "victory" and deliberate.defeats == 0
    assert all(t.combat_correct == t.combat_attempts for t in reckless.concepts.values())
    assert all(t.combat_correct == t.combat_attempts for t in deliberate.concepts.values())


def test_relics_change_stats_opening_focus_and_real_attacks(course):
    plain = start(course, "copper_drake")
    fitted = start(course, "copper_drake", relics=["shell_tally", "striker_spring", "brine_lens",
                                                 "rivet_wedge", "kiln_glove", "kite_spool"])
    assert fitted.focus == player_stats(fitted).focus_max
    a, b = player_stats(plain), player_stats(fitted)
    assert (b.attack - a.attack, b.burst_percent - a.burst_percent, b.defense - a.defense) == (2, 20, 1)
    first = answer(fitted, course, "burst")
    assert first.last_event.damage_dealt > answer(plain, course).last_event.damage_dealt
    assert first.last_event.tactics.broke_shield
    guarded = start(course, "mirror_lynx", region=5, relics=["silent_clapper"])
    plain = start(course, "mirror_lynx", region=5)
    assert answer(guarded, course, "guard").last_event.damage_received < answer(plain, course, "guard").last_event.damage_received


def test_mature_hero_keeps_weapon_and_wounds_and_can_grow_past_short_game_cap(course):
    state = start(course, "pollen_lantern", region=1, hero="vanguard", xp=265)
    state.hp = 18
    final = state.model_copy(deep=True)
    while final.phase == "combat":
        final = answer(final, course, strategy(view(final, *course)))
    assert final.phase == "victory"
    assert final.last_event.loot is None and final.loadout.weapon == state.loadout.weapon
    assert view(final, *course).player.level == 7 and final.last_event.levels_gained == 1
    assert final.hp < player_stats(final).max_hp
    again = begin_encounter(final, course[0], "pollen_lantern", [], region_index=1)
    assert again.hp == final.hp and again.xp == final.xp
    assert tactics.level_for_xp(2024) == 19 and tactics.level_for_xp(2025) == 20
    assert tactics.xp_to_next_level(9999) == 0
    healed = start(course, "pollen_lantern", region=1, hero="vanguard", xp=265, relics=["ferryman_knot"])
    healed.hp = state.hp
    while healed.phase == "combat":
        healed = answer(healed, course, strategy(view(healed, *course)))
    assert healed.hp == final.hp + 4


def test_plain_battles_keep_short_progression_and_guard_is_expedition_only(course):
    state = new_battle("solo", "book", *course)
    assert view(state, *course).tactics is None
    with pytest.raises(ValidationError):
        Answer(action="answer", event_id="input", expected_revision=0, prompt_id="turn", option_id="a", skill="guard")
    with pytest.raises(BattleError) as error:
        answer(state, course, "guard")
    assert error.value.status_code == 422 and state.revision == 0


def test_refinements_change_actual_damage_and_restore_the_same_build_on_rematch(course):
    # The same ordinary strike and frontline counter on the same turn. No
    # poise break, critical or minimum-HP reservation can obscure the comparison.
    plain = start(course, "mirror_lynx", region=3)
    forged = begin_encounter(plain, course[0], "mirror_lynx", [], region_index=3, edge_ranks=2, plating_ranks=3)
    sheet = view(forged, *course)
    assert sheet.player.attack == player_stats(plain).attack + 4
    assert sheet.player.stats.defense == player_stats(plain).defense + 6
    assert (sheet.tactics.edge_ranks, sheet.tactics.plating_ranks) == (2, 3)
    hit, baseline = answer(forged, course), answer(plain, course)
    assert hit.last_event.damage_dealt > baseline.last_event.damage_dealt
    assert hit.last_event.damage_received < baseline.last_event.damage_received
    forged.hp = 1
    camp = answer(forged, course, correct=False)
    assert camp.phase == "sidequest"
    recovered = answer(BattleState.model_validate_json(camp.model_dump_json()), course)
    assert recovered.phase == "combat" and player_stats(recovered) == sheet.player.stats


def test_refinements_are_bounded_and_absent_in_legacy_and_unforged_saves(course):
    initial = new_battle("solo", "book", *course)
    preview = player_stats(initial, edge_ranks=8)
    assert preview.attack == player_stats(initial).attack + 16
    with pytest.raises(ValidationError):
        begin_encounter(initial, course[0], "mirror_lynx", [], region_index=3, edge_ranks=5, plating_ranks=4)
    plain = start(course, "mirror_lynx", region=3)
    data = plain.model_dump()
    del data["expedition"]["edge_ranks"], data["expedition"]["plating_ranks"]
    assert BattleState.model_validate(data) == plain
