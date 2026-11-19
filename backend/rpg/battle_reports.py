"""Source-linked results for completed or retired battle campaigns."""

from typing import Literal

from pydantic import Field, TypeAdapter, ValidationError

from ..models import Count, Identifier, KnowledgeItem, Rate, StrictModel
from .battle_models import BattleState, BattleTally
from .hero_catalog import ClassId, Gear, HeroStats, KitId, Loadout, equipment, level_for_xp, stats_for
from .models import Explanation, ReferenceText, RPGGameInternal, TermText

_term = TypeAdapter(TermText)


class BattleConcept(StrictModel):
    knowledge_id: Identifier
    scene_id: Identifier
    term: TermText
    explanation: Explanation
    source_ref: ReferenceText
    combat_attempts: Count
    combat_correct: Count
    combat_mistakes: Count
    first_attempt_correct: bool | None
    hints: Count
    review_attempts: Count
    review_correct: Count
    review_hints: Count


class BattleReport(StrictModel):
    session_id: Identifier
    game_id: Identifier
    outcome: Literal["victory", "retreated"]
    total_stages: Count
    cleared_stages: Count
    completion_rate: Rate
    defeats: Count
    sidequests_completed: Count
    xp: Count
    level: Count
    equipped_id: Identifier
    hero_class: ClassId = "arcanist"
    # Archived reports without a build snapshot keep their original level and XP.
    kit: KitId | None = None
    loadout: Loadout | None = None
    stats: HeroStats | None = None
    drops: list[Gear]
    combat_attempts: Count
    combat_correct: Count
    combat_accuracy: Rate | None
    first_attempt_accuracy: Rate | None
    hints: Count
    review_attempts: Count
    review_correct: Count
    review_hints: Count
    review_accuracy: Rate | None
    weak_knowledge_ids: list[Identifier]
    untouched_knowledge_ids: list[Identifier]
    concepts: list[BattleConcept] = Field(min_length=1, max_length=8)


def build_report(state: BattleState, game: RPGGameInternal, knowledge: list[KnowledgeItem]) -> BattleReport:
    """Read the frozen action tallies. Every chapter retry retains its earlier attempts."""
    if state.phase not in {"victory", "retreated"}:
        raise ValueError("Battle reports require a terminal campaign.")

    terms = {item.knowledge_id: item.term for item in knowledge}
    concepts = []
    for scene in game.scenes:
        for question in scene.challenges:
            kid = question.knowledge_id
            tally = state.concepts.get(kid, BattleTally())
            # Material adapters accept richer text than the game's plain-text recap.
            try:
                term = _term.validate_python(terms.get(kid))
            except ValidationError:
                term = f"知识点 {len(concepts) + 1}"
            concepts.append(BattleConcept(
                knowledge_id=kid, scene_id=scene.scene_id, term=term,
                source_ref=question.source_ref, explanation=question.explanation,
                combat_attempts=tally.combat_attempts, combat_correct=tally.combat_correct,
                combat_mistakes=tally.combat_attempts - tally.combat_correct,
                first_attempt_correct=tally.first_attempt_correct, hints=tally.hints,
                review_attempts=tally.review_attempts, review_correct=tally.review_correct,
                review_hints=tally.review_hints,
            ))

    attempted = [concept for concept in concepts if concept.combat_attempts]
    first_correct = sum(concept.first_attempt_correct is True for concept in attempted)
    attacks = sum(c.combat_attempts for c in concepts)
    hits = sum(c.combat_correct for c in concepts)
    reviews = sum(c.review_attempts for c in concepts)
    reviews_correct = sum(c.review_correct for c in concepts)
    return BattleReport(
        session_id=state.session_id, game_id=state.game_id, outcome=state.phase,
        total_stages=len(game.scenes), cleared_stages=state.cleared_stages,
        completion_rate=state.cleared_stages / len(game.scenes),
        defeats=state.defeats, sidequests_completed=state.sidequests_completed,
        xp=state.xp, level=level_for_xp(state.xp), equipped_id=state.equipped_id,
        hero_class=state.hero_class, kit=state.kit, loadout=state.loadout,
        stats=stats_for(state.hero_class, state.xp, state.loadout),
        drops=[equipment(item_id) for item_id in state.earned_item_ids],
        combat_attempts=attacks, combat_correct=hits, combat_accuracy=hits / attacks if attacks else None,
        first_attempt_accuracy=first_correct / len(attempted) if attempted else None,
        hints=sum(c.hints for c in concepts),
        review_attempts=reviews, review_correct=reviews_correct, review_hints=sum(c.review_hints for c in concepts),
        review_accuracy=reviews_correct / reviews if reviews else None,
        weak_knowledge_ids=[c.knowledge_id for c in concepts
                            if c.combat_mistakes or c.hints or c.review_correct < c.review_attempts],
        untouched_knowledge_ids=[c.knowledge_id for c in concepts
                                 if not (c.combat_attempts or c.hints or c.review_attempts or c.review_hints)],
        concepts=concepts,
    )
