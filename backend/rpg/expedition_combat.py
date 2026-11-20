"""Deterministic tactics for long expeditions. All timing is driven by answered questions."""

from bisect import bisect_right
from dataclasses import dataclass
from typing import Annotated, Literal

from pydantic import Field, model_validator

from ..models import Count, Identifier, StrictModel
from . import expedition_world as world
from .companions import CompanionId
from .hero_catalog import LEVEL_THRESHOLDS, HeroStats, class_info, stats_for
from .models import Description, ShortText

Skill = Literal["strike", "burst", "guard"]
FORGE_CAP = 8
ForgeRank = Annotated[int, Field(strict=True, ge=0, le=FORGE_CAP)]
# Preserve the short campaign's first six levels. Later steps get progressively
# longer so a hero continues growing across the eight course regions.
EXPEDITION_LEVELS = (*LEVEL_THRESHOLDS, 270, 345, 430, 525, 630, 745, 870, 1005,
                     1150, 1305, 1470, 1645, 1830, 2025)


def level_for_xp(xp: int) -> int:
    return bisect_right(EXPEDITION_LEVELS, xp)


def xp_to_next_level(xp: int) -> int:
    level = level_for_xp(xp)
    return EXPEDITION_LEVELS[level] - xp if level < len(EXPEDITION_LEVELS) else 0


class EncounterState(StrictModel):
    encounter_id: Identifier
    region_index: Count
    veteran: bool = False
    edge_ranks: ForgeRank = 0
    plating_ranks: ForgeRank = 0
    relic_ids: list[Identifier] = Field(default_factory=list)
    tower_floor: Count = 0
    companion_id: CompanionId | None = None
    companion_level: Count = 0
    turn: Count = 0
    pattern_index: Count = 0
    phase: Literal[1, 2] = 1
    shield: Count = 0
    broken: bool = False
    charged: bool = False

    @model_validator(mode="after")
    def check_total_refinements(self):
        if self.edge_ranks + self.plating_ranks > FORGE_CAP:
            raise ValueError("本轮锻造总和超出上限。")
        return self


class TacticsView(StrictModel):
    companion_id: CompanionId | None = None
    companion_level: Count = 0
    encounter_id: Identifier
    tier: Literal["normal", "elite", "boss"]
    veteran: bool
    edge_ranks: ForgeRank = 0
    plating_ranks: ForgeRank = 0
    trait_name: ShortText
    trait_description: Description
    turn: Count
    phase: Literal[1, 2]
    shield: Count
    shield_max: Count
    broken: bool
    charged: bool
    intent: world.IntentSpec | None
    # Damage on a correct response if the foe lives through the attack.
    strike_exposure: Count
    guard_exposure: Count


class TurnResult(StrictModel):
    encounter_id: Identifier
    intent: Identifier
    broke_shield: bool
    exploited_break: bool
    intercepted_charge: bool
    phase_changed: bool = False


def effective_stats(state, relic_ids, edge_ranks, plating_ranks) -> HeroStats:
    stats = stats_for(state.hero_class, state.xp, state.loadout)
    hero = class_info(state.hero_class)
    bonus = world.relic_bonuses(relic_ids)
    extra_levels = max(0, level_for_xp(state.xp) - len(LEVEL_THRESHOLDS))
    stats.max_hp += hero.hp_growth * extra_levels
    stats.attack = max(1, stats.attack + hero.attack_growth * extra_levels + bonus.attack + 2 * edge_ranks)
    stats.defense = max(0, stats.defense + hero.defense_growth * extra_levels + bonus.defense + 2 * plating_ranks)
    stats.burst_percent = max(100, stats.burst_percent + bonus.burst_percent)
    return stats


def tower_health(floor):
    return 50 + 11 * floor + floor * floor // 15


def tower_chain(floor):
    # An extra linked solution every three floors. There is always another floor.
    return 1 + (floor - 1) // 3


def unit_health(ctx: EncounterState, stage_index: int) -> int:
    spec = world.encounter_for(ctx.encounter_id)
    base = (25, 29, 34, 40)[stage_index] + 7 * ctx.region_index
    if ctx.veteran:
        base = (base * 115 + 99) // 100
    return max(12, base * spec.health_percent // 100)


def veteran_edge(ctx, spec):
    return int(ctx.veteran and spec.tier in ("elite", "boss"))


def reset(ctx: EncounterState) -> None:
    spec = world.encounter_for(ctx.encounter_id)
    ctx.turn = 0
    ctx.pattern_index = veteran_edge(ctx, spec)
    ctx.phase = 1
    ctx.broken = ctx.charged = False
    ctx.shield = spec.shield + veteran_edge(ctx, spec)


def current_intent(ctx, spec):
    if ctx.broken:
        return "expose"
    cycle = spec.enraged_intents if ctx.phase == 2 else spec.intents
    return cycle[ctx.pattern_index % len(cycle)]


@dataclass(frozen=True)
class Exchange:
    power: int
    raw: int
    damage: int
    poise_loss: int
    breaks: bool
    interrupted: bool
    intent: str


def exchange(ctx, stats, stage_index, correct, skill, power):
    """Preview one exchange without mutating a turn; used by both view and resolve."""
    spec = world.encounter_for(ctx.encounter_id)
    intent = current_intent(ctx, spec)
    bonus = world.relic_bonuses(ctx.relic_ids)
    trait = world.trait_bonuses(ctx.encounter_id, intent_id=intent, turn=ctx.turn,
                                enraged=ctx.phase == 2, skill=skill)
    parry = skill == "guard" and correct
    counter_stance = parry and intent in ("heavy", "charge")
    poise_loss = 0
    if correct and not ctx.broken:
        base = 3 if counter_stance else 2 if skill == "burst" else 1
        if intent == "ward" and skill != "burst":
            base = 0
        poise_loss = min(ctx.shield, max(0, base + bonus.break_power + trait.break_power))
    breaks = ctx.shield > 0 and poise_loss == ctx.shield

    if correct:
        power = max(2, power + trait.incoming)
        if skill == "guard":
            power = max(2, power * (75 if counter_stance else 50) // 100)
        if intent == "expose":
            power = power * 3 // 2
        elif intent == "ward" and skill != "burst":
            power = max(2, power // 2)
        elif ctx.shield:
            power = max(2, power * 4 // 5)
    else:
        power = 0

    # A wrong response normally invites a counter even while the foe braces.
    # An answered guard intercepts a heavy blow, including a charged blow.
    strength = 9 + stage_index * 2 + ctx.region_index * 2 + (3 if ctx.veteran else 0)
    if ctx.tower_floor:
        strength = 8 + ctx.tower_floor * 2
    raw = {"strike": (strength + 1) // 2, "heavy": strength + 5,
           "ward": 0, "charge": 0, "expose": 0}[intent]
    if not correct:
        raw = max(raw, strength)
    if raw:
        raw = max(1, raw + trait.outgoing + bonus.counter)
        if ctx.charged and intent in ("strike", "heavy"):
            raw = raw * 3 // 2
    divisor = 10 + stats.defense
    damage = (raw * 10 + divisor - 1) // divisor
    if breaks or (parry and intent == "heavy"):
        damage = 0
    elif parry:
        damage = max(0, damage - max(0, 4 + bonus.guard))
    if correct and ctx.companion_id == "reed":
        damage = max(0, damage - (1 + ctx.companion_level))
    return Exchange(power, raw, damage, poise_loss, breaks, counter_stance and intent == "charge", intent)


def apply_exchange(ctx, attack: Exchange, hp: int, maximum: int):
    spec = world.encounter_for(ctx.encounter_id)
    feedback = TurnResult(encounter_id=ctx.encounter_id, intent=attack.intent, broke_shield=attack.breaks,
                          exploited_break=ctx.broken and attack.power > 0, intercepted_charge=attack.interrupted)
    ctx.turn += 1
    if ctx.broken:
        ctx.broken = False
        ctx.shield = spec.shield + veteran_edge(ctx, spec)
    else:
        ctx.pattern_index += 1
        ctx.shield -= attack.poise_loss
        ctx.broken = attack.breaks
    if attack.intent == "charge":
        ctx.charged = not attack.interrupted and not attack.breaks
    elif attack.intent in ("strike", "heavy") or attack.breaks:
        ctx.charged = False
    if ctx.phase == 1 and 0 < hp <= maximum // 2:
        ctx.phase = 2
        ctx.pattern_index = veteran_edge(ctx, spec)
        feedback.phase_changed = True
    return feedback


def tactics_view(state, stats):
    ctx = state.expedition
    spec = world.encounter_for(ctx.encounter_id)
    playing = state.phase == "combat"
    strike = exchange(ctx, stats, state.stage_index, True, "strike", stats.attack) if playing else None
    guard = exchange(ctx, stats, state.stage_index, True, "guard", stats.attack) if playing else None
    return TacticsView(encounter_id=spec.id, tier=spec.tier, veteran=ctx.veteran,
                       companion_id=ctx.companion_id, companion_level=ctx.companion_level if ctx.companion_id else 0,
                       edge_ranks=ctx.edge_ranks, plating_ranks=ctx.plating_ranks, trait_name=spec.trait_name,
                       trait_description=spec.trait_description, turn=ctx.turn + 1,
                       phase=ctx.phase, shield=ctx.shield, shield_max=spec.shield + veteran_edge(ctx, spec),
                       broken=ctx.broken,
                       charged=ctx.charged, intent=world.intent_for(strike.intent) if strike else None,
                       strike_exposure=min(state.hp, strike.damage) if strike else 0,
                       guard_exposure=min(state.hp, guard.damage) if guard else 0)
