"""Shared contracts for the material, agent, game and reporting modules."""

import unicodedata
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid", str_strip_whitespace=True, allow_inf_nan=False,
        revalidate_instances="always",
    )


Identifier = Annotated[str, StringConstraints(min_length=1, max_length=128, pattern=r"^[^\s\x00-\x1f\x7f]+$")]
Title = Annotated[str, StringConstraints(min_length=1, max_length=160)]
CardText = Annotated[str, StringConstraints(min_length=1, max_length=2000)]
SourceRef = Annotated[str, StringConstraints(min_length=1, max_length=500)]
Difficulty = Literal["easy", "medium", "hard"]
LearningGoal = Literal["preview", "review", "classroom", "recognize", "distinguish"]
LearnerLevel = Literal["beginner", "familiar"]
PairCount = Annotated[int, Field(strict=True, ge=2, le=12)]
Count = Annotated[int, Field(strict=True, ge=0)]
Rate = Annotated[float, Field(ge=0, le=1)]


def _unique(values: list[str], field: str) -> None:
    if len(values) != len(set(values)):
        raise ValueError(f"{field} must contain distinct values")


def _display_key(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


class ExamWording(StrictModel):
    term: Title
    definition: Annotated[str, StringConstraints(min_length=4, max_length=500)]
    prompt: Annotated[str, StringConstraints(min_length=8, max_length=800)]
    options: list[Annotated[str, StringConstraints(min_length=1, max_length=200)]] = Field(min_length=3, max_length=4)
    hint: Annotated[str, StringConstraints(min_length=4, max_length=300)]
    explanation: Annotated[str, StringConstraints(min_length=4, max_length=1000)]


class ExamQuestion(StrictModel):
    zh: ExamWording
    en: ExamWording
    correct_index: int = Field(ge=0, le=3, strict=True)

    @model_validator(mode="after")
    def check_choices(self) -> Self:
        if len(self.zh.options) != len(self.en.options) or self.correct_index >= len(self.zh.options):
            raise ValueError("Exam translations must have aligned choices")
        for text in (self.zh, self.en):
            _unique([_display_key(option) for option in text.options], "Exam options")
        return self


class KnowledgeItem(StrictModel):
    knowledge_id: Identifier
    term: Title
    definition: CardText
    source_ref: SourceRef
    example: CardText | None = None
    knowledge_type: Title | None = None
    source_type: Title | None = None
    evidence: CardText | None = None
    source_ids: list[Identifier] = Field(default_factory=list, max_length=100)
    page: int | None = Field(default=None, ge=1)
    exam_question: ExamQuestion | None = None


MAX_MATERIAL_POINTS = 1000


class MaterialResult(StrictModel):
    needs_review_count: Count | None = None
    knowledge: list[KnowledgeItem] = Field(min_length=1, max_length=MAX_MATERIAL_POINTS)
    warnings: list[SourceRef] = Field(default_factory=list, max_length=24)

    @model_validator(mode="after")
    def distinct_items(self) -> Self:
        _unique([item.knowledge_id for item in self.knowledge], "knowledge_id")
        return self


class UserPreferences(StrictModel):
    question_language: Literal["zh", "en"] | None = None
    goal: LearningGoal = "review"
    learner_level: LearnerLevel = "beginner"
    difficulty: Difficulty = "medium"
    pair_count: PairCount = 6


class MatchingPlan(StrictModel):
    question_language: Literal["zh", "en"] | None = None
    title: Title
    goal: LearningGoal = "review"
    learner_level: LearnerLevel = "beginner"
    difficulty: Difficulty
    knowledge_ids: list[Identifier] = Field(min_length=2, max_length=12)
    relationship_type: Title = "auto"
    rationale: CardText | None = None
    warnings: list[SourceRef] = Field(default_factory=list, max_length=12)

    @model_validator(mode="after")
    def distinct_concepts(self) -> Self:
        _unique(self.knowledge_ids, "knowledge_ids")
        return self


class MatchingPair(StrictModel):
    study_term: Title | None = None
    pair_id: Identifier
    knowledge_id: Identifier
    left: CardText
    right: CardText
    explanation: CardText
    source_ref: SourceRef
    hint: CardText | None = None


class GameConfigInternal(StrictModel):
    title: Title
    pairs: list[MatchingPair] = Field(min_length=2, max_length=12)

    @model_validator(mode="after")
    def distinct_pairs_and_cards(self) -> Self:
        _unique([pair.pair_id for pair in self.pairs], "pair_id")
        _unique([pair.knowledge_id for pair in self.pairs], "knowledge_id")
        _unique([_display_key(pair.left) for pair in self.pairs], "left card text")
        _unique([_display_key(pair.right) for pair in self.pairs], "right card text")
        return self


class PublicCard(StrictModel):
    id: Identifier
    text: CardText


class GameConfigPublic(StrictModel):
    game_id: Identifier
    title: Title
    left_cards: list[PublicCard] = Field(min_length=2, max_length=12)
    right_cards: list[PublicCard] = Field(min_length=2, max_length=12)


class AttemptInput(StrictModel):
    event_id: Identifier
    left_id: Identifier
    right_id: Identifier


class HintInput(StrictModel):
    event_id: Identifier
    left_id: Identifier


class ConceptPerformance(StrictModel):
    knowledge_id: Identifier
    term: CardText
    explanation: CardText
    source_ref: SourceRef
    attempts: Count
    mistakes: Count
    first_attempt_correct: bool | None
    matched: bool
    hints: Count


class LearningReport(StrictModel):
    question_language: Literal["zh", "en"] | None = None
    session_id: Identifier
    game_id: Identifier
    total_pairs: PairCount
    matched_pairs: Count
    attempted_concepts: Count
    untouched_concepts: list[Identifier]
    valid_attempts: Count
    correct_attempts: Count
    first_attempt_accuracy: Rate | None
    overall_attempt_accuracy: Rate | None
    completion_rate: Rate
    hints_by_concept: dict[Identifier, Count]
    weak_knowledge_ids: list[Identifier]
    mistakes: Count = 0
    concepts: list[ConceptPerformance] = Field(default_factory=list)
