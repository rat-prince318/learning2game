"""Pure rules for turn-based study battles. SQLite and HTTP stay in the router."""

from secrets import token_hex

from ..models import KnowledgeItem
from .battle_content import Exam, active_exam
from .battle_models import (
    BattleAction, BattleEvent, BattleState, BattleTally, BattleView, EnemyView,
    Equip, Hint, NextStage, PlayerView, Retreat, SideQuestView, StageView,
)
from .hero_catalog import (
    ClassId, Gear, KitId, class_info, equipment as catalog_equipment, initial_loadout, level_for_xp,
    stage_rewards, starter_inventory, stats_for, xp_to_next_level,
)
from .models import RPGGameInternal

# Compatibility exports for clients of the original single-class rules.
STARTER_ID = initial_loadout("arcanist").weapon
FOCUS_MAX = class_info("arcanist").focus_max
_ENEMIES = [("芽团守灵", "sprout"), ("雾翼飞蛾", "moth"), ("青岩巨像", "golem")]
_BOSS = ("蚀月守卫", "warden")


class BattleError(ValueError):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def equipment(item_id: str) -> Gear:
    try:
        return catalog_equipment(item_id)
    except ValueError as error:
        raise BattleError(422, str(error)) from None


def _stats(state):
    return stats_for(state.hero_class, state.xp, state.loadout)


def _is_boss(game, index):
    return index == len(game.scenes) - 1


def _unit_health(game, index):
    return (23, 28, 34, 40)[index] + (3 if _is_boss(game, index) else 0)


def _enemy_health(game, index):
    return _unit_health(game, index) * len(game.scenes[index].challenges)


def _set_fight(state, game):
    scene = game.scenes[state.stage_index]
    state.phase = "combat"
    state.pending = list(scene.quest.challenge_ids)
    state.enemy_hp = _enemy_health(game, state.stage_index)
    state.hp = _stats(state).max_hp
    state.missed_this_fight = []
    state.review_queue = []
    state.review_index = 0
    state.finishing_turn = 0
    state.combo = 0
    state.hinted = False


def new_battle(session_id: str, game_id: str, game: RPGGameInternal,
               knowledge: list[KnowledgeItem], *, hero_class: ClassId = "arcanist",
               kit: KitId = "trail", camp_key: str | None = None) -> BattleState:
    loadout = initial_loadout(hero_class, kit)
    inventory = starter_inventory(hero_class, kit)
    if len(game.scenes) == 1:
        # Short review campaigns start directly at the boss. Offer both outfits
        # now so the player has the same tactical choice as a campaign veteran.
        alternate = starter_inventory(hero_class, "ward" if kit == "trail" else "trail")
        inventory.extend(item for item in alternate if item not in inventory)
    return BattleState(
        session_id=session_id, game_id=game_id, camp_key=camp_key or token_hex(24),
        hp=stats_for(hero_class, 0, loadout).max_hp, enemy_hp=_enemy_health(game, 0),
        hero_class=hero_class, kit=kit, inventory_ids=inventory, equipped_id=loadout.weapon,
        loadout=loadout, pending=list(game.scenes[0].quest.challenge_ids),
        concepts={q.knowledge_id: BattleTally() for scene in game.scenes for q in scene.challenges},
    )


def view(state: BattleState, game: RPGGameInternal, knowledge: list[KnowledgeItem]) -> BattleView:
    scene = game.scenes[state.stage_index]
    boss = _is_boss(game, state.stage_index)
    name, sprite = _BOSS if boss else _ENEMIES[state.stage_index]
    maximum = _enemy_health(game, state.stage_index)
    stats = _stats(state)
    exam = active_exam(state, game, knowledge)
    sidequest = None
    if state.phase == "sidequest":
        sidequest = SideQuestView(title=f"营地修习：{scene.name}"[:120],
                                  completed=state.review_index, total=len(state.review_queue),
                                  lesson=exam.lesson)
    return BattleView(
        session_id=state.session_id, game_id=state.game_id, title=game.title, phase=state.phase,
        revision=state.revision, cleared_stages=state.cleared_stages, defeats=state.defeats,
        sidequests_completed=state.sidequests_completed, last_event=state.last_event,
        stage=StageView(index=state.stage_index, number=state.stage_index + 1, total=len(game.scenes),
                        scene_id=scene.scene_id, name=scene.name, objective=scene.quest.objective, boss=boss),
        enemy=EnemyView(name=name, sprite=sprite, hp=state.enemy_hp, max_hp=maximum, boss=boss,
                        enraged=boss and 0 < state.enemy_hp <= maximum // 2),
        player=PlayerView(hp=state.hp, max_hp=stats.max_hp, level=level_for_xp(state.xp),
                          xp=state.xp, xp_to_next_level=xp_to_next_level(state.xp), attack=stats.attack,
                          hero_class=state.hero_class, kit=state.kit, stats=stats, loadout=state.loadout,
                          combo=state.combo, equipped_id=state.equipped_id,
                          focus=state.focus, focus_max=stats.focus_max, burst_ready=state.focus == stats.focus_max,
                          inventory=[equipment(gid) for gid in state.inventory_ids]),
        prompt=exam.prompt if exam else None, sidequest=sidequest,
    )


def _win(state, game, feedback):
    boss = _is_boss(game, state.stage_index)
    level_before = level_for_xp(state.xp)
    feedback.xp_gained = 35 + 10 * state.stage_index + (15 if boss else 0)
    state.xp += feedback.xp_gained
    feedback.levels_gained = level_for_xp(state.xp) - level_before
    state.cleared_stages += 1
    rewards = stage_rewards(state.hero_class, state.cleared_stages, state.kit)
    acquired = [item for item in rewards if item.id not in state.inventory_ids]
    state.inventory_ids.extend(item.id for item in acquired)
    state.earned_item_ids.extend(item.id for item in acquired)
    weapon = rewards[0]
    state.equipped_id = state.loadout.weapon = weapon.id
    feedback.loot = weapon
    feedback.loot_items = acquired
    state.phase = "victory" if boss else "stage_clear"
    feedback.kind = state.phase
    # The recovery after a fight is visible even for a newly levelled hero.
    state.hp = _stats(state).max_hp
    feedback.message = ("蚀月守卫让开了道路，你点亮了最后一站。" if boss
                        else "守关精灵让开了道路，下一站已经开放。")


def _combat_answer(state, game, exam, action, correct):
    q = exam.question
    tally = state.concepts[q.knowledge_id]
    stats = _stats(state)
    if action.skill == "burst":
        if state.focus < stats.focus_max:
            raise BattleError(409, f"蓄满 {stats.focus_max} 格能量即可释放职业战技。")
        state.focus = 0
    if tally.combat_attempts == 0:
        tally.first_attempt_correct = correct
    tally.combat_attempts += 1
    if not correct:
        state.combo = 0
        enraged = (_is_boss(game, state.stage_index) and
                   state.enemy_hp <= _enemy_health(game, state.stage_index) // 2)
        raw_damage = 10 + 3 * state.stage_index + (3 if enraged else 0)
        # Diminishing returns keep heavy armor useful without making repeated
        # mistakes harmless. Round up so every counter deals at least one HP.
        divisor = 10 + stats.defense
        mitigated_damage = (raw_damage * 10 + divisor - 1) // divisor
        blocked = raw_damage - mitigated_damage
        damage = min(state.hp, mitigated_damage)
        state.hp -= damage
        if q.knowledge_id not in state.missed_this_fight:
            state.missed_this_fight.append(q.knowledge_id)
        if state.pending:
            state.pending.append(state.pending.pop(0))
        else:
            state.finishing_turn += 1
        feedback = BattleEvent(kind="miss", message="判断偏离了线索，敌人发动反击。",
                               correct=False, damage_received=damage, damage_blocked=blocked, skill=action.skill)
        if state.hp == 0:
            state.phase = "sidequest"
            state.defeats += 1
            state.focus = 0
            state.review_queue = list(state.missed_this_fight)
            state.review_index = 0
            feedback.kind = "defeat"
            feedback.message = "你退回营地。修复本章失手的记录，即可整队再战。"
        return feedback
    tally.combat_correct += 1
    state.combo += 1
    if action.skill == "strike":
        state.focus = min(stats.focus_max, state.focus + 1)
    critical = state.combo % stats.crit_every == 0 and not state.hinted
    power = stats.attack + min(state.combo - 1, 3)
    if critical:
        power = power * 3 // 2
    if action.skill == "burst":
        power = power * stats.burst_percent // 100
    if state.pending:
        state.pending.pop(0)
    else:
        state.finishing_turn += 1
    # A powerful weapon speeds up a fight. Remaining chapter checks retain a
    # portion of the foe's HP so that every assigned concept is actually tested.
    reserve = len(state.pending) * (_unit_health(game, state.stage_index) // 2)
    damage = min(power, state.enemy_hp - reserve)
    state.enemy_hp -= damage
    feedback = BattleEvent(kind="hit", message=(f"{class_info(state.hero_class).burst_name}命中！"
                                                if action.skill == "burst"
                                                else "连击命中要害！" if critical else "攻击命中了敌人。"),
                           correct=True, damage_dealt=damage, critical=critical, skill=action.skill,
                           explanation=q.explanation, source_ref=q.source_ref)
    if state.enemy_hp == 0:
        _win(state, game, feedback)
    return feedback


def _review_answer(state, game, exam, action, correct):
    if action.skill != "strike":
        raise BattleError(409, "职业战技可在战斗回合释放。")
    tally = state.concepts[exam.question.knowledge_id]
    tally.review_attempts += 1
    if not correct:
        return BattleEvent(kind="review_wrong", correct=False, message="翻回营地摘记，再核对这张档案卡。",
                           explanation=exam.lesson.definition, source_ref=exam.lesson.source_ref)
    tally.review_correct += 1
    state.review_index += 1
    feedback = BattleEvent(kind="review_correct", correct=True, message="档案修复成功，继续下一条营地记录。",
                           explanation=exam.lesson.definition, source_ref=exam.lesson.source_ref)
    if state.review_index == len(state.review_queue):
        state.sidequests_completed += 1
        _set_fight(state, game)
        feedback.kind = "recovered"
        feedback.message = "营地修习完成，体力已恢复。重新挑战本章守关者！"
    return feedback


def advance(state: BattleState, action: BattleAction, game: RPGGameInternal,
            knowledge: list[KnowledgeItem]) -> BattleState:
    if action.expected_revision != state.revision:
        raise BattleError(409, "回合进度已更新，请读取存档后继续。")
    if state.phase in {"victory", "retreated"}:
        raise BattleError(409, "本次冒险已经结束，可查看战报或开始新一轮。")
    result = state.model_copy(deep=True)
    if isinstance(action, Retreat):
        result.phase = "retreated"
        feedback = BattleEvent(kind="retreat", message="已结束本次冒险，旅途记录已整理。")
    elif isinstance(action, Equip):
        if action.item_id not in result.inventory_ids:
            raise BattleError(422, "请从已获得的装备中选择。")
        item = equipment(action.item_id)
        if item.class_id not in (None, result.hero_class):
            raise BattleError(422, "请选择本职业可以使用的装备。")
        setattr(result.loadout, item.slot, item.id)
        result.equipped_id = result.loadout.weapon
        result.hp = min(result.hp, _stats(result).max_hp)
        feedback = BattleEvent(kind="equip", message=f"已装备{item.name}。", equipped_item=item)
    elif isinstance(action, NextStage):
        if result.phase != "stage_clear":
            raise BattleError(409, "击败当前守关者后即可前往下一站。")
        result.stage_index += 1
        _set_fight(result, game)
        result.prompt_serial += 1
        feedback = BattleEvent(kind="next_stage", message="踏入下一站，新的守关者现身。")
    else:
        exam: Exam | None = active_exam(result, game, knowledge)
        if exam is None or exam.prompt.prompt_id != action.prompt_id:
            raise BattleError(409, "请查看当前回合的题目后再行动。")
        if isinstance(action, Hint):
            if result.hinted:
                raise BattleError(409, "本回合的提示已展开。")
            result.hinted = True
            tally = result.concepts[exam.question.knowledge_id]
            if result.phase == "sidequest":
                tally.review_hints += 1
            else:
                tally.hints += 1
            feedback = BattleEvent(kind="hint", message=exam.help_text)
        else:
            if action.option_id not in {o.id for o in exam.prompt.options}:
                raise BattleError(422, "请选择当前题目提供的选项。")
            correct = action.option_id == exam.answer_id
            if result.phase == "sidequest":
                feedback = _review_answer(result, game, exam, action, correct)
            else:
                feedback = _combat_answer(result, game, exam, action, correct)
            result.hinted = False
            result.prompt_serial += 1
    feedback.hero_class = result.hero_class
    result.last_event = feedback
    result.revision += 1
    return result
