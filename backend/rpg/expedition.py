"""Campaign orchestration over an ordered bookshelf of immutable RPG publications."""

from collections import Counter

from ..models import KnowledgeItem
from . import battle_rules, expedition_combat
from .battle_models import BattleState, Retreat
from .battle_reports import concept_rows
from .battle_rules import BattleError
from .expedition_models import (
    BountySeal, ChapterMap, ChooseReward, ChooseRoute, ExpeditionAction, ExpeditionReport, ExpeditionState,
    ExpeditionView, HeldRelic, RegionMap, RewardChoice, Visit, VolumeStudy,
)
from .expedition_world import region_at, relic_for, reward_relics, routes_for
from .hero_catalog import ClassId, KitId
from .models import RPGGameInternal

Courses = dict[str, tuple[RPGGameInternal, list[KnowledgeItem]]]
RELIC_SLOTS = 4


def new_expedition(session_id: str, courses: Courses, hero_class: ClassId = "arcanist",
                   kit: KitId = "trail", *, veteran: bool = False,
                   inherited_relic_id: str | None = None) -> ExpeditionState:
    if not 1 <= len(courses) <= 8:
        raise BattleError(422, "请选择一至八卷已经发布的课程。")
    first = next(iter(courses))
    if inherited_relic_id is not None:
        if not veteran:
            raise BattleError(422, "传承遗物可用于通关后开启的远征。")
        try:
            relic_for(inherited_relic_id)
        except (KeyError, ValueError):
            raise BattleError(422, "请选择图鉴中的传承遗物。") from None
    battle = battle_rules.new_battle(session_id, first, *courses[first], hero_class=hero_class, kit=kit)
    return ExpeditionState(session_id=session_id, game_ids=list(courses), hero_class=hero_class,
                           kit=kit, battle=battle, veteran=veteran, inherited_relic_id=inherited_relic_id,
                           relic_ids=[inherited_relic_id] if inherited_relic_id else [])


def _routes(state, courses):
    game = courses[state.game_ids[state.region_index]][0]
    return routes_for(state.region_index, state.scene_index, len(game.scenes))


def _current_route(state, courses):
    return next(route for route in _routes(state, courses) if route.id == state.route_id)


def _heal_limit(hp, maximum, percent):
    return min(maximum - hp, (maximum * percent + 99) // 100)


def _reward_choices(state, courses):
    route = _current_route(state, courses)
    stats = battle_rules.player_stats(state.battle)
    healing = _heal_limit(state.battle.hp, stats.max_hp, 50)
    choices = [RewardChoice(id="purse", kind="purse", name="护送钱箱",
                            description="带着车队的钱箱同行，获得三枚路币。", coins=3)]
    if healing:
        choices.append(RewardChoice(id="rest", kind="rest", name="营火歇脚",
                                    description=f"在营地补充体力，本次恢复 {healing} 点生命。", heal=healing))
    count = 3 if route.risk in {"elite", "boss"} else 2
    stock = reward_relics(state.region_index, state.scene_index, state.relic_ids, count=count)
    held = Counter(state.relic_ids)
    for index, relic in enumerate(stock):
        price = 3 + 2 * (index + held[relic.id])
        choices.append(RewardChoice(id=f"relic_{relic.id}", kind="relic", name=relic.name,
                                    description=relic.description, cost=price, affordable=state.coins >= price,
                                    requires_replacement=(len(held) >= RELIC_SLOTS and relic.id not in held),
                                    relic=relic))
    ranks = state.edge_ranks + state.plating_ranks
    if ranks < expedition_combat.FORGE_CAP:
        price = 7 + 4 * ranks
        choices.extend([
            RewardChoice(id="forge_edge", kind="forge", name="锻刃",
                         description="强化角色的武器技艺，后续换装时仍保留 2 点攻击。", cost=price,
                         affordable=state.coins >= price),
            RewardChoice(id="forge_plating", kind="forge", name="锻甲",
                         description="强化角色的护甲工艺，后续换装时仍保留 2 点防御。", cost=price,
                         affordable=state.coins >= price),
        ])
    return choices


def _transfer_hero(old: BattleState, new: BattleState):
    # Every volume has fresh knowledge tallies. Transfer only character progression
    # and the turn serial so a prompt from an earlier book can never be reused.
    new.hp = old.hp
    new.xp = old.xp
    new.focus = old.focus
    new.inventory_ids = list(old.inventory_ids)
    new.earned_item_ids = list(old.earned_item_ids)
    new.loadout = old.loadout.model_copy(deep=True)
    new.equipped_id = old.equipped_id
    new.prompt_serial = old.prompt_serial


def _enter(state, courses, selected):
    options = _routes(state, courses)
    route = next((r for r in options if r.id == selected), None)
    if route is None:
        raise BattleError(422, "请选择地图上当前开放的一条路线。")
    game_id = state.game_ids[state.region_index]
    game, knowledge = courses[game_id]
    previous = state.battle
    if previous.game_id != game_id:
        fresh = battle_rules.new_battle(state.session_id, game_id, game, knowledge,
                                        hero_class=state.hero_class, kit=state.kit, camp_key=previous.camp_key)
        _transfer_hero(previous, fresh)
        state.battle = fresh
    fight = battle_rules.begin_encounter(state.battle, game, route.encounter_id, state.relic_ids,
                                         region_index=state.region_index, stage_index=state.scene_index,
                                         veteran=state.veteran, edge_ranks=state.edge_ranks,
                                         plating_ranks=state.plating_ranks)
    if route.boss and route.approach == "steady":
        stats = battle_rules.player_stats(fight)
        fight.hp += _heal_limit(fight.hp, stats.max_hp, 30)
        fight.focus = min(stats.focus_max, fight.focus + 1)
    state.battle = fight
    state.route_id = route.id
    state.phase = "combat"


def _volume_study(index, game_id, course, fight, outcome):
    game, knowledge = course
    return VolumeStudy(game_id=game_id, title=game.title, region_id=region_at(index).id,
                       outcome=outcome, chapters=len(game.scenes),
                       cleared_chapters=fight.cleared_stages if fight else 0,
                       defeats=fight.defeats if fight else 0,
                       sidequests_completed=fight.sidequests_completed if fight else 0,
                       concepts=concept_rows(fight.concepts if fight else {}, game, knowledge))


def _settle(state, courses):
    route = _current_route(state, courses)
    fight = state.battle
    game, knowledge = courses[fight.game_id]
    coins = {"normal": 3, "elite": 5, "boss": 6}[route.risk]
    if route.boss and route.approach == "daring":
        coins += 2
    state.coins += coins
    scene = game.scenes[state.scene_index]
    state.journal.append(Visit(game_id=fight.game_id, scene_id=scene.scene_id, route_id=route.id,
                               encounter_id=route.encounter_id, coins_earned=coins))
    state.phase = "reward"
    if state.scene_index + 1 == len(game.scenes):
        state.completed_volumes.append(_volume_study(state.region_index, fight.game_id,
                                                    (game, knowledge), fight, "victory"))
        if state.region_index + 1 == len(state.game_ids):
            state.phase = "victory"


def _take_reward(state, courses, action):
    reward = next((r for r in _reward_choices(state, courses) if r.id == action.reward_id), None)
    if reward is None:
        raise BattleError(422, "请选择本次营地提供的补给。")
    if not reward.affordable:
        raise BattleError(409, "路币尚缺，请选择其他补给或随车队积攒路币。")
    if reward.requires_replacement:
        if action.replace_relic_id not in state.relic_ids:
            raise BattleError(422, "四个遗物位已满，请选出一种当前佩带的遗物整组交还。")
        visit = state.journal[-1]
        visit.replaced_relic_id = action.replace_relic_id
        visit.replaced_stacks = state.relic_ids.count(action.replace_relic_id)
        state.relic_ids = [rid for rid in state.relic_ids if rid != action.replace_relic_id]
    elif action.replace_relic_id is not None:
        raise BattleError(422, "本次补给可直接领取，请清空交还遗物选项。")
    state.coins += reward.coins - reward.cost
    state.battle.hp += reward.heal
    if reward.kind == "forge":
        if reward.id == "forge_edge":
            state.edge_ranks += 1
        else:
            state.plating_ranks += 1
        state.battle.expedition.edge_ranks = state.edge_ranks
        state.battle.expedition.plating_ranks = state.plating_ranks
    if reward.relic:
        state.relic_ids.append(reward.relic.id)
        state.battle.expedition.relic_ids = list(state.relic_ids)
        stats = battle_rules.player_stats(state.battle)
        state.battle.hp = min(state.battle.hp, stats.max_hp)
        state.battle.focus = min(state.battle.focus, stats.focus_max)
    state.journal[-1].reward_id = reward.id
    if state.scene_index + 1 == len(courses[state.battle.game_id][0].scenes):
        state.region_index += 1
        state.scene_index = 0
    else:
        state.scene_index += 1
    state.route_id = None
    state.phase = "route"


def advance(state: ExpeditionState, action: ExpeditionAction, courses: Courses) -> ExpeditionState:
    if action.expected_revision != state.revision:
        raise BattleError(409, "远征进度已更新，请读取当前存档。")
    if state.phase in {"retreated", "victory"}:
        raise BattleError(409, "本次远征已经结束，可查看战报或开始另一趟旅程。")
    result = state.model_copy(deep=True)
    if isinstance(action, Retreat):
        result.phase = "retreated"
    elif isinstance(action, ChooseRoute):
        if result.phase != "route":
            raise BattleError(409, "到达下一个路口后可以选路。")
        _enter(result, courses, action.route_id)
    elif isinstance(action, ChooseReward):
        if result.phase != "reward":
            raise BattleError(409, "赢得本章战斗后可以领取补给。")
        _take_reward(result, courses, action)
    else:
        if result.phase not in {"combat", "sidequest"}:
            raise BattleError(409, "进入战斗或营地修习后可以操作。")
        # The outer revision also includes route and settlement decisions. Embedded
        # battle command versions are private to the current volume.
        inner = action.model_copy(update={"expected_revision": result.battle.revision})
        result.battle = battle_rules.advance(result.battle, inner, *courses[result.battle.game_id])
        if result.battle.phase in {"victory", "stage_clear"}:
            _settle(result, courses)
        else:
            result.phase = result.battle.phase
    result.revision += 1
    return result


def _map(state, courses):
    visits = {(visit.game_id, visit.scene_id): visit for visit in state.journal}
    atlas = []
    for i, game_id in enumerate(state.game_ids):
        game = courses[game_id][0]
        region = region_at(i)
        chapters = []
        for j, scene in enumerate(game.scenes):
            visit = visits.get((game_id, scene.scene_id))
            chosen = visit.route_id if visit else None
            status = "locked"
            if visit:
                status = "cleared"
            elif i == state.region_index and j == state.scene_index:
                chosen = state.route_id
                status = {"route": "available", "retreated": "abandoned"}.get(state.phase, "active")
            chapters.append(ChapterMap(scene_id=scene.scene_id, name=scene.name, objective=scene.quest.objective,
                                       status=status, route_id=chosen, boss=j + 1 == len(game.scenes)))
        atlas.append(RegionMap(region_id=region.id, name=region.name, game_id=game_id,
                               course_title=game.title, chapters=chapters))
    return atlas


def _held_relics(state):
    return [HeldRelic(relic=relic_for(rid), stacks=n) for rid, n in Counter(state.relic_ids).items()]


def _bounty_seals(state):
    seals = []
    for visit in state.journal:
        if visit.route_id == "boss_daring":
            region = region_at(state.game_ids.index(visit.game_id))
            seals.append(BountySeal(region_id=region.id, region_name=region.name, boss_id=visit.encounter_id))
    return seals


def _player(state, battle):
    player = battle.player
    if state.battle.expedition is None:
        stats = battle_rules.player_stats(state.battle, relic_ids=state.relic_ids, edge_ranks=state.edge_ranks,
                                         plating_ranks=state.plating_ranks)
        player.stats = stats
        player.max_hp = stats.max_hp
        player.attack = stats.attack
        player.level = expedition_combat.level_for_xp(player.xp)
        player.xp_to_next_level = expedition_combat.xp_to_next_level(player.xp)
    return player


def view(state: ExpeditionState, courses: Courses) -> ExpeditionView:
    game_id = state.game_ids[state.region_index]
    atlas = _map(state, courses)
    region = region_at(state.region_index)
    battle = battle_rules.view(state.battle, *courses[state.battle.game_id])
    narrative = region.objective
    if state.phase == "retreated":
        narrative = "队伍已返回营地，沿路的发现写入了远征日志。"
    elif state.phase == "victory" and len(_bounty_seals(state)) == len(state.game_ids):
        narrative = "各地悬赏印记在终点连成一线，队伍带着整套首领战绩归航。"
    elif state.phase == "victory" or (state.phase == "reward" and state.battle.phase == "victory"):
        narrative = region.resolution
    elif state.phase == "route" and state.scene_index == 0:
        narrative = region.arrival
    elif state.phase == "combat":
        narrative = _current_route(state, courses).description
    elif state.phase == "sidequest":
        narrative = "打开讲义摘记，完成本章复习后重返刚才的战场。"
    return ExpeditionView(session_id=state.session_id, veteran=state.veteran, inherited_relic_id=state.inherited_relic_id,
                          bounty_seals=_bounty_seals(state), revision=state.revision, phase=state.phase,
                          region_index=state.region_index, scene_index=state.scene_index, game_id=game_id,
                          chapter_count=sum(len(r.chapters) for r in atlas), cleared_chapters=len(state.journal),
                          narrative=narrative, map=atlas, routes=_routes(state, courses) if state.phase == "route" else [],
                          rewards=_reward_choices(state, courses) if state.phase == "reward" else [],
                          player=_player(state, battle), battle=battle if state.phase in {"combat", "sidequest", "reward", "victory"} else None,
                          coins=state.coins, edge_ranks=state.edge_ranks, plating_ranks=state.plating_ranks,
                          forge_rank_limit=expedition_combat.FORGE_CAP, relics=_held_relics(state), relic_slot_limit=RELIC_SLOTS,
                          journal=state.journal)


def report(state: ExpeditionState, courses: Courses) -> ExpeditionReport:
    if state.phase not in {"retreated", "victory"}:
        raise BattleError(409, "远征通关或撤离后可查看战报。")
    volumes = list(state.completed_volumes)
    for index in range(len(volumes), len(state.game_ids)):
        game_id = state.game_ids[index]
        has_progress = state.route_id is not None or state.battle.cleared_stages > 0
        fought = state.battle if game_id == state.battle.game_id and has_progress else None
        volumes.append(_volume_study(index, game_id, courses[game_id], fought,
                                    "retreated" if fought else "unvisited"))
    rows = [concept for volume in volumes for concept in volume.concepts]
    first = [row.first_attempt_correct for row in rows if row.first_attempt_correct is not None]
    attempts, hits = sum(c.combat_attempts for c in rows), sum(c.combat_correct for c in rows)
    reviews, solved = sum(c.review_attempts for c in rows), sum(c.review_correct for c in rows)
    chapters = sum(volume.chapters for volume in volumes)
    player = _player(state, battle_rules.view(state.battle, *courses[state.battle.game_id]))
    return ExpeditionReport(session_id=state.session_id, veteran=state.veteran, inherited_relic_id=state.inherited_relic_id,
                            bounty_seals=_bounty_seals(state), outcome=state.phase, chapter_count=chapters,
                            cleared_chapters=len(state.journal), completed_volumes=len(state.completed_volumes),
                            completion_rate=len(state.journal) / chapters, volumes=volumes,
                            defeats=sum(v.defeats for v in volumes),
                            sidequests_completed=sum(v.sidequests_completed for v in volumes),
                            combat_attempts=attempts, combat_correct=hits, combat_accuracy=hits / attempts if attempts else None,
                            first_attempt_accuracy=sum(first) / len(first) if first else None,
                            review_attempts=reviews, review_correct=solved, review_accuracy=solved / reviews if reviews else None,
                            player=player, relics=_held_relics(state), relic_slot_limit=RELIC_SLOTS,
                            coins=state.coins, edge_ranks=state.edge_ranks, plating_ranks=state.plating_ranks,
                            forge_rank_limit=expedition_combat.FORGE_CAP, journal=state.journal)
