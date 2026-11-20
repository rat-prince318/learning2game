"""Pure rules across campaign sizes, source retrieval, equipment and focus economy."""

from pathlib import Path
from types import SimpleNamespace

import pytest
from pydantic import TypeAdapter, ValidationError

from backend.material_adapter import extract_material
from backend.rpg.battle_content import active_exam
from backend.rpg.battle_models import BattleAction, BattleState
from backend.rpg.battle_rules import STARTER_ID, BattleError, advance, new_battle, view
from backend.rpg.hero_catalog import class_info, equipment
from backend.rpg.models import RPGPreferences
from backend.rpg.service import RPGService


COMMAND = TypeAdapter(BattleAction)
HANDOUT = Path(__file__).resolve().parents[1] / "public/examples/cell-notes.txt"


def campaign(count, scenes, hero_class="arcanist", kit="trail"):
    knowledge = extract_material(HANDOUT).knowledge
    service = RPGService()
    preferences = RPGPreferences(challenge_count=count, scene_count=scenes)
    previous = SimpleNamespace(weak_knowledge_ids=[k.knowledge_id for k in knowledge]) if count < 3 else None
    game = service.generate_rpg(knowledge, service.plan_rpg(knowledge, preferences, previous))
    return new_battle("campaign", "published-game", game, knowledge, hero_class=hero_class, kit=kit), game, knowledge


def command(state, game, course, name, **fields):
    action = COMMAND.validate_python(dict(event_id=f"event-{state.revision}", expected_revision=state.revision,
                                          action=name, **fields))
    return advance(state, action, game, course)


def answer(state, game, course, correct=True, skill="strike"):
    exam = active_exam(state, game, course)
    choice = next(o for o in exam.prompt.options if (o.id == exam.answer_id) == correct)
    return command(state, game, course, "answer", prompt_id=exam.prompt.prompt_id, option_id=choice.id, skill=skill)


@pytest.mark.parametrize("count,scenes", [(1, 1), (2, 1), (3, 3), (4, 2),
                                         (5, 4), (6, 3), (7, 1), (8, 4)])
@pytest.mark.parametrize("hero_class", ["arcanist", "vanguard", "ranger"])
def test_every_scope_has_beatable_boss_and_mandatory_learning_coverage(count, scenes, hero_class):
    state, game, course = campaign(count, scenes, hero_class)
    starters = set(state.inventory_ids)
    starting_weapon = state.equipped_id
    old_revision = -1
    while state.phase != "victory":
        assert old_revision < state.revision < 60
        old_revision = state.revision
        if state.phase == "stage_clear":
            for q in game.scenes[state.stage_index].challenges:
                assert state.concepts[q.knowledge_id].combat_correct > 0
            state = command(state, game, course, "equip", item_id=starting_weapon)
            state = command(state, game, course, "next_stage")
            continue
        before = state.enemy_hp
        state = answer(state, game, course)
        assert before - state.enemy_hp == state.last_event.damage_dealt > 0
    public = view(state, game, course)
    assert public.enemy.boss and public.enemy.hp == 0 and public.prompt is None
    assert state.cleared_stages == scenes
    assert set(state.earned_item_ids) == set(state.inventory_ids) - starters
    weapons = [i for i in state.earned_item_ids if equipment(i).slot == "weapon"]
    assert weapons == class_info(hero_class).weapon_ids[1:scenes + 1]
    assert len(set(state.inventory_ids)) == len(state.inventory_ids)
    assert all(t.combat_correct >= 1 for t in state.concepts.values())
    assert len(state.concepts) == count


def test_equipment_and_charged_skills_change_damage_before_the_last_exercise():
    state, game, course = campaign(6, 3)
    while state.phase == "combat":
        state = answer(state, game, course)
    assert state.focus == 2 and state.last_event.loot.id == state.equipped_id
    first_loot = state.equipped_id
    state = command(state, game, course, "next_stage")
    starter = command(state, game, course, "equip", item_id=STARTER_ID)
    normal = answer(starter, game, course)
    assert normal.phase == "combat" and normal.enemy_hp > 0
    assert answer(normal, game, course).phase == "stage_clear"
    upgraded = answer(state, game, course)
    assert upgraded.phase == "combat"
    assert upgraded.last_event.damage_dealt > normal.last_event.damage_dealt
    charged = answer(starter, game, course, skill="burst")
    assert charged.last_event.damage_dealt > upgraded.last_event.damage_dealt
    assert charged.last_event.skill == "burst" and charged.focus == 0
    for first_hit in (normal, upgraded, charged):
        final = answer(first_hit, game, course)
        assert final.phase == "stage_clear" and final.last_event.damage_dealt == first_hit.enemy_hp
    assert charged.last_event.damage_dealt > normal.last_event.damage_dealt
    missed = answer(starter, game, course, correct=False, skill="burst")
    assert missed.focus == 0 and missed.hp < starter.hp and missed.enemy_hp == starter.enemy_hp
    assert first_loot in missed.inventory_ids
    with pytest.raises(BattleError):
        answer(missed, game, course, skill="burst")


@pytest.mark.parametrize("hero_class", ["arcanist", "vanguard", "ranger"])
def test_each_class_charges_and_resolves_its_own_skill(hero_class):
    state, game, course = campaign(8, 1, hero_class)
    player = view(state, game, course).player
    assert player.stats.focus_max == player.focus_max == class_info(hero_class).focus_max
    for charge in range(player.focus_max):
        assert state.focus == charge
        with pytest.raises(BattleError, match="能量"):
            answer(state, game, course, skill="burst")
        state = answer(state, game, course)
    assert view(state, game, course).player.burst_ready
    normal = answer(state, game, course)
    burst = answer(state, game, course, skill="burst")
    assert burst.last_event.damage_dealt == normal.last_event.damage_dealt * player.stats.burst_percent // 100
    assert burst.focus == 0 and burst.last_event.hero_class == hero_class
    assert burst.last_event.critical == ((state.combo + 1) % player.stats.crit_every == 0)
    failed = answer(state, game, course, correct=False, skill="burst")
    assert failed.enemy_hp == state.enemy_hp and failed.focus == 0
    assert failed.hp < state.hp and failed.xp == 0


def test_one_stage_sidegrades_support_mixing_without_healing_or_chapter_rewards():
    state, game, course = campaign(8, 1, "ranger")
    state = answer(state, game, course, correct=False)
    armored = command(state, game, course, "equip", item_id="ward_vest")
    assert armored.hp == state.hp < view(armored, game, course).player.max_hp
    assert armored.loadout.weapon == state.equipped_id
    assert armored.loadout.accessory == "echo_charm" and armored.last_event.equipped_item.slot == "armor"
    protected = answer(armored, game, course, correct=False)
    exposed = answer(state, game, course, correct=False)
    assert 0 < protected.last_event.damage_received < exposed.last_event.damage_received
    assert protected.last_event.damage_received + protected.last_event.damage_blocked == 10
    assert protected.earned_item_ids == [] and protected.xp == 0
    restored = command(protected, game, course, "equip", item_id="trail_coat")
    assert restored.hp == protected.hp
    assert active_exam(restored, game, course).prompt == active_exam(protected, game, course).prompt

    # Same weapon and armor. Switching only the charm changes the second hit.
    fast = answer(armored, game, course)
    sturdy = command(fast, game, course, "equip", item_id="hearth_charm")
    speedy_hit = answer(fast, game, course).last_event
    sturdy_hit = answer(sturdy, game, course).last_event
    assert speedy_hit.critical and not sturdy_hit.critical
    assert speedy_hit.damage_dealt > sturdy_hit.damage_dealt


def test_missed_and_remedial_answers_cannot_earn_xp_or_duplicate_loot():
    state, game, course = campaign(5, 3, "vanguard", "ward")
    while state.phase == "combat":
        state = answer(state, game, course)
    xp = state.xp
    earned = state.earned_item_ids.copy()
    assert earned == [item.id for item in state.last_event.loot_items]
    assert state.last_event.loot.id == state.loadout.weapon
    state = command(state, game, course, "next_stage")
    for _ in range(2):
        while state.phase == "combat":
            state = answer(state, game, course, correct=False)
        assert state.phase == "sidequest"
        while state.phase == "sidequest":
            state = answer(state, game, course)
        assert state.xp == xp and state.earned_item_ids == earned
    while state.phase == "combat":
        state = answer(state, game, course)
    assert state.xp - xp == state.last_event.xp_gained
    assert state.earned_item_ids == [*earned, state.last_event.loot.id]


def test_original_weapon_save_preserves_earned_staff_when_player_used_starter():
    state, game, course = campaign(4, 3)
    while state.phase == "combat":
        state = answer(state, game, course)
    raw = state.model_dump()
    for key in ("hero_class", "kit", "loadout", "earned_item_ids"):
        del raw[key]
    raw.update(inventory_ids=["twig_focus", "amber_focus"], equipped_id="twig_focus")
    raw["last_event"]["loot"] = {k: raw["last_event"]["loot"][k] for k in ("id", "name", "tier", "attack_bonus")}
    del raw["last_event"]["loot_items"]
    restored = BattleState.model_validate(raw)
    assert restored.earned_item_ids == ["amber_focus"]
    assert restored.loadout.model_dump(exclude_none=True) == {"weapon": "twig_focus"}
    assert restored.inventory_ids == raw["inventory_ids"] and restored.concepts == state.concepts
    assert [item.id for item in restored.last_event.loot_items] == ["amber_focus"]
    next_stage = command(restored, game, course, "next_stage")
    assert next_stage.xp == restored.xp and next_stage.stage_index == 1
    assert next_stage.earned_item_ids == restored.earned_item_ids


def test_camp_retrieval_checks_only_current_losses_and_survives_restart():
    state, game, course = campaign(6, 3)
    original = state.model_dump_json()
    initial = active_exam(state, game, course)
    hinted = command(state, game, course, "hint", prompt_id=initial.prompt.prompt_id)
    assert state.model_dump_json() == original
    assert view(hinted, game, course).prompt.hint == initial.question.hint
    for _ in range(3):
        hinted = answer(hinted, game, course, correct=False)
    state = hinted
    assert state.phase == "sidequest" and state.hp == 0 and state.defeats == 1 and state.focus == 0
    stage_concepts = {q.knowledge_id for q in game.scenes[0].challenges}
    assert set(state.review_queue) == stage_concepts
    exam = active_exam(state, game, course)
    public = view(state, game, course)
    assert public.sidequest.lesson.term in [k.term for k in course]
    assert public.prompt.text != exam.question.prompt
    assert exam.answer_id not in {o.id for o in exam.question.options}
    assert all(o.id.startswith("bo_") for o in exam.prompt.options)
    assert state.camp_key not in public.model_dump_json()
    course_by_id = {k.knowledge_id: k for k in course}
    option_texts = {o.text for o in exam.prompt.options}
    for kid in stage_concepts:
        assert {course_by_id[kid].term, course_by_id[kid].definition} & option_texts
    for unused in (k for k in course if k.knowledge_id not in state.concepts):
        assert not {unused.term, unused.definition} & option_texts
    assert "correct_option_id" not in public.model_dump_json()
    assert public == view(BattleState.model_validate_json(state.model_dump_json()), game, course)
    study_hint = command(state, game, course, "hint", prompt_id=exam.prompt.prompt_id)
    t = study_hint.concepts[exam.question.knowledge_id]
    assert t.review_hints == 1 and t.hints == state.concepts[exam.question.knowledge_id].hints
    missed = answer(study_hint, game, course, correct=False)
    assert missed.review_index == 0 and missed.hp == 0 and missed.xp == 0
    state = missed
    while state.phase == "sidequest":
        state = answer(state, game, course)
    assert state.last_event.kind == "recovered" and state.sidequests_completed == 1
    assert (state.stage_index, state.cleared_stages, state.xp) == (0, 0, 0)
    assert state.hp == view(state, game, course).player.max_hp
    assert set(state.pending) == set(game.scenes[0].quest.challenge_ids)
    assert sum(t.review_correct for t in state.concepts.values()) == len(stage_concepts)


def test_one_target_can_review_with_full_material_or_legacy_options():
    state, game, course = campaign(1, 1)
    for _ in range(3):
        state = answer(state, game, course, correct=False)
    assert len(state.review_queue) == 1
    exam = active_exam(state, game, course)
    assert len(exam.prompt.options) >= 3
    assert exam.prompt.text != exam.question.prompt
    unrelated = course[0].model_copy(update={"knowledge_id": "off-syllabus",
        "term": "橡皮图章", "definition": "用于在纸页留下日期印记"})
    selective = active_exam(state, game, [unrelated, *course])
    assert selective == exam
    assert {o.text for o in exam.prompt.options} <= {
        label for k in course for label in (k.term, k.definition)
        if any(o.text in (k.term, k.definition) for o in exam.question.options)
    }
    # Older custom stores may provide only one material item or have duplicate
    # descriptions. Preserve the published problem and distinct choices there.
    lone = [k for k in course if k.knowledge_id == exam.question.knowledge_id]
    duplicate = lone[0].model_copy(update={"knowledge_id": "duplicate", "term": "同义项"})
    legacy = active_exam(state, game, [*lone, duplicate])
    assert {o.text for o in legacy.prompt.options} == {o.text for o in exam.question.options}
    assert answer(state, game, [*lone, duplicate]).phase == "combat"


def test_stale_or_forged_requests_do_not_change_state():
    state, game, course = campaign(4, 2)
    snapshot = view(state, game, course)
    with pytest.raises(ValidationError):
        COMMAND.validate_python({"event_id": "e", "expected_revision": 0, "action": "answer",
                                 "prompt_id": snapshot.prompt.prompt_id, "option_id": "x", "xp": 100})
    with pytest.raises(BattleError, match="装备"):
        command(state, game, course, "equip", item_id="dawn_focus")
    with pytest.raises(BattleError, match="选项"):
        command(state, game, course, "answer", prompt_id=snapshot.prompt.prompt_id, option_id="foreign")
    following = answer(state, game, course)
    with pytest.raises(BattleError):
        command(following, game, course, "hint", prompt_id=snapshot.prompt.prompt_id)
    with pytest.raises(BattleError, match="存档"):
        advance(following, COMMAND.validate_python({"event_id": "stale", "expected_revision": 0,
                                                    "action": "retreat"}), game, course)
    assert view(state, game, course) == snapshot
    departed = command(state, game, course, "retreat")
    assert departed.phase == "retreated" and view(departed, game, course).prompt is None
    with pytest.raises(BattleError):
        command(departed, game, course, "next_stage")
