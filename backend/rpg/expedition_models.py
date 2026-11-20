"""Wire data and private continuation for a multi-volume expedition."""

from typing import Annotated, Literal

from pydantic import Field

from ..models import Count, Identifier, Rate, StrictModel
from .battle_models import BattleState, BattleView, Equip, ExpeditionAnswer, Hint, PlayerView, Retreat
from .battle_reports import BattleConcept
from .companions import CompanionId, CompanionView
from .expedition_combat import ForgeRank, tower_health
from .expedition_world import RelicSpec, RouteSpec
from .hero_catalog import ClassId, KitId
from .models import Description, ShortText

ExpeditionPhase = Literal["route", "combat", "sidequest", "reward", "victory", "retreated"]


class ChooseRoute(StrictModel):
    action: Literal["choose_route"]
    event_id: Identifier
    expected_revision: Count
    route_id: Identifier


class InspectLandmark(StrictModel):
    action: Literal["inspect_landmark"]
    event_id: Identifier
    expected_revision: Count


class ChooseReward(StrictModel):
    action: Literal["choose_reward"]
    event_id: Identifier
    expected_revision: Count
    reward_id: Identifier
    replace_relic_id: Identifier | None = None


class StoryChoice(StrictModel):
    action: Literal["story_choice"]
    event_id: Identifier
    expected_revision: Count
    choice: Identifier


class PartyCommand(StrictModel):
    action: Literal["recruit_companion", "assign_companion"]
    event_id: Identifier
    expected_revision: Count
    companion_id: CompanionId


class TowerCommand(StrictModel):
    action: Literal["tower_enter"]
    event_id: Identifier
    expected_revision: Count


class TowerAnswer(ExpeditionAnswer):
    action: Literal["tower_answer"]


class TowerHint(Hint):
    action: Literal["tower_hint"]


class TowerEquip(Equip):
    action: Literal["tower_equip"]


ExpeditionAction = Annotated[ChooseRoute | ExpeditionAnswer | Hint | Equip | ChooseReward | Retreat |
                             PartyCommand | StoryChoice | TowerCommand | TowerAnswer | TowerHint | TowerEquip | InspectLandmark,
                             Field(discriminator="action")]


class RewardChoice(StrictModel):
    id: Identifier
    kind: Literal["rest", "purse", "relic", "forge"]
    name: ShortText
    description: Description
    cost: Count = 0
    affordable: bool = True
    requires_replacement: bool = False
    heal: Count = 0
    coins: Count = 0
    relic: RelicSpec | None = None


class HeldRelic(StrictModel):
    relic: RelicSpec
    stacks: Count


class BountySeal(StrictModel):
    region_id: Identifier
    region_name: ShortText
    boss_id: Identifier


class Visit(StrictModel):
    game_id: Identifier
    scene_id: Identifier
    route_id: Identifier
    encounter_id: Identifier
    coins_earned: Count
    reward_id: Identifier | None = None
    replaced_relic_id: Identifier | None = None
    replaced_stacks: Count = 0


class VolumeStudy(StrictModel):
    game_id: Identifier
    title: ShortText
    region_id: Identifier
    outcome: Literal["victory", "retreated", "unvisited"]
    chapters: Count
    cleared_chapters: Count
    defeats: Count
    sidequests_completed: Count
    concepts: list[BattleConcept]


TowerPhase = Literal["idle", "combat", "sidequest", "cleared"]


class TowerState(StrictModel):
    floor: Count = 0
    best_floor: Count = 0
    phase: TowerPhase = "idle"
    battle: BattleState | None = None


class TowerView(StrictModel):
    floor: Count = 0
    best_floor: Count = 0
    phase: TowerPhase = "idle"
    region_id: str = ""
    next_guardian_hp: Count = tower_health(1)
    chain_target: Count = 1
    question_mode: Literal["recognition", "recall", "paired", "synthesis"] = "recognition"
    difficulty: Count = 0
    battle: BattleView | None = None


class ExpeditionState(StrictModel):
    campaign_story: bool = False
    story_marks: dict[Identifier, Identifier] = Field(default_factory=dict)
    story_ending: Literal["shatter_crown", "keep_watch", "wake_towns"] | None = None
    session_id: Identifier
    game_ids: list[Identifier] = Field(min_length=1, max_length=8)
    hero_class: ClassId
    kit: KitId
    veteran: bool = False
    inherited_relic_id: Identifier | None = None
    revision: Count = 0
    phase: ExpeditionPhase = "route"
    region_index: Count = 0
    scene_index: Count = 0
    route_id: Identifier | None = None
    coins: Count = 0
    edge_ranks: ForgeRank = 0
    plating_ranks: ForgeRank = 0
    relic_ids: list[Identifier] = Field(default_factory=list)
    journal: list[Visit] = Field(default_factory=list)
    completed_volumes: list[VolumeStudy] = Field(default_factory=list)
    battle: BattleState
    field_signals: list[Identifier] = Field(default_factory=list)
    bonds: dict[CompanionId, Count] = Field(default_factory=dict)
    active_companion: CompanionId | None = None
    tower: TowerState = Field(default_factory=TowerState)


class ChapterMap(StrictModel):
    scene_id: Identifier
    name: ShortText
    objective: Description
    status: Literal["locked", "available", "active", "cleared", "abandoned"]
    boss: bool
    route_id: Identifier | None = None


class RegionMap(StrictModel):
    region_id: Identifier
    name: ShortText
    game_id: Identifier
    course_title: ShortText
    chapters: list[ChapterMap]


class ExpeditionView(StrictModel):
    legacy_exam_cover: bool = False
    campaign_story: bool = False
    story_marks: dict[Identifier, Identifier] = Field(default_factory=dict)
    story_ending: Literal["shatter_crown", "keep_watch", "wake_towns"] | None = None
    field_signals: list[Identifier] = Field(default_factory=list)
    companions: list[CompanionView] = Field(default_factory=list)
    tower: TowerView = Field(default_factory=TowerView)
    session_id: Identifier
    veteran: bool
    inherited_relic_id: Identifier | None
    bounty_seals: list[BountySeal]
    revision: Count
    phase: ExpeditionPhase
    region_index: Count
    scene_index: Count
    game_id: Identifier
    chapter_count: Count
    cleared_chapters: Count
    narrative: Description
    map: list[RegionMap]
    routes: list[RouteSpec]
    rewards: list[RewardChoice]
    player: PlayerView
    battle: BattleView | None
    coins: Count
    edge_ranks: Count
    plating_ranks: Count
    forge_rank_limit: Count
    relics: list[HeldRelic]
    relic_slot_limit: Count
    journal: list[Visit]


class ExpeditionReport(StrictModel):
    story_marks: dict[Identifier, Identifier] = Field(default_factory=dict)
    story_ending: Literal["shatter_crown", "keep_watch", "wake_towns"] | None = None
    session_id: Identifier
    veteran: bool
    inherited_relic_id: Identifier | None
    bounty_seals: list[BountySeal]
    outcome: Literal["victory", "retreated"]
    chapter_count: Count
    cleared_chapters: Count
    completed_volumes: Count
    completion_rate: Rate
    defeats: Count
    sidequests_completed: Count
    combat_attempts: Count
    combat_correct: Count
    combat_accuracy: Rate | None
    first_attempt_accuracy: Rate | None
    review_attempts: Count
    review_correct: Count
    review_accuracy: Rate | None
    volumes: list[VolumeStudy]
    player: PlayerView
    coins: Count
    edge_ranks: Count
    plating_ranks: Count
    forge_rank_limit: Count
    relics: list[HeldRelic]
    relic_slot_limit: Count
    journal: list[Visit]
