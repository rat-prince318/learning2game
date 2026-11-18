"""Matching Agent's supported public integration surface."""

from .agent import MatchingAgent
from .models import (
    ConfirmedPlan, GameConfigInternal, GenerationResult, KnowledgeBundle,
    LearningFeedback, LearningStatistics, MatchingPlan, UserPreferences,
)

__all__ = [
    "MatchingAgent", "ConfirmedPlan", "GameConfigInternal", "GenerationResult",
    "KnowledgeBundle", "LearningFeedback", "LearningStatistics", "MatchingPlan",
    "UserPreferences",
]

