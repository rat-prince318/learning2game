"""Campaign orchestration over an ordered bookshelf of immutable RPG publications."""

from collections import Counter
from typing import NamedTuple

from ..models import KnowledgeItem
from ..legacy_exam import has_legacy_exam_cover
from . import battle_rules, companions, expedition_combat, quest_story, tower
from .battle_models import BattleState, Equip, Retreat
from .battle_reports import concept_rows
from .battle_rules import BattleError
from .encounter_drills import build_drills, drill_key
from .expedition_models import (
    AdvanceExploration, BountySeal, ChapterMap, ChooseReward, ChooseRoute, ExpeditionAction, ExpeditionReport, ExpeditionState,
    ExpeditionView, HeldRelic, InspectLandmark, PartyCommand, RegionMap, RewardChoice, StoryChoice, Visit, VolumeStudy,
)
from .expedition_world import region_at, relic_for, reward_relics, routes_for
from .hero_catalog import ClassId, KitId
from .models import RPGGameInternal
from .validation import challenge_key, coverage_key

Courses = dict[str, tuple[RPGGameInternal, list[KnowledgeItem]]]
RELIC_SLOTS = 4
STORY_REGIONS = 8


def _overlapping_cards(courses):
    """Old publications may re-assess a shared source with fresh prompts and IDs."""
    exercises, objectives, exclusions = set(), set(), {}
    by_source = {}
    for gid, (game, knowledge) in courses.items():
        source = id(knowledge)
        if source not in by_source:
            by_source[source] = {item.knowledge_id: item for item in knowledge}
        for scene in game.scenes:
            for question in scene.challenges:
                exercise = challenge_key(question)
                item = by_source[source].get(question.knowledge_id)
                objective = coverage_key(item, "en") if item else ("id", question.knowledge_id)
                if exercise in exercises or objective in objectives:
                    exclusions.setdefault(gid, []).append(question.challenge_id)
                else:
                    exercises.add(exercise)
                    objectives.add(objective)
    return exclusions


def playable_courses(courses, exclusions):
    """Filter immutable publications for this save, retaining original scene and option IDs."""
    if not exclusions:
        return courses
    result = {}
    for gid, (game, knowledge) in courses.items():
        if gid not in exclusions:
            result[gid] = game, knowledge
            continue
        blocked = set(exclusions[gid])
        scenes = []
        for scene in game.scenes:
            cards = [q for q in scene.challenges if q.challenge_id not in blocked]
            if cards:
                quest = scene.quest.model_copy(update={"challenge_ids": [q.challenge_id for q in cards]})
                scenes.append(scene.model_copy(update={"challenges": cards, "quest": quest}))
        if scenes:
            for i, scene in enumerate(scenes):
                scene.next_scene_id = scenes[i + 1].scene_id if i + 1 < len(scenes) else None
            result[gid] = game.model_copy(update={"scenes": scenes, "start_scene_id": scenes[0].scene_id}), knowledge
    return result


class Stop(NamedTuple):
    game_id: str
    stage: int


def itinerary(state, courses):
    """Published scenes stay in order; short courses leave room for story-only regions."""
    books = [[Stop(gid, stage) for stage in range(len(courses[gid][0].scenes))] for gid in state.game_ids]
    if not state.eight_chapters:
        return books
    scenes = [stop for book in books for stop in book]
    regions = [[] for _ in range(STORY_REGIONS)]
    for i, stop in enumerate(scenes):
        if len(scenes) == 1:
            region = STORY_REGIONS - 1
        elif len(scenes) < STORY_REGIONS:
            region = i * (STORY_REGIONS - 1) // (len(scenes) - 1)
        else:
            region = i * STORY_REGIONS // len(scenes)
        regions[region].append(stop)
    return regions


def _cleared_stops(state, route):
    return len(state.journal) + sum(not stops for stops in route[:state.region_index])


def _next_stop(state, route):
    if state.scene_index + 1 < len(route[state.region_index]):
        state.scene_index += 1
    else:
        state.region_index += 1
        state.scene_index = 0
    state.route_id = None
    state.phase = "route"


def new_expedition(session_id: str, courses: Courses, hero_class: ClassId = "arcanist",
                   kit: KitId = "trail", *, veteran: bool = False,
                   inherited_relic_id: str | None = None, campaign_story: bool = False,
                   eight_chapters: bool = False) -> ExpeditionState:
    if not courses or (not eight_chapters and len(courses) > 8):
        raise BattleError(422, "请选择一至八卷已经发布的课程。")
    excluded = _overlapping_cards(courses) if eight_chapters else {}
    courses = playable_courses(courses, excluded)
    first = next(iter(courses))
    if inherited_relic_id is not None:
        if not veteran:
            raise BattleError(422, "传承遗物可用于通关后开启的远征。")
        try:
            relic_for(inherited_relic_id)
        except (KeyError, ValueError):
            raise BattleError(422, "请选择图鉴中的传承遗物。") from None
    battle = battle_rules.new_battle(session_id, first, *courses[first], hero_class=hero_class, kit=kit)
    return ExpeditionState(session_id=session_id, game_ids=list(courses), hero_class=hero_class, campaign_story=campaign_story or eight_chapters,
                           eight_chapters=eight_chapters, excluded_cards=excluded,
                           kit=kit, battle=battle, veteran=veteran, inherited_relic_id=inherited_relic_id,
                           relic_ids=[inherited_relic_id] if inherited_relic_id else [])


def _routes(state, courses):
    path = itinerary(state, courses)
    stops = path[state.region_index]
    if not stops:
        return []
    routes = routes_for(state.region_index, state.scene_index, len(stops))
    if state.campaign_story and state.region_index == len(path) - 1 and routes[0].boss:
        return [r.model_copy(update={"encounter_id": "ash_crown"}) for r in routes]
    return routes


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
    if state.eight_chapters and region_at(state.region_index).id not in state.story_marks:
        raise BattleError(409, "先去找当地的接应人，听完军情再出发。")
    game_id, stage = itinerary(state, courses)[state.region_index][state.scene_index]
    game, knowledge = courses[game_id]
    previous = state.battle
    if previous.game_id != game_id:
        fresh = battle_rules.new_battle(state.session_id, game_id, game, knowledge,
                                        hero_class=state.hero_class, kit=state.kit, camp_key=previous.camp_key)
        _transfer_hero(previous, fresh)
        state.battle = fresh
    drills = None
    if state.eight_chapters:
        # Reserve future source questions too, so an earlier exercise can never
        # spoil the exact question that the next teacher-authored scene will ask.
        occupied = set(state.used_drills)
        occupied.update(drill_key(q) for publication, _ in courses.values()
                        for scene in publication.scenes for q in scene.challenges)
        drills = build_drills(game.scenes[stage], knowledge, game.question_language, route.encounter_id, occupied)
        state.used_drills.extend(drill_key(d.card) for d in drills)
    fight = battle_rules.begin_encounter(state.battle, game, route.encounter_id, state.relic_ids, drills=drills,
                                         region_index=state.region_index, stage_index=stage,
                                         veteran=state.veteran, edge_ranks=state.edge_ranks,
                                         plating_ranks=state.plating_ranks, companion_id=state.active_companion,
                                         companion_level=companions.level(state.bonds[state.active_companion]) if state.active_companion else 0)
    if route.boss and route.approach == "steady":
        stats = battle_rules.player_stats(fight)
        fight.hp += _heal_limit(fight.hp, stats.max_hp, 30)
        fight.focus = min(stats.focus_max, fight.focus + 1)
    if route.encounter_id == "ash_crown":
        # The resistance sends medics for rescued locals and sappers for stolen plans.
        rescued = sum(quest_story.CHOICES[region][0] == mark for region, mark in state.story_marks.items())
        raids = len(state.story_marks) - rescued
        fight.hp = min(battle_rules.player_stats(fight).max_hp, fight.hp + min(8, rescued * 2))
        fight.expedition.shield = max(1, fight.expedition.shield - min(2, raids))
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
    companions.bond_on_win(state, fight)
    game, knowledge = courses[fight.game_id]
    coins = {"normal": 3, "elite": 5, "boss": 6}[route.risk]
    if route.boss and route.approach == "daring":
        coins += 2
    state.coins += coins
    scene = game.scenes[fight.stage_index]
    state.journal.append(Visit(game_id=fight.game_id, scene_id=scene.scene_id, route_id=route.id,
                               encounter_id=route.encounter_id, coins_earned=coins))
    state.phase = "reward"
    if fight.stage_index + 1 == len(game.scenes):
        state.completed_volumes.append(_volume_study(state.region_index, fight.game_id,
                                                    (game, knowledge), fight, "victory"))
    path = itinerary(state, courses)
    if state.region_index + 1 == len(path) and state.scene_index + 1 == len(path[-1]):
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
    _next_stop(state, itinerary(state, courses))


def advance(state: ExpeditionState, action: ExpeditionAction, courses: Courses) -> ExpeditionState:
    courses = playable_courses(courses, state.excluded_cards)
    if action.expected_revision != state.revision:
        raise BattleError(409, "远征进度已更新，请读取当前存档。")
    if action.action.startswith("tower_") or isinstance(action, (PartyCommand, StoryChoice)):
        result = state.model_copy(deep=True)
        if isinstance(action, StoryChoice):
            quest_story.decide(result, action.choice)
        elif isinstance(action, PartyCommand):
            companions.set_companion(result, action)
        else:
            tower.advance(result, action, courses)
        result.revision += 1
        return result
    if state.phase in {"retreated", "victory"}:
        raise BattleError(409, "本次远征已经结束，可查看战报或开始另一趟旅程。")
    result = state.model_copy(deep=True)
    if isinstance(action, Retreat):
        result.phase = "retreated"
    elif isinstance(action, Equip) and state.phase in {"route", "reward"}:
        battle_rules.equip_item(result.battle, action.item_id)
    elif isinstance(action, InspectLandmark):
        if state.phase != "route":
            raise BattleError(409, "回到地图路口后可以调查地标。")
        landmark = region_at(state.region_index).id
        if landmark not in result.field_signals:
            result.field_signals.append(landmark)
            maximum = battle_rules.player_stats(result.battle, relic_ids=result.relic_ids,
                                                edge_ranks=result.edge_ranks, plating_ranks=result.plating_ranks).max_hp
            result.battle.hp = min(maximum, result.battle.hp + 3)
    elif isinstance(action, AdvanceExploration):
        path = itinerary(result, courses)
        if result.phase != "route" or not result.eight_chapters or path[result.region_index]:
            raise BattleError(409, "这条路线需要先打通守关战。")
        region_id = region_at(result.region_index).id
        if region_id not in result.story_marks or region_id not in result.field_signals:
            raise BattleError(409, "先找当地的接应人，再去修好地标，就能继续赶路。")
        _next_stop(result, path)
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


def _map(state, courses, path, repeated):
    visits = {(visit.game_id, visit.scene_id): visit for visit in state.journal}
    atlas = []
    for i, stops in enumerate(path):
        region = region_at(i)
        chapters = []
        knowledge_count = 0
        for j, (game_id, stage) in enumerate(stops):
            scene = courses[game_id][0].scenes[stage]
            visit = visits.get((game_id, scene.scene_id))
            chosen = visit.route_id if visit else None
            status = "locked"
            if visit:
                status = "cleared"
            elif i == state.region_index and j == state.scene_index:
                chosen = state.route_id
                status = {"route": "available", "retreated": "abandoned"}.get(state.phase, "active")
            chapters.append(ChapterMap(game_id=game_id, scene_id=scene.scene_id, name=scene.name,
                                       objective=scene.quest.objective, status=status, route_id=chosen,
                                       boss=j + 1 == len(stops)))
            knowledge_count += sum((game_id, q.knowledge_id) not in repeated for q in scene.challenges)
        if not stops:
            status = "cleared" if i < state.region_index else "locked"
            if i == state.region_index:
                status = "abandoned" if state.phase == "retreated" else "available"
            chapters.append(ChapterMap(kind="exploration", scene_id=region.id + "_crossing", name=region.name,
                                       objective=region.objective, status=status, boss=False))
        # game_id remains a usable publication for older clients. Each combat
        # stop now also carries its own book ID when a region spans several.
        game_id = stops[0].game_id if stops else next(s[0].game_id for s in path[i + 1:] if s)
        atlas.append(RegionMap(region_id=region.id, name=region.name, game_id=game_id, knowledge_count=knowledge_count,
                               course_title=courses[game_id][0].title if stops else region.name, chapters=chapters))
    return atlas


def _held_relics(state):
    return [HeldRelic(relic=relic_for(rid), stacks=n) for rid, n in Counter(state.relic_ids).items()]


def _bounty_seals(state, path, courses):
    locations = {(gid, courses[gid][0].scenes[stage].scene_id): i
                 for i, stops in enumerate(path) for gid, stage in stops}
    seals = []
    for visit in state.journal:
        if visit.route_id == "boss_daring":
            region = region_at(locations[visit.game_id, visit.scene_id])
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
    courses = playable_courses(courses, state.excluded_cards)
    path = itinerary(state, courses)
    # Old saves retain their original fights. Count repeated learning objectives
    # once in the newly added coverage indicators, even when the archive replayed them.
    overlaps = {} if state.eight_chapters else _overlapping_cards(courses)
    repeated = {(gid, q.knowledge_id) for gid, ids in overlaps.items()
                for scene in courses[gid][0].scenes for q in scene.challenges if q.challenge_id in ids}
    atlas = _map(state, courses, path, repeated)
    stops = path[state.region_index]
    game_id = stops[state.scene_index].game_id if stops else atlas[state.region_index].game_id
    seals = _bounty_seals(state, path, courses)
    studied = sum(bool(row.combat_attempts) for v in state.completed_volumes for row in v.concepts
                  if (v.game_id, row.knowledge_id) not in repeated)
    if not state.completed_volumes or state.completed_volumes[-1].game_id != state.battle.game_id:
        studied += sum(bool(row.combat_attempts) for kid, row in state.battle.concepts.items()
                       if (state.battle.game_id, kid) not in repeated)
    region = region_at(state.region_index)
    battle = battle_rules.view(state.battle, *courses[state.battle.game_id])
    narrative = region.objective
    if state.phase == "retreated":
        narrative = "队伍已返回营地，沿路的发现写入了远征日志。"
    elif state.campaign_story and state.phase == "victory":
        narrative = "灰冠碎裂，星门后的敌军开始撤退。先锋队等候战后的第一道命令。"
    elif state.campaign_story and state.phase == "combat" and state.battle.expedition.encounter_id == "ash_crown":
        narrative = ("龙将撕开破甲，熔炉的火光照亮胸口。看准重击后的空隙出手。"
                     if state.battle.expedition.phase == 2 else "灰冠龙将压低长角，架起铁盾。先锋队在翼下列阵。")
    elif state.phase == "victory" and len(seals) == len(path):
        narrative = "各地悬赏印记在终点连成一线，队伍带着整套首领战绩归航。"
    elif state.phase == "victory" or (state.phase == "reward" and state.battle.phase == "victory"):
        narrative = region.resolution
    elif state.phase == "route" and state.scene_index == 0:
        narrative = region.arrival
    elif state.phase == "combat":
        narrative = _current_route(state, courses).description
    elif state.phase == "sidequest":
        narrative = "打开讲义摘记，完成本章复习后重返刚才的战场。"
    return ExpeditionView(eight_chapters=state.eight_chapters,
                          cleared_regions=sum(all(c.status == "cleared" for c in r.chapters) for r in atlas),
                          knowledge_count=sum(r.knowledge_count for r in atlas), covered_knowledge_count=studied,
                          legacy_exam_cover=has_legacy_exam_cover(courses[game_id][1]),
                          campaign_story=state.campaign_story, story_marks=state.story_marks, story_ending=state.story_ending,
                          field_signals=state.field_signals, companions=companions.roster(state), tower=tower.projection(state, courses),
                          session_id=state.session_id, veteran=state.veteran, inherited_relic_id=state.inherited_relic_id,
                          bounty_seals=seals, revision=state.revision, phase=state.phase,
                          region_index=state.region_index, scene_index=state.scene_index, game_id=game_id,
                          chapter_count=sum(len(r.chapters) for r in atlas), cleared_chapters=_cleared_stops(state, path),
                          narrative=narrative, map=atlas, routes=_routes(state, courses) if state.phase == "route" else [],
                          rewards=_reward_choices(state, courses) if state.phase == "reward" else [],
                          player=_player(state, battle), battle=battle if state.phase in {"combat", "sidequest", "reward", "victory"} else None,
                          coins=state.coins, edge_ranks=state.edge_ranks, plating_ranks=state.plating_ranks,
                          forge_rank_limit=expedition_combat.FORGE_CAP, relics=_held_relics(state), relic_slot_limit=RELIC_SLOTS,
                          journal=state.journal)


def report(state: ExpeditionState, courses: Courses) -> ExpeditionReport:
    courses = playable_courses(courses, state.excluded_cards)
    if state.phase not in {"retreated", "victory"}:
        raise BattleError(409, "远征通关或撤离后可查看战报。")
    path = itinerary(state, courses)
    regions = {gid: i for i, stops in enumerate(path) for gid, _ in stops}
    volumes = list(state.completed_volumes)
    for index in range(len(volumes), len(state.game_ids)):
        game_id = state.game_ids[index]
        has_progress = state.route_id is not None or state.battle.cleared_stages > 0
        fought = state.battle if game_id == state.battle.game_id and has_progress else None
        volumes.append(_volume_study(regions[game_id], game_id, courses[game_id], fought,
                                    "retreated" if fought else "unvisited"))
    rows = [concept for volume in volumes for concept in volume.concepts]
    first = [row.first_attempt_correct for row in rows if row.first_attempt_correct is not None]
    attempts, hits = sum(c.combat_attempts for c in rows), sum(c.combat_correct for c in rows)
    reviews, solved = sum(c.review_attempts for c in rows), sum(c.review_correct for c in rows)
    chapters = sum(max(1, len(stops)) for stops in path)
    cleared = _cleared_stops(state, path)
    player = _player(state, battle_rules.view(state.battle, *courses[state.battle.game_id]))
    return ExpeditionReport(story_marks=state.story_marks, story_ending=state.story_ending,
                            session_id=state.session_id, veteran=state.veteran, inherited_relic_id=state.inherited_relic_id,
                            bounty_seals=_bounty_seals(state, path, courses), outcome=state.phase, chapter_count=chapters,
                            cleared_chapters=cleared, completed_volumes=len(state.completed_volumes),
                            completion_rate=cleared / chapters, volumes=volumes,
                            defeats=sum(v.defeats for v in volumes),
                            sidequests_completed=sum(v.sidequests_completed for v in volumes),
                            combat_attempts=attempts, combat_correct=hits, combat_accuracy=hits / attempts if attempts else None,
                            first_attempt_accuracy=sum(first) / len(first) if first else None,
                            review_attempts=reviews, review_correct=solved, review_accuracy=solved / reviews if reviews else None,
                            player=player, relics=_held_relics(state), relic_slot_limit=RELIC_SLOTS,
                            coins=state.coins, edge_ranks=state.edge_ranks, plating_ranks=state.plating_ranks,
                            forge_rank_limit=expedition_combat.FORGE_CAP, journal=state.journal)
