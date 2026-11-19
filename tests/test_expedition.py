"""Route economics, character continuity and course-scoped education across expeditions."""

from pathlib import Path

import pytest
from pydantic import TypeAdapter

from backend.material_adapter import extract_material
from backend.rpg import expedition as ex
from backend.rpg.battle_content import active_exam
from backend.rpg.battle_rules import BattleError
from backend.rpg.expedition_world import expedition_catalog, region_at, relic_for
from backend.rpg.models import RPGPreferences
from backend.rpg.service import RPGService

ACTION = TypeAdapter(ex.ExpeditionAction)
SOURCE = Path(__file__).resolve().parents[1] / "public" / "examples" / "cell-notes.txt"


def bookshelf(books=2, chapters=2):
    knowledge = extract_material(SOURCE).knowledge
    service = RPGService()
    plan = service.plan_rpg(knowledge, RPGPreferences(scene_count=chapters, challenge_count=max(3, chapters)))
    game = service.generate_rpg(knowledge, plan)
    # Distinct publications may teach the very same concepts, even with the same
    # internal question IDs. The game ID gives every learning result its context.
    return {f"volume-{i}": (game, knowledge) for i in range(books)}


def command(state, courses, action, **fields):
    move = ACTION.validate_python(dict(action=action, expected_revision=state.revision,
                                      event_id=f"move-{state.revision}", **fields))
    return ex.advance(state, move, courses)


def answer(state, courses, correct=True):
    exam = active_exam(state.battle, *courses[state.battle.game_id])
    selected = next(o.id for o in exam.prompt.options if (o.id == exam.answer_id) == correct)
    skill = "strike"
    if state.phase == "combat" and correct:
        current = ex.view(state, courses)
        tactics = current.battle.tactics
        if tactics.intent.id in {"heavy", "charge", "ward"}:
            skill = "guard"
        elif current.player.burst_ready:
            skill = "burst"
    return command(state, courses, "answer", prompt_id=exam.prompt.prompt_id, option_id=selected, skill=skill)


def win_current(state, courses):
    for _ in range(100):
        if state.phase in {"reward", "victory"}:
            return state
        state = answer(state, courses)
    pytest.fail("Encounter failed to reach settlement with correct strategic answers")


def test_overland_economy_routes_and_retirement_from_an_unentered_chapter():
    courses = bookshelf()
    start = ex.new_expedition("run", courses)
    initial = ex.view(start, courses)
    assert initial.battle is None and initial.chapter_count == 4
    assert [r.risk for r in initial.routes] == ["normal", "elite"]
    assert initial.map[0].chapters[0].status == "available"
    with pytest.raises(BattleError):
        command(start, courses, "choose_route", route_id="boss_daring")
    with pytest.raises(BattleError):
        ex.report(start, courses)

    won = win_current(command(start, courses, "choose_route", route_id="normal"), courses)
    rewards = ex.view(won, courses).rewards
    cheap, expensive = [r for r in rewards if r.kind == "relic"]
    assert cheap.affordable and not expensive.affordable
    snapshot = won.model_dump_json()
    with pytest.raises(BattleError):
        command(won, courses, "choose_reward", reward_id=expensive.id)
    assert won.model_dump_json() == snapshot
    provisioned = command(won, courses, "choose_reward", reward_id=cheap.id)
    assert provisioned.coins == won.coins - cheap.cost
    assert provisioned.relic_ids == [cheap.relic.id]
    with pytest.raises(BattleError):
        command(provisioned, courses, "choose_reward", reward_id=cheap.id)
    retired = command(provisioned, courses, "retreat")
    recap = ex.report(retired, courses)
    assert recap.cleared_chapters == 1 and recap.completion_rate == .25
    assert [record.outcome for record in recap.volumes] == ["retreated", "unvisited"]
    assert recap.combat_correct > 0 and recap.volumes[0].cleared_chapters == 1
    assert all(row.first_attempt_correct is None for row in recap.volumes[1].concepts)
    assert recap.relics[0].relic.id == cheap.relic.id

    elite = win_current(command(start, courses, "choose_route", route_id="elite"), courses)
    assert elite.coins > won.coins
    assert len([r for r in ex.view(elite, courses).rewards if r.kind == "relic"]) == 3
    saved = command(elite, courses, "choose_reward", reward_id="purse")
    assert saved.coins == elite.coins + 3 and saved.relic_ids == []
    assert ex.view(ex.ExpeditionState.model_validate_json(saved.model_dump_json()), courses) == ex.view(saved, courses)


def test_book_transition_keeps_hero_and_distinguishes_repeated_curriculum_ids():
    courses = bookshelf(2, 1)
    original = ex.new_expedition("library", courses, "ranger", "ward")
    ready = command(original, courses, "choose_route", route_id="boss_steady")
    risk = command(original, courses, "choose_route", route_id="boss_daring")
    assert ready.battle.focus == 1 and risk.battle.focus == 0
    assert ready.battle.expedition.encounter_id == risk.battle.expedition.encounter_id

    state = risk
    while state.phase == "combat":
        state = answer(state, courses, correct=False)
    assert state.phase == "sidequest" and state.battle.defeats == 1
    while state.phase == "sidequest":
        state = answer(state, courses)
    state = win_current(state, courses)
    assert state.coins == 8 and len(state.completed_volumes) == 1
    loot = next(r for r in ex.view(state, courses).rewards if r.kind == "relic" and r.affordable)
    state = command(state, courses, "choose_reward", reward_id=loot.id)
    wallet, carry = state.coins, state.battle.model_copy(deep=True)
    state = command(state, courses, "choose_route", route_id="boss_daring")
    assert state.battle.xp == carry.xp and state.battle.hp == carry.hp
    assert state.battle.inventory_ids == carry.inventory_ids and state.coins == wallet
    assert state.battle.loadout == carry.loadout and state.battle.expedition.relic_ids == [loot.relic.id]
    assert all(t.combat_attempts == 0 for t in state.battle.concepts.values())
    state = win_current(state, courses)
    recap = ex.report(state, courses)
    first, second = recap.volumes
    assert first.game_id != second.game_id and first.concepts[0].knowledge_id == second.concepts[0].knowledge_id
    assert first.defeats == first.sidequests_completed == 1
    assert first.concepts[0].first_attempt_correct is False and second.concepts[0].first_attempt_correct is True
    assert recap.review_accuracy == 1 and recap.combat_accuracy < 1
    assert len(recap.bounty_seals) == recap.completed_volumes == 2
    assert all(v.reward_id for v in recap.journal[:-1]) and recap.journal[-1].reward_id is None
    with pytest.raises(BattleError):
        command(state, courses, "choose_reward", reward_id="purse")


def test_eight_volume_campaign_has_32_distinct_chapter_visits_and_endgame_growth():
    courses = bookshelf(8, 4)
    state = ex.new_expedition("atlas", courses, "vanguard", "ward")
    for ordinal in range(32):
        current = ex.view(state, courses)
        assert [c.status for r in current.map for c in r.chapters].count("available") == 1
        chosen = next(r for r in current.routes if r.approach == ("steady" if ordinal % 2 else "daring"))
        state = command(state, courses, "choose_route", route_id=chosen.id)
        state = win_current(state, courses)
        if ordinal < 31:
            offers = ex.view(state, courses).rewards
            pick = next((r for r in offers if r.kind == "rest" and state.battle.hp < 15), None)
            pick = pick or next((r for r in offers if r.kind == "relic" and r.affordable), offers[0])
            exchange = state.relic_ids[0] if pick.requires_replacement else None
            state = command(state, courses, "choose_reward", reward_id=pick.id, replace_relic_id=exchange)
    recap = ex.report(state, courses)
    assert state.phase == "victory" and recap.completion_rate == 1
    assert recap.completed_volumes == 8 and recap.chapter_count == recap.cleared_chapters == 32
    assert len({(v.game_id, v.scene_id) for v in recap.journal}) == 32
    assert [v.region_id for v in recap.volumes] == [region_at(i).id for i in range(8)]
    assert all(c.combat_correct >= 1 for v in recap.volumes for c in v.concepts)
    assert recap.player.level > 6
    assert len(recap.relics) <= recap.relic_slot_limit == 4
    assert all(r.stacks <= r.relic.max_stacks for r in recap.relics)


def test_veteran_inheritance_applies_immediately_and_starts_a_new_learning_record():
    courses = bookshelf(1, 1)
    rid = next(r.id for r in expedition_catalog().relics if r.bonuses.attack > 0)
    default = ex.new_expedition("prior", courses)
    heir = ex.new_expedition("heir", courses, veteran=True, inherited_relic_id=rid)
    normal, new = ex.view(default, courses), ex.view(heir, courses)
    assert new.veteran and new.inherited_relic_id == rid and new.player.level == 1
    assert new.player.attack == normal.player.attack + relic_for(rid).bonuses.attack
    assert new.coins == new.player.xp == 0 and not new.journal
    assert new.battle is None and new.relics[0].stacks == 1
    fresh = command(heir, courses, "choose_route", route_id="boss_daring")
    assert ex.view(fresh, courses).battle.tactics.veteran
    assert fresh.battle.expedition.relic_ids == [rid]
    final = ex.report(win_current(fresh, courses), courses)
    assert final.veteran and final.inherited_relic_id == rid
    assert final.outcome == "victory" and len(final.bounty_seals) == 1
    with pytest.raises(BattleError):
        ex.new_expedition("bad", courses, inherited_relic_id=rid)


def test_full_relic_loadout_requires_a_valid_trade_and_discards_the_whole_stack():
    courses = bookshelf()
    start = ex.new_expedition("trader", courses)
    camp = win_current(command(start, courses, "choose_route", route_id="normal"), courses)
    camp.coins = 16
    camp.relic_ids = ["epicycle", "epicycle", "brine_lens", "kiln_glove", "ferryman_knot"]
    camp.battle.expedition.relic_ids = list(camp.relic_ids)
    before = ex.view(camp, courses)
    assert len(before.relics) == before.relic_slot_limit == 4
    fresh = next(r for r in before.rewards if r.kind == "relic" and r.requires_replacement)
    repeat = next(r for r in before.rewards if r.kind == "relic" and not r.requires_replacement)
    stored = camp.model_dump_json()
    for reward_id, replace in [(fresh.id, None), (fresh.id, "unknown"), (repeat.id, "epicycle"), ("purse", "epicycle")]:
        with pytest.raises(BattleError):
            command(camp, courses, "choose_reward", reward_id=reward_id, replace_relic_id=replace)
        assert camp.model_dump_json() == stored
    stacked = command(camp, courses, "choose_reward", reward_id=repeat.id)
    assert len(set(stacked.relic_ids)) == 4 and stacked.relic_ids.count(repeat.relic.id) == 2

    traded = command(camp, courses, "choose_reward", reward_id=fresh.id, replace_relic_id="epicycle")
    assert "epicycle" not in traded.relic_ids and traded.relic_ids.count(fresh.relic.id) == 1
    assert traded.journal[-1].replaced_relic_id == "epicycle" and traded.journal[-1].replaced_stacks == 2
    assert len(set(traded.relic_ids)) == 4 and traded.coins == camp.coins - fresh.cost
    assert ex.view(traded, courses).player.attack == before.player.attack - 2 * relic_for("epicycle").bonuses.attack
    next_fight = command(traded, courses, "choose_route", route_id="boss_steady")
    assert next_fight.battle.expedition.relic_ids == traded.relic_ids


def test_smith_spends_a_camp_turn_and_carries_a_bounded_build_across_books():
    courses = bookshelf(2, 1)
    state = ex.new_expedition("smith", courses)
    boss = command(state, courses, "choose_route", route_id="boss_daring")
    camp = win_current(boss, courses)
    assert camp.coins == 8
    panel = ex.view(camp, courses)
    options = [r for r in panel.rewards if r.kind == "forge"]
    assert {r.id for r in options} == {"forge_edge", "forge_plating"}
    assert all(r.cost == 7 and r.affordable for r in options)
    baseline = panel.player.stats

    for selected in ("forge_edge", "forge_plating"):
        forged = command(camp, courses, "choose_reward", reward_id=selected)
        assert forged.phase == "route" and forged.coins == 1
        after = ex.view(forged, courses)
        assert after.edge_ranks + after.plating_ranks == 1 and after.forge_rank_limit == 8
        expected = baseline.model_copy()
        if selected == "forge_edge":
            expected.attack += 2
        else:
            expected.defense += 2
        assert after.player.stats == expected
        after_load = ex.ExpeditionState.model_validate_json(forged.model_dump_json())
        next_boss = command(after_load, courses, "choose_route", route_id="boss_daring")
        assert ex.view(next_boss, courses).player.stats == expected
        recapped = ex.report(command(next_boss, courses, "retreat"), courses)
        assert recapped.edge_ranks + recapped.plating_ranks == 1
        assert recapped.journal[-1].reward_id == selected
        # New Game Plus inherits a relic selection only.
        encore = ex.new_expedition("encore", courses, veteran=True)
        assert encore.edge_ranks == encore.plating_ranks == 0

    camp.edge_ranks, camp.plating_ranks = 4, 3
    camp.battle.expedition.edge_ranks, camp.battle.expedition.plating_ranks = 4, 3
    camp.coins = 34
    seventh = next(r for r in ex.view(camp, courses).rewards if r.id == "forge_edge")
    assert seventh.cost == 35 and not seventh.affordable
    unchanged = camp.model_dump_json()
    with pytest.raises(BattleError):
        command(camp, courses, "choose_reward", reward_id="forge_edge")
    assert camp.model_dump_json() == unchanged
    camp.coins = 35
    maxed = command(camp, courses, "choose_reward", reward_id="forge_edge")
    assert maxed.coins == 0 and maxed.edge_ranks + maxed.plating_ranks == 8
    camp.edge_ranks = 5
    assert all(r.kind != "forge" for r in ex.view(camp, courses).rewards)
    with pytest.raises(BattleError):
        command(camp, courses, "choose_reward", reward_id="forge_plating")
