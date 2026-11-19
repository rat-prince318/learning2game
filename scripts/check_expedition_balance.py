"""Simulate 24 full-size expeditions. Run python -m scripts.check_expedition_balance."""

from collections import Counter
from dataclasses import dataclass
from itertools import product
from pathlib import Path
from time import perf_counter

from backend.material_adapter import extract_material
from backend.rpg import expedition
from backend.rpg.battle_content import active_exam
from backend.rpg.battle_models import ExpeditionAnswer
from backend.rpg.battle_rules import BattleError
from backend.rpg.expedition_models import ChooseReward, ChooseRoute
from backend.rpg.expedition_world import encounter_for, relic_bonuses
from backend.rpg.hero_catalog import LEVEL_THRESHOLDS, catalog, class_info, stats_for
from backend.rpg.models import RPGPreferences
from backend.rpg.service import RPGService


def course_books():
    source = Path(__file__).resolve().parents[1] / "docs/rpg-fixtures/expedition/computing-course.txt"
    knowledge = extract_material(source).knowledge
    assert len(knowledge) == len({k.knowledge_id for k in knowledge}) == 64
    service = RPGService()
    result = {}
    for offset in range(0, 64, 8):
        selected = [k.knowledge_id for k in knowledge[offset:offset + 8]]
        pref = RPGPreferences(challenge_count=8, scene_count=4, selected_knowledge_ids=selected)
        plan = service.plan_rpg(knowledge, pref)
        game = service.generate_rpg(knowledge, plan)
        assert [q.knowledge_id for s in game.scenes for q in s.challenges] == selected
        result[f"volume-{offset // 8 + 1}"] = game, knowledge
    return result


def build_value(items, player, approach):
    b = relic_bonuses(items)
    # A first-turn spell is valuable on the arcanist; a ranger fills its gauge
    # on one strike. Safe builds favor recovery, daring builds breaking an elite.
    offense = {"arcanist": (2, .40, 6), "ranger": (4, .15, 3), "vanguard": (3, .18, 7)}
    attack, burst, focus = offense[player.hero_class]
    value = attack * b.attack + burst * b.burst_percent + focus * min(player.focus_max, b.opening_focus)
    if approach == "steady":
        return value + 2 * b.break_power + 3 * b.heal_on_win + 2 * b.defense + b.guard - 2 * b.counter
    return value + 7 * b.break_power + b.heal_on_win + b.defense + b.guard - 2 * b.counter


def choose_reward(public, approach):
    for reward in public.rewards:
        if reward.kind == "rest" and public.player.hp * 2 < public.player.max_hp:
            return reward, None
    items = [r.relic.id for r in public.relics for _ in range(r.stacks)]
    best = next(r for r in public.rewards if r.kind == "purse"), None
    best_value = build_value(items, public.player, approach)
    for reward in public.rewards:
        if reward.kind != "relic" or not reward.affordable:
            continue
        trade_ins = [r.relic.id for r in public.relics] if reward.requires_replacement else [None]
        for removed in trade_ins:
            updated = [i for i in items if i != removed] + [reward.relic.id]
            value = build_value(updated, public.player, approach)
            if value > best_value:
                best, best_value = (reward, removed), value
    if best[0].kind == "purse":
        # Forge when the day's relics do not improve this build. A safe route
        # reserves more refinements for armor; low-HP classes benefit earlier.
        defense_share = {"arcanist": .35, "ranger": .40, "vanguard": .15}[public.player.hero_class]
        if approach == "steady":
            defense_share += .15
        next_rank = public.edge_ranks + public.plating_ranks + 1
        preference = "forge_plating" if public.plating_ranks < round(next_rank * defense_share) else "forge_edge"
        for reward in public.rewards:
            if reward.id == preference and reward.affordable:
                return reward, None
    return best


def choose_skill(public):
    tactics = public.battle.tactics
    if tactics.intent.id in {"charge", "heavy"}:
        return "guard"
    if tactics.strike_exposure >= public.player.hp and tactics.guard_exposure < public.player.hp:
        return "guard"
    return "burst" if public.player.burst_ready else "strike"


@dataclass
class Result:
    turns: int
    hp: int
    level: int
    xp: int
    coins: int
    relic_stacks: int
    defeats: int
    breaks: int
    swaps: int
    forges: int
    build: tuple[str, ...]


def simulate(courses, job, kit, approach, veteran, inherited):
    state = expedition.new_expedition("balance", courses, job, kit, veteran=veteran,
                                      inherited_relic_id=inherited)
    # Every build deliberately loses exactly once in the second region. Continue
    # answering normally after review; a second defeat indicates a balance risk.
    recovery_started = False
    turns = breaks = swaps = purse_minus_purchases = 0
    edge = plating = 0
    holdings = Counter([inherited] if inherited else [])
    for _ in range(1500):
        public = expedition.view(state, courses)
        assert {r.relic.id: r.stacks for r in public.relics} == dict(holdings)
        assert len(holdings) <= public.relic_slot_limit == 4
        assert (edge, plating) == (public.edge_ranks, public.plating_ranks)
        assert edge + plating <= 8
        fields = {"expected_revision": state.revision, "event_id": f"cmd-{state.revision}"}
        if public.phase == "victory":
            break
        if public.phase == "route":
            route = next(r for r in public.routes if r.approach == approach)
            action = ChooseRoute(action="choose_route", route_id=route.id, **fields)
        elif public.phase == "reward":
            reward, removed = choose_reward(public, approach)
            action = ChooseReward(action="choose_reward", reward_id=reward.id,
                                  replace_relic_id=removed, **fields)
            purse_minus_purchases += reward.coins - reward.cost
        else:
            # Private answer IDs are used exclusively to mark correct/incorrect
            # responses. The tactical policy sees exactly the public hero and intent.
            exam = active_exam(state.battle, *courses[public.game_id])
            assert exam.prompt.prompt_id == public.battle.prompt.prompt_id
            option = exam.answer_id
            skill = "strike"
            if public.phase == "combat":
                turns += 1
                skill = choose_skill(public)
                if public.region_index == 1 and not recovery_started:
                    option = next(o.id for o in public.battle.prompt.options if o.id != exam.answer_id)
                    skill = "strike"
            else:
                recovery_started = True
            action = ExpeditionAnswer(action="answer", prompt_id=public.battle.prompt.prompt_id,
                                      option_id=option, skill=skill, **fields)
        state = expedition.advance(state, action, courses)
        if action.action == "answer":
            event = state.battle.last_event
            breaks += int(bool(event.tactics and event.tactics.broke_shield))
            if event.kind in {"defeat", "recovered"}:
                assert state.coins == public.coins and state.battle.xp == public.player.xp
                assert state.battle.inventory_ids == [gear.id for gear in public.player.inventory]
                assert len(state.journal) == public.cleared_chapters
        if public.phase == "reward":
            visit = state.journal[-1]
            assert visit.replaced_relic_id == removed
            if removed:
                assert visit.replaced_stacks == holdings.pop(removed)
                swaps += 1
            if reward.relic:
                holdings[reward.relic.id] += 1
            if reward.kind == "forge":
                assert reward.cost == 7 + 4 * (edge + plating)
                edge += int(reward.id == "forge_edge")
                plating += int(reward.id == "forge_plating")
            # A replay against the new revision must not settle the camp a second time.
            try:
                expedition.advance(state, action, courses)
            except BattleError as error:
                assert error.status_code == 409
            else:
                raise AssertionError("A reward settled twice")
    else:
        raise AssertionError(f"Over 1500 actions: {job} {kit} {approach} veteran={veteran}")

    report = expedition.report(state, courses)
    assert report.completed_volumes == len(courses) and report.completion_rate == 1
    assert len(report.journal) == len({(v.game_id, v.scene_id) for v in report.journal}) == 32
    tiers = Counter(encounter_for(v.encounter_id).tier for v in report.journal)
    assert tiers["boss"] == 8 and tiers["elite" if approach == "daring" else "normal"] == 24
    assert len({v.encounter_id for v in report.journal if encounter_for(v.encounter_id).tier == "boss"}) == 8
    assert len(report.bounty_seals) == (8 if approach == "daring" else 0)
    assert report.coins == sum(v.coins_earned for v in report.journal) + purse_minus_purchases
    rows = [c for book in report.volumes for c in book.concepts]
    assert len({c.knowledge_id for c in rows if c.combat_correct and c.source_ref}) == 64
    assert recovery_started and report.sidequests_completed == report.defeats == 1
    assert report.review_correct == report.review_attempts >= 1
    assert len(report.player.inventory) == len({g.id for g in report.player.inventory})
    assert all(r.stacks <= r.relic.max_stacks for r in report.relics)
    hero = report.player
    base = stats_for(job, hero.xp, hero.loadout)
    extra = max(0, hero.level - len(LEVEL_THRESHOLDS))
    growth = class_info(job)
    modifiers = relic_bonuses(list(holdings.elements()))
    assert (edge, plating) == (report.edge_ranks, report.plating_ranks)
    assert edge > 0 and plating > 0
    assert hero.attack == max(1, base.attack + extra * growth.attack_growth + modifiers.attack + 2 * edge)
    assert hero.stats.defense == max(0, base.defense + extra * growth.defense_growth + modifiers.defense + 2 * plating)
    assert hero.stats.burst_percent == max(100, base.burst_percent + modifiers.burst_percent)
    assert swaps and len(holdings) == 4
    result = Result(turns, report.player.hp, report.player.level, report.player.xp, report.coins,
                    sum(holdings.values()), report.defeats, breaks, swaps, edge + plating, tuple(sorted(holdings)))
    return result, report.relics[0].relic.id


def main():
    started = perf_counter()
    courses = course_books()
    roster = catalog()
    print("class     kit    route   veteran turns HP  level  XP   coins stacks losses breaks swaps forges")
    results = []
    for job, kit, approach in product(roster.classes, roster.kits, ("steady", "daring")):
        inherited = None
        for veteran in (False, True):
            result, inherited = simulate(courses, job.id, kit.id, approach, veteran, inherited)
            results.append(result)
            print(f"{job.id:9} {kit.id:6} {approach:7} {str(veteran):7} {result.turns:4} "
                  f"{result.hp:3} {result.level:4} {result.xp:5} {result.coins:5} "
                  f"{result.relic_stacks:5} {result.defeats:5} {result.breaks:6} {result.swaps:5} {result.forges:6}")
    builds = {r.build for r in results}
    assert len(builds) > 1
    print(f"{len(results)} victories, {len(courses)} books, 64 sourced concepts, 32 chapters per run; "
          f"{sum(r.defeats for r in results)} recoveries, {len(builds)} distinct final builds, "
          f"{sum(r.swaps for r in results)} slot trades, {sum(r.forges for r in results)} refinements, "
          f"{min(r.coins for r in results)}-{max(r.coins for r in results)} remaining coins, "
          f"max level {max(r.level for r in results)}, "
          f"{perf_counter() - started:.1f}s.")


if __name__ == "__main__":
    main()
