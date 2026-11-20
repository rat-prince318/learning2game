"""Exercise tower learning pressure, class balance, fellowship and saved receipts."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.db import connection
from backend.material_adapter import extract_material
from backend.rpg import battle_rules, expedition, tower
from backend.rpg.battle_content import active_exam
from backend.rpg.battle_rules import BattleError
from backend.rpg.expedition_models import ExpeditionState
from backend.rpg.models import RPGPreferences
from backend.rpg.service import RPGService
from test_expedition import answer, command, win_current
from test_expedition_http import app, opening, payload, publish, upload


@pytest.fixture(scope="module")
def books():
    root = Path(__file__).resolve().parents[1]
    knowledge = extract_material(root / "public/examples/cell-notes.txt").knowledge
    writer = RPGService()
    plan = writer.plan_rpg(knowledge, RPGPreferences(scene_count=2, challenge_count=6))
    return {"book": (writer.generate_rpg(knowledge, plan), knowledge)}


def pick(state, books, *, correct=True, skill=None):
    t = state.tower
    course = tower.current_course(t, books)
    exam = active_exam(t.battle, *course)
    selected = next(o for o in exam.prompt.options if (o.id == exam.answer_id) == correct)
    if not skill:
        view = tower.projection(state, books).battle
        skill = "strike"
        if view.phase == "combat":
            if view.tactics.intent.id in {"heavy", "charge"}:
                skill = "guard"
            elif view.player.burst_ready:
                skill = "burst"
    return command(state, books, "tower_answer", prompt_id=exam.prompt.prompt_id,
                   option_id=selected.id, skill=skill)


@pytest.mark.parametrize("hero", ["vanguard", "ranger", "arcanist"])
def test_every_class_can_clear_twelve_floors_with_correct_tactics(books, hero):
    state = expedition.new_expedition("trial", books, hero)
    state = command(state, books, "recruit_companion", companion_id="reed")
    campaign_hero = state.battle.model_dump()
    last_hp, turns_by_floor = 0, []
    for floor in range(1, 13):
        state = command(state, books, "tower_enter")
        gate = tower.projection(state, books)
        assert gate.battle.enemy.max_hp > last_hp
        last_hp = gate.battle.enemy.max_hp
        assert gate.floor == floor and gate.chain_target == 1 + (floor - 1) // 3
        course = tower.current_course(state.tower, books)
        exam = active_exam(state.tower.battle, *course)
        if floor == 1:
            assert len(exam.prompt.options) == 3
        if floor in {4, 7}:
            width = 2 if floor == 4 else 3
            assert len(exam.supporting) == width and len({o.text for o in exam.prompt.options}) == 4
            for clue in exam.supporting:
                assert clue.prompt in exam.prompt.text
                assert [clue.knowledge_id] in exam.missed_by_choice.values()
        groups = set()
        for turn in range(1, 80):
            prompt = active_exam(state.tower.battle, *course)
            evidence = frozenset(q.challenge_id for q in prompt.supporting)
            assert evidence not in groups, (floor, turn, evidence)
            groups.add(evidence)
            state = pick(state, books)
            assert state.tower.phase != "sidequest", (hero, floor, turn)
            if state.tower.phase == "cleared":
                break
        assert state.tower.best_floor == floor
        turns_by_floor.append(turn)
    assert state.phase == "route" and state.battle.model_dump() == campaign_hero
    assert state.bonds == {"reed": 12}
    assert all(slot.available for slot in expedition.view(state, books).companions)
    print(f"{hero} turns across floors 1–12: {turns_by_floor}")


def test_tower_failure_returns_to_same_floor_after_source_review(books):
    state = command(expedition.new_expedition("camp", books), books, "tower_enter")
    for _ in range(40):
        state = pick(state, books, correct=False)
        if state.tower.phase == "sidequest":
            break
    assert state.tower.phase == "sidequest" and state.tower.best_floor == 0
    saved = ExpeditionState.model_validate_json(state.model_dump_json())
    battle = tower.projection(saved, books).battle
    assert battle.sidequest.lesson.source_ref and battle.sidequest.lesson.definition
    while saved.tower.phase == "sidequest":
        saved = pick(saved, books)
    assert saved.tower.floor == 1
    view = tower.projection(saved, books).battle
    assert view.player.hp == view.player.max_hp and view.enemy.hp == view.enemy.max_hp


def test_interleaved_volumes_exhaust_each_book_before_revisiting_it(books):
    courses = {"first": books["book"], "second": books["book"]}
    state = expedition.new_expedition("alternating-books", courses)
    seen = {game_id: [] for game_id in courses}
    for _ in range(4):
        state = command(state, courses, "tower_enter")
        fight = state.tower.battle
        seen[fight.game_id].extend(fight.expedition.tower_questions)
        while state.tower.phase == "combat":
            state = pick(state, courses)
        assert state.tower.phase == "cleared"
    roster = [q.challenge_id for scene in books["book"][0].scenes for q in scene.challenges]
    assert seen["first"] == roster
    assert seen["second"] == roster + roster[:1]


def test_duplicate_publications_and_short_books_have_reachable_streaks(books):
    game, knowledge = books["book"]
    scene = game.scenes[0].model_copy(deep=True)
    first, duplicate, other = scene.challenges
    duplicate.prompt = first.prompt
    duplicate.options = [option.model_copy(update={"id": "copy_" + option.id}) for option in reversed(first.options)]
    duplicate.correct_option_id = "copy_" + first.correct_option_id
    course = game.model_copy(update={"scenes": [scene]}), knowledge
    books = {"short": course}
    state = expedition.new_expedition("short-book", books)
    state.tower.best_floor = 15
    state.battle.xp = 2200
    state = command(state, books, "tower_enter")
    gate = tower.projection(state, books)
    assert gate.chain_target == 2 and gate.question_mode == "recall"
    assert set(state.tower.battle.expedition.tower_questions) == {first.challenge_id, other.challenge_id}
    state = pick(state, books)
    restored = ExpeditionState.model_validate_json(state.model_dump_json())
    assert tower.projection(state, books) == tower.projection(restored, books)
    assert pick(restored, books).tower.phase == "cleared"

    legacy = restored.model_copy(deep=True)
    legacy.tower.battle.expedition.tower_questions = []
    assert tower.projection(legacy, books).chain_target == 2


def test_legacy_floor_keeps_issued_prompt_and_option_bindings(books):
    state = expedition.new_expedition("pre-draw-save", books)
    course = tower.floor_course(books["book"], 4)
    fight = battle_rules.new_battle("pre-draw-save:tower:4", "book", *course)
    state.tower.floor, state.tower.best_floor, state.tower.phase = 4, 3, "combat"
    state.tower.battle = battle_rules.begin_encounter(
        fight, course[0], "willow_lock", [], region_index=0, tower_floor=4,
    )
    issued = active_exam(state.tower.battle, *course)
    data = state.model_dump()
    del data["tower"]["last_draw_by_game"]
    del data["tower"]["battle"]["expedition"]["tower_questions"]
    restored = ExpeditionState.model_validate(data)
    assert tower.projection(restored, books).battle.prompt == issued.prompt
    answered = command(restored, books, "tower_answer", prompt_id=issued.prompt.prompt_id,
                       option_id=issued.answer_id, skill="strike")
    assert answered.tower.battle.last_event.correct


@pytest.mark.parametrize("hero", ["vanguard", "ranger", "arcanist"])
def test_mixed_accuracy_costs_health_and_allows_recovery(books, hero):
    results = []
    for rhythm in ((True,), (True, False, True, True), (True, False), (False,)):
        start = expedition.new_expedition("profile", books, hero)
        start.tower.best_floor = 3  # Four primary questions, a two-answer streak and a real missed turn.
        state = command(start, books, "tower_enter")
        for i in range(40):
            state = pick(state, books, correct=rhythm[i % len(rhythm)])
            if state.tower.phase != "combat":
                break
        results.append((state.tower.phase, state.tower.battle.hp))
    assert [phase for phase, hp in results] == ["cleared", "cleared", "sidequest", "sidequest"]
    assert results[0][1] > results[1][1] > 0


def test_defensive_and_focus_assists_match_authoritative_gauges(books):
    start = expedition.new_expedition("companions", books)
    start.bonds = {"reed": 2, "lumen": 5}
    for ident, effect in [("reed","guard"), ("lumen","focus")]:
        state = command(start, books, "assign_companion", companion_id=ident)
        state = command(state, books, "tower_enter")
        # Isolate a live counter / a third correct guard from personal crits and gear.
        if ident == "reed":
            state.tower.battle.expedition.pattern_index = 1
        else:
            state.tower.battle.combo = 2
        solo = state.model_copy(deep=True)
        solo.tower.battle.expedition.companion_id = None
        skill = "guard" if ident == "lumen" else "strike"
        assisted = pick(state, books, skill=skill).tower.battle
        ordinary = pick(solo, books, skill=skill).tower.battle
        receipt = assisted.last_event.partner_assist
        assert receipt.companion_id == ident and receipt.effect == effect
        delta = assisted.hp - ordinary.hp if ident == "reed" else assisted.focus - ordinary.focus
        assert delta == receipt.amount > 0


def test_landmark_and_bond_are_scoped_to_the_actual_fight(books):
    state = expedition.new_expedition("boat", books)
    state.battle.hp -= 7
    wounded = state.battle.hp
    for _ in range(2):
        state = command(state, books, "inspect_landmark")
        assert state.battle.hp == wounded + 3
    healthy = expedition.new_expedition("full", books)
    assert command(healthy, books, "inspect_landmark").battle.hp == healthy.battle.hp
    assert state.field_signals == ["willow_ferry"]
    with pytest.raises(BattleError):
        command(state, books, "recruit_companion", companion_id="flint")
    state = command(state, books, "recruit_companion", companion_id="reed")
    state = command(state, books, "tower_enter")
    while state.tower.phase == "combat":
        state = pick(state, books)
    state = command(state, books, "recruit_companion", companion_id="flint")
    state = command(state, books, "assign_companion", companion_id="flint")
    entered = command(state, books, "choose_route", route_id=expedition.view(state, books).routes[0].id)
    with pytest.raises(BattleError):
        command(entered, books, "inspect_landmark")
    updated = command(entered, books, "assign_companion", companion_id="reed")
    solo = updated.model_copy(deep=True)
    solo.battle.expedition.companion_id = None
    updated, solo = answer(updated, books), answer(solo, books)
    assist = updated.battle.last_event.partner_assist
    assert assist and assist.companion_id == "flint"
    assert updated.battle.last_event.damage_dealt == solo.battle.last_event.damage_dealt + assist.amount
    won = win_current(updated, books)
    assert won.bonds == {"reed": 1, "flint": 1}


def test_api_restores_and_replays_a_committed_tower_turn_once(app, books):
    with TestClient(app) as c:
        material = upload(c, "cell.txt", (Path(__file__).resolve().parents[1] / "public/examples/cell-notes.txt").read_bytes())
        gid = publish(c, {"material_id": material["material_id"], "preferences":{"scene_count":2,"challenge_count":6}})
        start = opening(c,[gid])
        path = "/rpg/expeditions/" + start["session_id"]
        enter = payload(start, "tower_enter")
        gate = c.post(path+"/actions", json=enter).json()
        assert gate["phase"] == "route" and gate["tower"]["phase"] == "combat"
        assert gate == c.post(path+"/actions", json=enter).json()
        prompt = gate["tower"]["battle"]["prompt"]
        action = payload(gate, "tower_answer", option_id=prompt["options"][0]["id"], prompt_id=prompt["prompt_id"])
        turn = c.post(path+"/actions", json=action)
        assert turn.status_code == 200, turn.text
        assert c.post(path+"/actions", json=action).json() == c.get(path).json() == turn.json()
        assert c.post(path+"/actions",json={**action,"event_id":"stale"}).status_code == 409
        with connection(app) as db:
            assert db.execute("SELECT count(*) FROM expedition_events WHERE run_id=?", (start["session_id"],)).fetchone()[0] == 2
