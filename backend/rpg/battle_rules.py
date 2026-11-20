"""Pure rules for turn-based study battles. SQLite and HTTP stay in the router."""

from secrets import token_hex

from ..models import KnowledgeItem
from . import expedition_combat as tactics
from . import expedition_world as world
from .battle_content import Exam, active_exam, encounter_scene, round_kind
from .companions import PartnerAssist
from .battle_models import (
    BattleAction, BattleEvent, BattleState, BattleTally, BattleView, EnemyView, ExpeditionAnswer,
    Equip, Hint, NextStage, PlayerView, Retreat, RoundProgress, SideQuestView, StageView,
)
from .hero_catalog import (
    ClassId, Gear, KitId, class_info, equipment as catalog_equipment, initial_loadout, level_for_xp,
    stage_rewards, starter_inventory, stats_for, xp_to_next_level,
)
from .models import RPGGameInternal
from .validation import challenge_key

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


def player_stats(state: BattleState, *, relic_ids=None, edge_ranks=None, plating_ranks=None):
    ctx = state.expedition
    if ctx is None and relic_ids is None and edge_ranks is None and plating_ranks is None:
        return stats_for(state.hero_class, state.xp, state.loadout)
    if ctx is not None:
        relic_ids = ctx.relic_ids if relic_ids is None else relic_ids
        edge_ranks = ctx.edge_ranks if edge_ranks is None else edge_ranks
        plating_ranks = ctx.plating_ranks if plating_ranks is None else plating_ranks
    return tactics.effective_stats(state, relic_ids or [], edge_ranks or 0, plating_ranks or 0)


def _is_boss(game, index):
    return index == len(game.scenes) - 1


def _unit_health(state, game):
    index = state.stage_index
    if state.expedition is not None:
        return tactics.unit_health(state.expedition, index)
    return (23, 28, 34, 40)[index] + (3 if _is_boss(game, index) else 0)


def _enemy_health(state, game):
    if state.expedition and state.expedition.tower_floor:
        return tactics.tower_health(state.expedition.tower_floor)
    scene = encounter_scene(state, game)
    size = len(chapter_deck(scene)) if state.encounter_drills is not None else len(scene.challenges)
    return _unit_health(state, game) * size


def chapter_deck(scene):
    questions = {q.challenge_id: q for q in scene.challenges}
    cards = {}
    for ident in scene.quest.challenge_ids:
        cards.setdefault(challenge_key(questions[ident]), ident)
    return list(cards.values())


def _retries(state, scene):
    if state.retry_ids is not None:
        return state.retry_ids
    # Older saves only tracked the underlying missed concepts.
    return [q.challenge_id for q in scene.challenges if q.knowledge_id in state.missed_this_fight]


def _legacy_solved(state, scene):
    if state.retry_ids is not None:
        return set()
    # Old camps rebuilt the whole deck, even though the per-concept tallies
    # survived. Respect the displayed card until its answer is submitted.
    return {challenge_key(q) for q in scene.challenges if state.concepts[q.knowledge_id].combat_correct}


def _set_fight(state, game, *, recover=True, resume=False):
    scene = encounter_scene(state, game)
    state.phase = "combat"
    if resume:
        mastered = _legacy_solved(state, scene)
        if mastered:
            questions = {q.challenge_id: q for q in scene.challenges}
            state.pending = [card for card in state.pending if challenge_key(questions[card]) not in mastered]
        state.retry_ids = _retries(state, scene)
    else:
        state.pending = chapter_deck(scene)
        state.retry_ids = []
        state.finishing_turn = 0
    state.enemy_hp = _enemy_health(state, game)
    if resume and state.encounter_drills is not None:
        state.enemy_hp = min(state.enemy_hp, _unit_health(state, game) * len(state.pending))
    maximum = player_stats(state).max_hp
    state.hp = maximum if recover else min(state.hp, maximum)
    if state.expedition is not None:
        tactics.reset(state.expedition)
        bonus = world.relic_bonuses(state.expedition.relic_ids)
        state.focus = min(player_stats(state).focus_max, state.focus + bonus.opening_focus)
    state.missed_this_fight = []
    state.review_queue = []
    state.review_index = 0
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
    state = BattleState(
        session_id=session_id, game_id=game_id, camp_key=camp_key or token_hex(24),
        hp=stats_for(hero_class, 0, loadout).max_hp, enemy_hp=0,
        hero_class=hero_class, kit=kit, inventory_ids=inventory, equipped_id=loadout.weapon,
        loadout=loadout, pending=chapter_deck(game.scenes[0]), retry_ids=[],
        concepts={q.knowledge_id: BattleTally() for scene in game.scenes for q in scene.challenges},
    )
    state.enemy_hp = _enemy_health(state, game)
    return state


def begin_encounter(state: BattleState, game: RPGGameInternal, encounter_id: str, relic_ids: list[str],
                    *, region_index: int, stage_index: int | None = None, veteran: bool = False,
                    edge_ranks: int = 0, plating_ranks: int = 0, tower_floor=0,
                    companion_id=None, companion_level=0, drills=None) -> BattleState:
    """Enter a chosen map node. World navigation owns the enclosing action revision."""
    result = state.model_copy(deep=True)
    result.encounter_drills = drills
    if stage_index is not None:
        result.stage_index = stage_index
    result.expedition = tactics.EncounterState(encounter_id=encounter_id, region_index=region_index,
                                               relic_ids=list(relic_ids), veteran=veteran,
                                               edge_ranks=edge_ranks, plating_ranks=plating_ranks,
                                               tower_floor=tower_floor, companion_id=companion_id,
                                               companion_level=companion_level)
    _set_fight(result, game, recover=False)
    result.prompt_serial += 1
    result.last_event = None
    result.prior_answer = None
    return result


def view(state: BattleState, game: RPGGameInternal, knowledge: list[KnowledgeItem]) -> BattleView:
    scene = encounter_scene(state, game)
    boss = _is_boss(game, state.stage_index)
    name, sprite = _BOSS if boss else _ENEMIES[state.stage_index]
    maximum = _enemy_health(state, game)
    stats = player_stats(state)
    level = level_for_xp(state.xp)
    xp_left = xp_to_next_level(state.xp)
    tactical_view = None
    if state.expedition is not None:
        spec = world.encounter_for(state.expedition.encounter_id)
        boss, name, sprite = spec.tier == "boss", spec.name, spec.sprite
        level, xp_left = tactics.level_for_xp(state.xp), tactics.xp_to_next_level(state.xp)
        tactical_view = tactics.tactics_view(state, stats)
    exam = active_exam(state, game, knowledge)
    if state.phase == "combat":
        if not state.pending:
            exam.prompt.purpose = "tower_practice" if state.expedition and state.expedition.tower_floor else "finisher"
        elif exam.question.challenge_id in _retries(state, scene):
            exam.prompt.purpose = "retry"
    sidequest = None
    if state.phase == "sidequest":
        sidequest = SideQuestView(title=f"营地修习：{scene.name}"[:120],
                                  completed=state.review_index, total=len(state.review_queue),
                                  lesson=exam.lesson)
    rounds = None
    if state.encounter_drills is not None:
        total = len(chapter_deck(scene))
        rounds = RoundProgress(completed=total-len(state.pending), total=total,
                               kind=round_kind(state, exam.question) if state.phase == "combat" else None)
    return BattleView(
        rounds=rounds,
        session_id=state.session_id, game_id=state.game_id, title=game.title, phase=state.phase,
        revision=state.revision, cleared_stages=state.cleared_stages, defeats=state.defeats,
        sidequests_completed=state.sidequests_completed, last_event=state.last_event, prior_answer=state.prior_answer,
        stage=StageView(index=state.stage_index, number=state.stage_index + 1, total=len(game.scenes),
                        scene_id=scene.scene_id, name=scene.name, objective=scene.quest.objective, boss=boss),
        enemy=EnemyView(name=name, sprite=sprite, hp=state.enemy_hp, max_hp=maximum, boss=boss,
                        enraged=boss and 0 < state.enemy_hp <= maximum // 2),
        player=PlayerView(hp=state.hp, max_hp=stats.max_hp, level=level,
                          xp=state.xp, xp_to_next_level=xp_left, attack=stats.attack,
                          hero_class=state.hero_class, kit=state.kit, stats=stats, loadout=state.loadout,
                          combo=state.combo, equipped_id=state.equipped_id,
                          focus=state.focus, focus_max=stats.focus_max, burst_ready=state.focus == stats.focus_max,
                          inventory=[equipment(gid) for gid in state.inventory_ids]),
        prompt=exam.prompt if exam else None, sidequest=sidequest, tactics=tactical_view,
    )


def _win(state, game, feedback):
    last_scene = _is_boss(game, state.stage_index)
    state.cleared_stages += 1
    next_tier = state.cleared_stages
    weapon_award = True
    if state.expedition is not None:
        ctx = state.expedition
        spec = world.encounter_for(ctx.encounter_id)
        level = tactics.level_for_xp
        old_maximum = player_stats(state).max_hp
        feedback.xp_gained = 35 + 10 * state.stage_index + 7 * ctx.region_index + {
            "normal": 0, "elite": 15, "boss": 25}[spec.tier]
        weapons = class_info(state.hero_class).weapon_ids
        # Discarding a spare weapon must not reset the player's earned tier.
        unlocked = set(state.inventory_ids) | set(state.earned_item_ids)
        best_tier = max(i for i, weapon in enumerate(weapons) if weapon in unlocked)
        next_tier = min(best_tier + 1, len(weapons) - 1)
        weapon_award = next_tier > best_tier
    else:
        level = level_for_xp
        feedback.xp_gained = 35 + 10 * state.stage_index + (15 if last_scene else 0)
    level_before = level(state.xp)
    state.xp += feedback.xp_gained
    feedback.levels_gained = level(state.xp) - level_before
    rewards = stage_rewards(state.hero_class, next_tier, state.kit) if weapon_award else []
    acquired = [item for item in rewards if item.id not in state.inventory_ids]
    state.inventory_ids.extend(item.id for item in acquired)
    state.earned_item_ids.extend(item.id for item in acquired)
    if rewards:
        weapon = rewards[0]
        state.equipped_id = state.loadout.weapon = weapon.id
        feedback.loot = weapon
    feedback.loot_items = acquired
    state.phase = "victory" if last_scene else "stage_clear"
    feedback.kind = state.phase
    maximum = player_stats(state).max_hp
    if state.expedition is not None:
        heal = world.relic_bonuses(ctx.relic_ids).heal_on_win
        state.hp = min(maximum, state.hp + maximum - old_maximum + heal)
        feedback.message = f"{spec.name}的身影消散，通路已经开放。"
    else:
        state.hp = maximum
        feedback.message = ("蚀月守卫让开了道路，你点亮了最后一站。" if last_scene
                            else "守关精灵让开了道路，下一站已经开放。")


def _defeat(state, feedback, current_concept):
    state.phase = "sidequest"
    state.defeats += 1
    state.focus = 0
    # A hero can exhaust HP through combat choices even with perfect recall.
    # Reinforce that turn's topic without adding a fictitious learning mistake.
    state.review_queue = list(state.missed_this_fight) or [current_concept]
    state.review_index = 0
    feedback.kind = "defeat"
    feedback.message = "你退回营地。复盘本次交手的讲义记录，即可整队再战。"


def _record_card(state, scene, question, correct):
    ident = question.challenge_id
    current = challenge_key(question)
    questions = {q.challenge_id: q for q in scene.challenges}
    resolved = _legacy_solved(state, scene)
    retries = _retries(state, scene)
    state.retry_ids = [card for card in retries if card != ident]
    if not correct:
        state.retry_ids.append(ident)
    if state.pending:
        resolved.add(current)
        # Preserve the published turn when opening an old save. Once it is
        # graded, its duplicate IDs cannot queue another copy of that exercise.
        state.pending = [card for card in state.pending[1:] if challenge_key(questions[card]) not in resolved]
        if not correct:
            state.pending.append(ident)
    if state.pending:
        return
    if state.expedition and state.expedition.tower_floor:
        # Advance through distinct exercises and store the published index.
        # This also honors an outstanding legacy turn that pointed at an alias.
        deck = chapter_deck(scene)
        old = next(i for i, card in enumerate(deck) if challenge_key(questions[card]) == current)
        following = deck[(old + 1) % len(deck)]
        state.finishing_turn = next(i for i, q in enumerate(scene.challenges) if q.challenge_id == following)
    elif not correct:
        # One previously issued finishing turn can survive a version upgrade.
        state.pending = [ident]


def _combat_answer(state, game, exam, action, correct):
    q = exam.question
    kind = round_kind(state, q)
    tally = state.concepts[q.knowledge_id]
    stats = player_stats(state)
    ctx = state.expedition
    if action.skill == "guard" and ctx is None:
        raise BattleError(422, "远征遭遇中可使用架势防守。")
    if action.skill == "burst":
        if state.focus < stats.focus_max:
            raise BattleError(409, f"蓄满 {stats.focus_max} 格能量即可释放职业战技。")
        state.focus = 0
    if kind != "tactics":
        if tally.combat_attempts == 0:
            tally.first_attempt_correct = correct
        tally.combat_attempts += 1

    power = 0
    if correct:
        if kind != "tactics":
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
        if action.skill == "burst":
            message = f"{class_info(state.hero_class).burst_name}命中！"
        elif action.skill == "guard":
            message = "稳住架势，完成防守反击。"
        else:
            message = "连击命中要害！" if critical else "攻击命中了敌人。"
        feedback = BattleEvent(kind="hit", message=message, correct=True, critical=critical, skill=action.skill,
                               explanation=q.explanation, source_ref=q.source_ref)
    else:
        state.combo = 0
        missed = exam.missed_by_choice[action.option_id] if exam.missed_by_choice else [q.knowledge_id]
        for kid in missed:
            if kind != "tactics" and kid not in state.missed_this_fight:
                state.missed_this_fight.append(kid)
        # A missed seal stays in the queue. Its field note offers the next
        # reasoning step without disclosing the correct option on a retry.
        needs_review = [item for item in exam.supporting if item.knowledge_id in missed] or [q]
        refs = list(dict.fromkeys(item.source_ref for item in needs_review))
        joined = " / ".join(refs)
        feedback = BattleEvent(kind="miss", message="判断偏离了线索，敌人发动反击。",
                               correct=False, skill=action.skill,
                               explanation="\n".join(item.hint for item in needs_review),
                               source_ref=joined if len(joined) <= 500 else refs[0])

    if correct and len(exam.supporting) > 1:
        feedback.explanation = "\n".join(q.explanation for q in exam.supporting)
        refs = list(dict.fromkeys(q.source_ref for q in exam.supporting))
        joined = " / ".join(refs)
        feedback.source_ref = joined if len(joined) <= 500 else refs[0]
    feedback.round_kind = kind
    scene = encounter_scene(state, game)
    _record_card(state, scene, q, correct)
    exchange = None
    if ctx is not None:
        exchange = tactics.exchange(ctx, stats, state.stage_index, correct, action.skill, power)
        power, raw, counter = exchange.power, exchange.raw, exchange.damage
    else:
        enraged = _is_boss(game, state.stage_index) and state.enemy_hp <= _enemy_health(state, game) // 2
        raw = (10 + 3 * state.stage_index + (3 if enraged else 0)) if not correct else 0
        divisor = 10 + stats.defense
        counter = (raw * 10 + divisor - 1) // divisor
    # Protect the remaining questions; mastering the last one breaks the enemy.
    reserve = len(state.pending) * (_unit_health(state, game) // 2)
    if correct and state.encounter_drills is not None:
        # In long high-level encounters even an ordinary cast should move the
        # health bar visibly. Guard trades some progress for a safer exchange.
        share = state.enemy_hp // (len(state.pending) + 1)
        power = max(power, share * (70 if action.skill == "guard" else 90) // 100)
    chain_needed = (ctx and ctx.tower_floor and
                    state.combo < tactics.tower_chain(ctx.tower_floor, len(chapter_deck(scene))))
    if correct and not state.pending and not chain_needed:
        power = max(power, state.enemy_hp)
    elif ctx and ctx.phase == 1 and world.encounter_for(ctx.encounter_id).tier == "boss":
        halfway = _enemy_health(state, game) // 2
        phase_two_rounds = max(1, len(chapter_deck(scene)) // 2) if state.encounter_drills is not None else 1
        if correct and len(state.pending) <= phase_two_rounds:
            # Reserve time to play the boss's second attack pattern before the finisher.
            power = max(power, state.enemy_hp - halfway)
        reserve = max(reserve, halfway)
    if chain_needed:
        reserve = max(1, reserve)
    feedback.damage_dealt = min(power, max(0, state.enemy_hp - reserve))
    state.enemy_hp -= feedback.damage_dealt
    if ctx and correct and ctx.companion_id:
        rank = ctx.companion_level
        amount = 0
        if ctx.companion_id == "reed":
            # Reuse the preview rules to report the actual incremental prevention.
            solo = ctx.model_copy(update={"companion_id": None})
            baseline = tactics.exchange(solo, stats, state.stage_index, True, action.skill, power)
            amount = min(state.hp, baseline.damage) - min(state.hp, counter) if state.enemy_hp else 0
            effect = "guard"
        elif ctx.companion_id == "flint" and action.skill == "strike":
            effect = "strike"
            amount = min(1 + rank, max(0, state.enemy_hp - reserve))
            state.enemy_hp -= amount
            feedback.damage_dealt += amount
        elif ctx.companion_id == "lumen" and action.skill != "burst" and state.combo % 3 == 0:
            effect = "focus"
            amount = min(1 + int(rank >= 3), stats.focus_max - state.focus)
            state.focus += amount
        if amount:
            feedback.partner_assist = PartnerAssist(companion_id=ctx.companion_id, level=rank,
                                                   amount=amount, effect=effect)
    if exchange is not None:
        feedback.tactics = tactics.apply_exchange(ctx, exchange, state.enemy_hp, _enemy_health(state, game))
    if state.enemy_hp == 0:
        _win(state, game, feedback)
    else:
        feedback.damage_received = min(state.hp, counter)
        feedback.damage_blocked = raw - counter
        state.hp -= feedback.damage_received
        if state.hp == 0:
            _defeat(state, feedback, q.challenge_id if kind == "tactics" else q.knowledge_id)
    return feedback


def _review_answer(state, game, exam, action, correct):
    if action.skill != "strike":
        raise BattleError(409, "职业战技可在战斗回合释放。")
    tally = state.concepts[exam.question.knowledge_id]
    kind = round_kind(state, exam.question)
    if kind != "tactics":
        tally.review_attempts += 1
    if not correct:
        # Keep the completed prefix fixed and revisit this lesson after its peers.
        state.review_queue.append(state.review_queue.pop(state.review_index))
        return BattleEvent(kind="review_wrong", round_kind=kind, correct=False, message="翻回营地摘记，再核对这张档案卡。",
                           explanation=exam.lesson.definition, source_ref=exam.lesson.source_ref)
    if kind != "tactics":
        tally.review_correct += 1
    state.review_index += 1
    feedback = BattleEvent(kind="review_correct", round_kind=kind, correct=True, message="档案修复成功，继续下一条营地记录。",
                           explanation=exam.question.explanation, source_ref=exam.question.source_ref)
    if state.review_index == len(state.review_queue):
        state.sidequests_completed += 1
        _set_fight(state, game, resume=True)
        feedback.kind = "recovered"
        feedback.message = "营地修习完成，体力已恢复。重新挑战本章守关者！"
    return feedback


def equip_item(state: BattleState, item_id: str, *, relic_ids=None, edge_ranks=None, plating_ranks=None) -> Gear:
    if item_id not in state.inventory_ids:
        raise BattleError(422, "请从已获得的装备中选择。")
    item = equipment(item_id)
    if item.class_id not in (None, state.hero_class):
        raise BattleError(422, "请选择本职业可以使用的装备。")
    setattr(state.loadout, item.slot, item.id)
    state.equipped_id = state.loadout.weapon
    stats = player_stats(state, relic_ids=relic_ids, edge_ranks=edge_ranks, plating_ranks=plating_ranks)
    state.hp = min(state.hp, stats.max_hp)
    return item


def advance(state: BattleState, action: BattleAction | ExpeditionAnswer, game: RPGGameInternal,
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
        item = equip_item(result, action.item_id)
        feedback = BattleEvent(kind="equip", message=f"已装备{item.name}。", equipped_item=item)
    elif isinstance(action, NextStage):
        if result.expedition is not None:
            raise BattleError(409, "在远征地图选择路线即可启程。")
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
            if round_kind(result, exam.question) != "tactics":
                if result.phase == "sidequest":
                    tally.review_hints += 1
                else:
                    tally.hints += 1
            feedback = BattleEvent(kind="hint", message=(exam.help_text if len(exam.help_text) <= 600
                                                        else "本回合的讲义提示已展开。"))
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
    # A hint has its own action receipt. Keep the most recent resolved turn
    # available to the journal when the player reloads during this same prompt.
    result.prior_answer = (result.last_event if feedback.kind == "hint"
                           and result.last_event and result.last_event.correct is not None else None)
    result.last_event = feedback
    result.revision += 1
    return result
