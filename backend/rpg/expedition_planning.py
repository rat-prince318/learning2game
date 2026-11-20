"""Split verified lecture concepts into ordered, publishable RPG plan requests."""

from math import ceil
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import Field, model_validator

from ..db import connection
from ..models import Count, Difficulty, Identifier, LearnerLevel, LearningGoal, StrictModel, Title
from ..pipeline import _knowledge
from .models import RPGPreferences, Theme
from .router import PlanRequest
from .validation import eligible

router = APIRouter(prefix="/rpg", tags=["RPG expeditions"])


class OutlineSource(StrictModel):
    material_id: Identifier
    selected_knowledge_ids: list[Identifier] | None = Field(default=None, min_length=3, max_length=64)


class OutlineRequest(StrictModel):
    question_language: Literal["zh", "en"] | None = None
    sources: list[OutlineSource] = Field(min_length=1, max_length=8)
    concepts_per_volume: int = Field(default=8, strict=True, ge=3, le=8)
    scenes_per_volume: int = Field(default=4, strict=True, ge=1, le=4)
    goal: LearningGoal = "review"
    learner_level: LearnerLevel = "beginner"
    difficulty: Difficulty = "medium"
    theme: Theme = "fantasy"

    @model_validator(mode="after")
    def distinct_sources(self):
        if len({s.material_id for s in self.sources}) != len(self.sources):
            raise ValueError("请把同一份资料的知识点合并到一项。")
        return self


class OutlineVolume(StrictModel):
    number: Count
    terms: list[Title]
    plan_request: PlanRequest


class ExpeditionOutline(StrictModel):
    concept_count: Count
    scene_count: Count
    volumes: list[OutlineVolume]


@router.post("/expedition-outline", response_model=ExpeditionOutline)
def outline(body: OutlineRequest, request: Request):
    """Preview exact source coverage before calling the existing plan and confirmation workflow."""
    volumes = []
    with connection(request.app) as conn:
        for source in body.sources:
            concepts = eligible(_knowledge(conn, source.material_id).knowledge)
            selected = source.selected_knowledge_ids
            if selected is not None:
                by_id = {item.knowledge_id: item for item in concepts}
                if len(set(selected)) != len(selected) or any(k not in by_id for k in selected):
                    raise HTTPException(422, "请为这份资料选择互异且有出处的知识点。")
                concepts = [by_id[k] for k in selected]
            size = len(concepts)
            if size < 3:
                raise HTTPException(422, "每份资料至少需要三个可区分且有出处的知识点。")
            # Spread the tail across all volumes so a nine-concept source yields
            # five and four questions, both accepted by the ordinary planner.
            count = min(ceil(size / body.concepts_per_volume), size // 3)
            if len(volumes) + count > 8:
                raise HTTPException(422, "一场远征最多八卷。请缩小知识范围，或调高每卷题量。")
            offset = 0
            for index in range(count):
                length = size // count + int(index < size % count)
                group = concepts[offset:offset + length]
                offset += length
                prefs = RPGPreferences(question_language=body.question_language, goal=body.goal, learner_level=body.learner_level,
                                       difficulty=body.difficulty, theme=body.theme,
                                       selected_knowledge_ids=[item.knowledge_id for item in group],
                                       challenge_count=length, scene_count=min(length, body.scenes_per_volume))
                terms = [getattr(item.exam_question, body.question_language).term
                         if item.exam_question and body.question_language else item.term for item in group]
                volumes.append(OutlineVolume(number=len(volumes) + 1, terms=terms,
                                             plan_request=PlanRequest(material_id=source.material_id, preferences=prefs)))
    return ExpeditionOutline(volumes=volumes, concept_count=sum(len(v.terms) for v in volumes),
                             scene_count=sum(v.plan_request.preferences.scene_count for v in volumes))
