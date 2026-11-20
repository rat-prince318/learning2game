"""Versioned save and player-facing wire types for a solo study campaign."""

from typing import Annotated, Literal

from pydantic import Field, model_validator

from ..models import Count, Identifier, StrictModel
from .companions import PartnerAssist
from .expedition_combat import EncounterState, Skill, TacticsView, TurnResult
from .hero_catalog import ClassId, Gear, HeroStats, KitId, Loadout, class_info, stats_for
from .models import Description, ReferenceText, ShortText, StudyFeedback

Phase = Literal["combat", "sidequest", "stage_clear", "victory", "retreated"]


class _Command(StrictModel):
    event_id: Identifier
    expected_revision: Count


class Answer(_Command):
    action: Literal["answer"]
    prompt_id: Identifier
    option_id: Identifier
    skill: Literal["strike", "burst"] = "strike"


class ExpeditionAnswer(Answer):
    skill: Skill = "strike"


class Hint(_Command):
    action: Literal["hint"]
    prompt_id: Identifier


class NextStage(_Command):
    action: Literal["next_stage"]


class Equip(_Command):
    action: Literal["equip"]
    item_id: Identifier


class Retreat(_Command):
    action: Literal["retreat"]


BattleAction = Annotated[Answer | Hint | NextStage | Equip | Retreat, Field(discriminator="action")]


class BattleTally(StrictModel):
    combat_attempts: Count = 0
    combat_correct: Count = 0
    first_attempt_correct: bool | None = None
    hints: Count = 0
    review_hints: Count = 0
    review_attempts: Count = 0
    review_correct: Count = 0


class BattleEvent(StrictModel):
    kind: Literal["hit", "miss", "defeat", "stage_clear", "victory", "review_correct", "review_wrong",
                  "recovered", "hint", "equip", "next_stage", "retreat"]
    message: Description
    correct: bool | None = None
    damage_dealt: Count = 0
    damage_received: Count = 0
    critical: bool = False
    skill: Skill | None = None
    tactics: TurnResult | None = None
    xp_gained: Count = 0
    levels_gained: Count = 0
    loot: Gear | None = None
    loot_items: list[Gear] = Field(default_factory=list)
    equipped_item: Gear | None = None
    hero_class: ClassId = "arcanist"
    partner_assist: PartnerAssist | None = None
    damage_blocked: Count = 0
    explanation: StudyFeedback | None = None
    source_ref: ReferenceText | None = None

    @model_validator(mode="before")
    @classmethod
    def restore_legacy_drop(cls, value):
        if isinstance(value, dict) and "loot_items" not in value and value.get("loot") is not None:
            return {**value, "loot_items": [value["loot"]]}
        return value


class BattleState(StrictModel):
    """Persist this trusted record, return only the projection below to the browser."""
    schema_version: Literal["1.0"] = "1.0"
    session_id: Identifier
    game_id: Identifier
    camp_key: Identifier
    phase: Phase = "combat"
    revision: Count = 0
    stage_index: Count = 0
    cleared_stages: Count = 0
    hp: Count
    enemy_hp: Count
    xp: Count = 0
    inventory_ids: list[Identifier]
    equipped_id: Identifier
    hero_class: ClassId = "arcanist"
    kit: KitId = "trail"
    loadout: Loadout
    earned_item_ids: list[Identifier] = Field(default_factory=list)
    combo: Count = 0
    focus: Count = 0
    prompt_serial: Count = 0
    hinted: bool = False
    # Pending concept checks must each be solved before a stage can be cleared.
    pending: list[Identifier]
    # Optional for saves written before question-specific retries were recorded.
    retry_ids: list[Identifier] | None = None
    finishing_turn: Count = 0
    missed_this_fight: list[Identifier] = Field(default_factory=list)
    review_queue: list[Identifier] = Field(default_factory=list)
    review_index: Count = 0
    defeats: Count = 0
    sidequests_completed: Count = 0
    concepts: dict[Identifier, BattleTally]
    last_event: BattleEvent | None = None
    prior_answer: BattleEvent | None = None
    expedition: EncounterState | None = None

    @model_validator(mode="before")
    @classmethod
    def restore_legacy_weapon_save(cls, value):
        # Original campaigns only had five arcanist staves. Preserve their inventory,
        # prompt and tally history; do not invent armor, accessories or past rewards.
        if isinstance(value, dict) and "loadout" not in value and "equipped_id" in value:
            value = dict(value)
            loadout = Loadout(weapon=value["equipped_id"])
            value["loadout"] = loadout
            unlocked = class_info("arcanist").weapon_ids[1:1 + value.get("cleared_stages", 0)]
            value["earned_item_ids"] = [i for i in unlocked if i in value.get("inventory_ids", [])]
            if "hp" in value:
                value["hp"] = min(value["hp"], stats_for("arcanist", value.get("xp", 0), loadout).max_hp)
        return value


class BattleOption(StrictModel):
    id: Identifier
    text: StudyFeedback


class BattlePrompt(StrictModel):
    prompt_id: Identifier
    text: StudyFeedback
    options: list[BattleOption] = Field(min_length=3, max_length=4)
    hint: StudyFeedback | None = None
    purpose: Literal["retry", "tower_practice", "finisher"] | None = None


class StageView(StrictModel):
    index: Count
    number: Count
    total: Count
    scene_id: Identifier
    name: ShortText
    objective: Description
    boss: bool


class EnemyView(StrictModel):
    name: ShortText
    hp: Count
    max_hp: Count
    boss: bool
    sprite: Literal["sprout", "moth", "golem", "warden"]
    enraged: bool


class PlayerView(StrictModel):
    hp: Count
    max_hp: Count
    level: Count
    xp: Count
    xp_to_next_level: Count
    attack: Count
    equipped_id: Identifier
    inventory: list[Gear]
    combo: Count
    focus: Count
    focus_max: Count
    burst_ready: bool
    hero_class: ClassId = "arcanist"
    kit: KitId | None = None
    loadout: Loadout
    stats: HeroStats | None = None

    @model_validator(mode="before")
    @classmethod
    def restore_legacy_receipt(cls, value):
        # A recorded turn is a receipt. Keep the original HP, level and damage
        # numbers when reading a receipt issued before classes and armor existed.
        if isinstance(value, dict) and "loadout" not in value and "equipped_id" in value:
            return {**value, "loadout": {"weapon": value["equipped_id"]}}
        return value


class StudyLesson(StrictModel):
    term: StudyFeedback
    definition: StudyFeedback
    source_ref: ReferenceText


class SideQuestView(StrictModel):
    title: ShortText
    completed: Count
    total: Count
    lesson: StudyLesson


class BattleView(StrictModel):
    schema_version: Literal["1.0"] = "1.0"
    session_id: Identifier
    game_id: Identifier
    title: ShortText
    phase: Phase
    revision: Count
    stage: StageView
    enemy: EnemyView
    player: PlayerView
    prompt: BattlePrompt | None
    sidequest: SideQuestView | None
    cleared_stages: Count
    defeats: Count
    sidequests_completed: Count
    last_event: BattleEvent | None
    prior_answer: BattleEvent | None = None
    tactics: TacticsView | None = None
