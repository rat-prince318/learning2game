"""Recombine the owner's validated questions into repeatable tower encounters."""

from . import battle_rules, companions, expedition_world as world
from .expedition_combat import tower_chain, tower_health
from .battle_content import question_mode
from .battle_models import Equip, ExpeditionAnswer, Hint
from .expedition_models import TowerView


def floor_course(course, floor):
    game, knowledge = course
    roster = [q for scene in game.scenes for q in scene.challenges]
    width = min(len(roster), min(4, floor + 1))
    start = (floor - 1) % len(roster)
    selected = [roster[(start + i) % len(roster)] for i in range(width)]
    scene = game.scenes[(floor - 1) % len(game.scenes)]
    quest = scene.quest.model_copy(update={"challenge_ids": [q.challenge_id for q in selected]})
    scene = scene.model_copy(update={"quest": quest, "challenges": selected})
    return game.model_copy(update={"scenes": [scene]}), knowledge


def projection(state, courses):
    tower = state.tower
    if tower.battle is None:
        return TowerView()
    course = floor_course(courses[tower.battle.game_id], tower.floor)
    return TowerView(floor=tower.floor, best_floor=tower.best_floor, phase=tower.phase,
                     region_id=world.region_at((tower.floor - 1) % 8).id,
                     difficulty=tower.floor, next_guardian_hp=tower_health(tower.best_floor + 1),
                     chain_target=tower_chain(tower.floor), question_mode=question_mode(tower.floor, len(course[0].scenes[0].challenges)),
                     battle=battle_rules.view(tower.battle, *course))


def enter(state, courses):
    tower = state.tower
    if tower.phase in {"combat", "sidequest"}:
        raise battle_rules.BattleError(409, "进入当前试炼后可继续上次的回合。")
    floor = tower.best_floor + 1
    game_id = state.game_ids[(floor - 1) % len(state.game_ids)]
    course = floor_course(courses[game_id], floor)
    previous = tower.battle or state.battle
    fight = battle_rules.new_battle(f"{state.session_id}:tower:{floor}", game_id, *course,
                                    hero_class=state.hero_class, kit=state.kit)
    # Entry gear is copied once. Tower XP and drops develop their own build, so
    # re-entering or clearing a floor can never farm the campaign's rewards.
    fight.xp = previous.xp
    fight.inventory_ids = list(previous.inventory_ids)
    fight.earned_item_ids = list(previous.earned_item_ids)
    fight.loadout = previous.loadout.model_copy()
    fight.equipped_id = previous.equipped_id
    index = (floor - 1) % 8
    region = world.region_at(index)
    encounter = region.boss_id
    tower.battle = battle_rules.begin_encounter(fight, course[0], encounter, state.relic_ids,
                                               region_index=index, tower_floor=floor,
                                               companion_id=state.active_companion,
                                               companion_level=companions.level(state.bonds[state.active_companion]) if state.active_companion else 0,
                                               edge_ranks=state.edge_ranks, plating_ranks=state.plating_ranks)
    tower.battle.hp = battle_rules.player_stats(tower.battle).max_hp
    tower.floor, tower.phase = floor, "combat"


def advance(state, action, courses):
    tower = state.tower
    if action.action == "tower_enter":
        enter(state, courses)
        return
    if tower.phase not in {"combat", "sidequest"}:
        raise battle_rules.BattleError(409, "登上当前塔层后可以行动。")
    variants = {"tower_answer": ExpeditionAnswer, "tower_hint": Hint, "tower_equip": Equip}
    payload = action.model_dump()
    payload.update(action=action.action.removeprefix("tower_"), expected_revision=tower.battle.revision)
    inner = variants[action.action].model_validate(payload)
    course = floor_course(courses[tower.battle.game_id], tower.floor)
    fight = battle_rules.advance(tower.battle, inner, *course)
    tower.battle = fight
    if fight.phase == "victory":
        tower.best_floor, tower.phase = tower.floor, "cleared"
        companions.bond_on_win(state, fight)
    else:
        tower.phase = fight.phase
