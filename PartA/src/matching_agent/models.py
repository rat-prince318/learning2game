"""Version 1 contracts. B/A/D share these models; D owns future schema changes."""
from __future__ import annotations

import hashlib
import json
from typing import Annotated, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator

Text = Annotated[str, Field(min_length=1)]
Language = Literal["zh", "en"]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


def digest(value: BaseModel | dict) -> str:
    data = value.model_dump(mode="json") if isinstance(value, BaseModel) else value
    raw = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class Source(Contract):
    source_id: Text
    material_id: Text
    locator: Text
    evidence: Text
    modality: Literal["text", "image", "mixed"] = "text"


class KnowledgeItem(Contract):
    knowledge_id: Text
    concept: Text
    definition: Text
    relation_type: Text
    difficulty: Literal["basic", "advanced"] = "basic"
    learning_objective: str = ""
    source_refs: list[str] = Field(default_factory=list)
    evidence: str = ""
    modality: Literal["text", "image", "mixed"] = "text"
    quality: Literal["reliable", "uncertain", "conflict"] = "reliable"
    warnings: list[str] = Field(default_factory=list)


class KnowledgeBundle(Contract):
    schema_version: Literal["1.0"] = "1.0"
    material_id: Text
    language: Literal["zh", "en", "mixed"] = "zh"
    provenance: Literal["fixture", "extracted"] = "extracted"
    knowledge: list[KnowledgeItem]
    sources: list[Source]
    warnings: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def unique_ids(self):
        for items, attr in [(self.knowledge, "knowledge_id"), (self.sources, "source_id")]:
            ids = [getattr(item, attr) for item in items]
            if len(ids) != len(set(ids)):
                raise ValueError(f"duplicate {attr}")
        if any(s.material_id != self.material_id for s in self.sources):
            raise ValueError("source material_id must belong to this bundle")
        return self


class UserPreferences(Contract):
    level: Literal["beginner", "familiar"] = "beginner"
    learning_goal: Literal["recognize", "distinguish"] = "recognize"
    pair_count: int = Field(default=6, ge=4, le=8, strict=True)
    selected_knowledge_ids: list[str] | None = None
    excluded_knowledge_ids: list[str] = Field(default_factory=list)
    weak_knowledge_ids: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def unique_selection(self):
        for values in [self.selected_knowledge_ids, self.excluded_knowledge_ids,
                       self.weak_knowledge_ids]:
            if values is not None and len(values) != len(set(values)):
                raise ValueError("knowledge selection must not contain duplicate IDs")
        if set(self.selected_knowledge_ids or []) & set(self.excluded_knowledge_ids):
            raise ValueError("selected and excluded knowledge overlap")
        return self


class PlanDraft(Contract):
    selected_knowledge_ids: list[str] = Field(min_length=4, max_length=8)
    relation_type: Text
    difficulty: Literal["easy", "medium"]
    language: Language
    rationale: Annotated[str, Field(min_length=1, max_length=1200)]


class MatchingPlan(PlanDraft):
    schema_version: Literal["1.0"] = "1.0"
    plan_id: Text
    material_id: Text
    knowledge_digest: Text
    actual_pair_count: int = Field(ge=4, le=8)
    preferences: UserPreferences
    warnings: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def count_matches(self):
        if len(set(self.selected_knowledge_ids)) != self.actual_pair_count:
            raise ValueError("plan IDs must be unique and match actual_pair_count")
        if len(self.selected_knowledge_ids) != self.actual_pair_count:
            raise ValueError("plan count mismatch")
        return self


class ConfirmedPlan(Contract):
    """Created by the trusted host AFTER user confirmation; never an LLM tool."""
    confirmed: Literal[True] = True
    confirmation_id: Text
    plan_digest: Text
    plan: MatchingPlan


class Pair(Contract):
    pair_id: Text
    knowledge_id: Text
    left: Annotated[str, Field(min_length=1, max_length=60)]
    right: Annotated[str, Field(min_length=1, max_length=180)]
    explanation: Annotated[str, Field(min_length=1, max_length=400)]
    source_refs: list[str] = Field(min_length=1)


class GameDraft(Contract):
    title: Annotated[str, Field(min_length=1, max_length=120)]
    instructions: Annotated[str, Field(min_length=1, max_length=400)]
    pairs: list[Pair] = Field(min_length=4, max_length=8)


class GameConfigInternal(GameDraft):
    schema_version: Literal["1.0"] = "1.0"
    game_id: Text
    plan_id: Text
    material_id: Text
    language: Language
    relation_type: Text
    warnings: list[str] = Field(default_factory=list)


class ValidationIssue(Contract):
    pair_id: str | None = None
    knowledge_id: str | None = None
    code: Literal["structure", "knowledge_set", "duplicate_id", "unknown_knowledge",
                  "pair_id", "concept_changed", "invalid_source", "answer_leakage",
                  "duplicate_card", "plan_metadata", "unsupported", "contradiction",
                  "ambiguous", "image_mismatch"]
    reason: Annotated[str, Field(min_length=1, max_length=1200)]
    suggestion: Annotated[str, Field(min_length=1, max_length=1200)]


class ValidationReport(Contract):
    passed: bool
    issues: list[ValidationIssue] = Field(default_factory=list)
    semantic_checked: bool = False

    @model_validator(mode="after")
    def consistent_result(self):
        if self.passed == bool(self.issues):
            raise ValueError("passed must equal not issues")
        return self


class SemanticDraft(Contract):
    issues: list[ValidationIssue]


class RepairDraft(Contract):
    replacements: list[Pair]
    title: str | None = None
    instructions: str | None = None
    warnings: list[str] = Field(default_factory=list)


class GenerationResult(Contract):
    status: Literal["completed", "failed", "needs_confirmation"]
    game: GameConfigInternal | None = None
    validation: ValidationReport
    repair_count: int = Field(ge=0, le=2)
    warnings: list[str] = Field(default_factory=list)


class KnowledgePerformance(Contract):
    knowledge_id: Text
    first_attempt_correct: bool | None = None
    attempts: int = Field(ge=0)
    errors: int = Field(ge=0)
    hints: int = Field(ge=0)
    completed: bool


class LearningMetrics(Contract):
    first_attempt_accuracy: float | None = Field(default=None, ge=0, le=1)
    total_attempt_accuracy: float | None = Field(default=None, ge=0, le=1)
    completion_rate: float = Field(ge=0, le=1)
    total_attempts: int = Field(ge=0)
    total_errors: int = Field(ge=0)
    hints_used: int = Field(ge=0)


class LearningStatistics(Contract):
    session_id: Text
    game_id: Text
    status: Literal["active", "completed", "exited"]
    metrics: LearningMetrics
    by_knowledge: list[KnowledgePerformance]
    weak_knowledge_ids: list[str]

    @model_validator(mode="after")
    def unique_knowledge(self):
        ids = [p.knowledge_id for p in self.by_knowledge]
        if len(ids) != len(set(ids)):
            raise ValueError("duplicate knowledge performance")
        if len(self.weak_knowledge_ids) != len(set(self.weak_knowledge_ids)):
            raise ValueError("duplicate weak knowledge")
        return self


class ReviewAdvice(Contract):
    knowledge_id: Text
    explanation: Annotated[str, Field(min_length=1, max_length=800)]
    source_refs: list[str] = Field(min_length=1)


class FeedbackDraft(Contract):
    summary: Annotated[str, Field(min_length=1, max_length=1000)]
    reviews: list[ReviewAdvice]


class PracticeRequest(Contract):
    material_id: Text
    preferences: UserPreferences
    previous_game_id: Text
    requires_confirmation: Literal[True] = True


class LearningFeedback(FeedbackDraft):
    statistics: LearningStatistics
    completion_note: Text
    practice: PracticeRequest
    warnings: list[str] = Field(default_factory=list)

