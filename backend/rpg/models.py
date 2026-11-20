"""RPG wire models. Player-facing content is plain text and structure is data."""

import re
import unicodedata
from typing import Annotated, Generic, Literal, Self, TypeVar

from matching_agent.wording import has_unwanted_wording
from pydantic import AfterValidator, Field, StringConstraints, model_validator

from ..models import CardText, Count, Difficulty, Identifier, LearnerLevel, LearningGoal, Rate, StrictModel

Theme = Literal["campus", "laboratory", "fantasy"]
GameType = Literal["matching", "rpg_quest"]
ActionName = Literal["enter_scene", "accept_quest", "attempt", "hint"]
ChallengeCount = Annotated[int, Field(strict=True, ge=1, le=8)]
SceneCount = Annotated[int, Field(strict=True, ge=1, le=4)]
_active_markup = re.compile(
    r"</?[a-z][\w:-]*(?:\s[^<>]*)?/?>|<!--|\bon[a-z]+\s*=|"
    r"(?:\b[a-z][\w+.-]*://|(?<![:/])//[\w.-]+\.[a-z]{2,}/|\b(?:javascript|vbscript|blob):|"
    r"\bdata:[\w.+-]+/[\w.+-]+)|<\?xml|@import\s|\burl\s*\(|"
    r"(?:[.#]?[a-z][\w-]*)\s*\{[^{}]*[\w-]+\s*:[^{}]+\}|"
    r"\b(?:eval|alert|document\.write)\s*\(|\bfunction\s+\w+\s*\([^)]*\)\s*\{",
    re.IGNORECASE,
)


def _display_text(value: str) -> str:
    if _active_markup.search(value) or has_unwanted_wording(value):
        raise ValueError("Use plain learner-facing text and built-in visual keys.")
    return value


def _text(limit: int):
    return Annotated[str, StringConstraints(min_length=1, max_length=limit), AfterValidator(_display_text)]


ShortText = _text(120)
TermText = _text(160)
OptionText = _text(200)
HintText = _text(300)
DialogueText = _text(400)
ReferenceText = _text(500)
Description = _text(600)
QuestionText = _text(800)
Explanation = _text(1200)
StudyFeedback = _text(10000)
Warnings = Annotated[list[Description], Field(max_length=24)]


def _distinct(values: list[str], label: str) -> None:
    if len(set(values)) != len(values):
        raise ValueError(f"{label} must be unique.")


class RPGPreferences(StrictModel):
    question_language: Literal["zh", "en"] | None = None
    goal: LearningGoal = "review"
    learner_level: LearnerLevel = "beginner"
    difficulty: Difficulty = "medium"
    challenge_count: ChallengeCount = 6
    scene_count: SceneCount = 3
    theme: Theme = "laboratory"
    selected_knowledge_ids: list[Identifier] | None = Field(default=None, min_length=1, max_length=8)

    @model_validator(mode="after")
    def unique_selection(self) -> Self:
        _distinct(self.selected_knowledge_ids or [], "Selected knowledge IDs")
        return self


class GameRecommendation(StrictModel):
    recommended_type: GameType
    rationale: Explanation
    supported_types: list[GameType] = Field(min_length=1, max_length=2)
    warnings: Warnings = Field(default_factory=list)
    mode: Literal["offline", "live"] = "offline"

    @model_validator(mode="after")
    def available_recommendation(self) -> Self:
        _distinct(self.supported_types, "Supported game types")
        if self.recommended_type not in self.supported_types:
            raise ValueError("Recommend an available game type.")
        return self


class RPGSceneOutline(StrictModel):
    name: ShortText
    objective: Description
    knowledge_ids: list[Identifier] = Field(min_length=1, max_length=8)


class _Versioned(StrictModel):
    game_type: Literal["rpg_quest"] = "rpg_quest"
    schema_version: Literal["1.0"] = "1.0"


class RPGPlan(_Versioned):
    question_language: Literal["zh", "en"] | None = None
    title: ShortText
    goal: LearningGoal
    learner_level: LearnerLevel
    difficulty: Difficulty
    theme: Theme
    knowledge_ids: list[Identifier] = Field(min_length=1, max_length=8)
    challenge_count: ChallengeCount
    scene_count: SceneCount
    learning_objectives: list[Description] = Field(min_length=1, max_length=8)
    scene_outlines: list[RPGSceneOutline] = Field(min_length=1, max_length=4)
    rationale: Explanation
    warnings: Warnings = Field(default_factory=list)

    @model_validator(mode="after")
    def complete_outlines(self) -> Self:
        _distinct(self.knowledge_ids, "Plan knowledge IDs")
        assigned = [key for scene in self.scene_outlines for key in scene.knowledge_ids]
        if (len(self.knowledge_ids) != self.challenge_count or
                len(self.scene_outlines) != self.scene_count or
                sorted(assigned) != sorted(self.knowledge_ids)):
            raise ValueError("Plan counts and knowledge assignments must agree.")
        return self


class RPGItem(StrictModel):
    id: Identifier
    name: ShortText


class RPGReward(StrictModel):
    xp: Literal[20] = 20
    item: RPGItem


class RPGQuest(StrictModel):
    quest_id: Identifier
    title: ShortText
    objective: Description
    challenge_ids: list[Identifier] = Field(min_length=1, max_length=8)
    reward: RPGReward


class RPGNPC(StrictModel):
    name: ShortText
    dialogue: list[DialogueText] = Field(min_length=1, max_length=6)


class RPGOption(StrictModel):
    id: Identifier
    text: OptionText


class RPGChallengePublic(StrictModel):
    challenge_id: Identifier
    type: Literal["single_choice"] = "single_choice"
    prompt: QuestionText
    options: list[RPGOption] = Field(min_length=3, max_length=4)

    @model_validator(mode="after")
    def distinct_options(self) -> Self:
        normalized = [" ".join(unicodedata.normalize("NFKC", o.text).casefold().split()) for o in self.options]
        _distinct(normalized, "Option texts")
        return self


class RPGChallengeInternal(RPGChallengePublic):
    study_term: TermText | None = None
    study_definition: Explanation | None = None
    knowledge_id: Identifier
    correct_option_id: Identifier
    hint: HintText
    explanation: Explanation
    source_ref: ReferenceText
    evidence: CardText
    success_text: Description
    remediation_text: Description

    @model_validator(mode="after")
    def valid_answer(self) -> Self:
        if self.correct_option_id not in {o.id for o in self.options}:
            raise ValueError("The answer must point to an option of this challenge.")
        return self


_Challenge = TypeVar("_Challenge", bound=RPGChallengePublic)


class _Scene(StrictModel, Generic[_Challenge]):
    scene_id: Identifier
    name: ShortText
    description: Description
    visual_key: Literal["lab", "campus", "forest"]
    npc: RPGNPC
    quest: RPGQuest
    challenges: list[_Challenge] = Field(min_length=1, max_length=8)
    next_scene_id: Identifier | None

    @model_validator(mode="after")
    def quest_tasks(self) -> Self:
        if self.quest.challenge_ids != [c.challenge_id for c in self.challenges]:
            raise ValueError("Quest order must match the challenges in its scene.")
        return self


class RPGScenePublic(_Scene[RPGChallengePublic]):
    pass


class RPGSceneInternal(_Scene[RPGChallengeInternal]):
    pass


_SceneType = TypeVar("_SceneType", RPGScenePublic, RPGSceneInternal)


class _Game(_Versioned, Generic[_SceneType]):
    question_language: Literal["zh", "en"] | None = None
    title: ShortText
    rules: Explanation
    theme: Theme
    start_scene_id: Identifier
    scenes: list[_SceneType] = Field(min_length=1, max_length=4)
    warnings: Warnings = Field(default_factory=list)

    @model_validator(mode="after")
    def reachable_tasks(self) -> Self:
        ids = []
        count = 0
        for scene in self.scenes:
            ids.extend([scene.scene_id, scene.quest.quest_id, scene.quest.reward.item.id])
            for challenge in scene.challenges:
                count += 1
                ids.append(challenge.challenge_id)
                ids.extend(option.id for option in challenge.options)
        _distinct(ids, "Game object and option IDs")
        if count > 8:
            raise ValueError("A game supports at most eight challenges.")
        links = {s.scene_id: s.next_scene_id for s in self.scenes}
        visited = []
        key = self.start_scene_id
        while key is not None:
            if key not in links or key in visited:
                raise ValueError("Scene route has an unknown or repeated destination.")
            visited.append(key)
            key = links[key]
        if visited != list(links):
            raise ValueError("Visit every scene in the confirmed outline order.")
        return self


class RPGGameInternal(_Game[RPGSceneInternal]):
    @model_validator(mode="after")
    def one_challenge_per_concept(self) -> Self:
        _distinct([c.knowledge_id for s in self.scenes for c in s.challenges], "Assessed knowledge IDs")
        return self


class RPGGamePublic(_Game[RPGScenePublic]):
    game_id: Identifier


class RPGIssue(StrictModel):
    code: Identifier
    message: Description
    challenge_id: Identifier | None = None


class RPGValidationReport(StrictModel):
    valid: bool
    issues: list[RPGIssue] = Field(default_factory=list, max_length=32)
    repair_attempts: int = Field(default=0, ge=0, le=2, strict=True)

    @model_validator(mode="after")
    def issues_agree(self) -> Self:
        if self.valid == bool(self.issues):
            raise ValueError("Valid configurations have no unresolved issues.")
        return self


class RPGGenerationResult(StrictModel):
    status: Literal["completed", "failed"]
    config: RPGGameInternal | None = None
    validation: RPGValidationReport

    @model_validator(mode="after")
    def ready_to_publish(self) -> Self:
        completed = self.status == "completed"
        if completed != self.validation.valid or completed != (self.config is not None):
            raise ValueError("Only validated, completed generations have a configuration.")
        return self


class _Action(StrictModel):
    event_id: Identifier


class EnterScene(_Action):
    action: Literal["enter_scene"]
    scene_id: Identifier


class AcceptQuest(_Action):
    action: Literal["accept_quest"]
    quest_id: Identifier


class AttemptChallenge(_Action):
    action: Literal["attempt"]
    challenge_id: Identifier
    option_id: Identifier


class RequestHint(_Action):
    action: Literal["hint"]
    challenge_id: Identifier


RPGActionInput = Annotated[EnterScene | AcceptQuest | AttemptChallenge | RequestHint, Field(discriminator="action")]


def _optional_feedback():
    # Missing feedback is absent on the wire, including in a restored progress response.
    return Field(default=None, exclude_if=lambda value: value is None)


class RPGActionFeedback(StrictModel):
    message: Explanation
    correct: bool | None = _optional_feedback()
    challenge_id: Identifier | None = _optional_feedback()
    hint: HintText | None = _optional_feedback()
    explanation: Explanation | None = _optional_feedback()
    source_ref: ReferenceText | None = _optional_feedback()
    revealed_option_id: Identifier | None = _optional_feedback()
    reward_delta: Count = 0
    remediated: bool = False


class RPGProgress(StrictModel):
    game_type: Literal["rpg_quest"] = "rpg_quest"
    session_id: Identifier
    game_id: Identifier
    status: Literal["active", "finished"]
    revision: Count = 0
    current_scene_id: Identifier
    unlocked_scene_ids: list[Identifier]
    accepted_quest_ids: list[Identifier] = Field(default_factory=list)
    completed_quest_ids: list[Identifier] = Field(default_factory=list)
    resolved_challenge_ids: list[Identifier] = Field(default_factory=list)
    passed_challenge_ids: list[Identifier] = Field(default_factory=list)
    remediated_challenge_ids: list[Identifier] = Field(default_factory=list)
    challenge_attempts: dict[Identifier, Count] = Field(default_factory=dict)
    hints_by_challenge: dict[Identifier, Count] = Field(default_factory=dict)
    revealed_hints: dict[Identifier, HintText] = Field(default_factory=dict)
    xp: Count = 0
    inventory: list[RPGItem] = Field(default_factory=list)
    all_quests_completed: bool = False
    last_feedback: RPGActionFeedback | None = None
    started_at: str
    elapsed_seconds: Count = 0


class RPGActionResult(StrictModel):
    event_id: Identifier
    action: ActionName
    feedback: RPGActionFeedback
    progress: RPGProgress


class RPGConceptPerformance(StrictModel):
    knowledge_id: Identifier
    term: TermText
    attempts: Count
    mistakes: Count
    first_attempt_correct: bool | None
    hints: Count
    passed: bool
    resolved: bool
    remediated: bool
    explanation: Explanation
    source_ref: ReferenceText


class RPGLearningReport(StrictModel):
    question_language: Literal["zh", "en"] | None = None
    game_type: Literal["rpg_quest"] = "rpg_quest"
    session_id: Identifier
    game_id: Identifier
    finish_reason: Literal["completed", "exited"]
    total_challenges: ChallengeCount
    resolved_challenges: Count
    correct_challenges: Count
    remediated_challenges: Count
    total_quests: SceneCount
    completed_quests: Count
    xp: Count
    inventory: list[RPGItem]
    valid_attempts: Count
    correct_attempts: Count
    mistakes: Count
    attempted_concepts: Count
    untouched_concepts: list[Identifier]
    first_attempt_accuracy: Rate | None
    overall_attempt_accuracy: Rate | None
    completion_rate: Rate
    hints_by_concept: dict[Identifier, Count]
    weak_knowledge_ids: list[Identifier]
    concepts: list[RPGConceptPerformance] = Field(min_length=1, max_length=8)
    elapsed_seconds: Count = 0
