"""Translate D's persisted contracts into calls to A's MatchingAgent."""

import asyncio
import hashlib
import os
import re

from matching_agent import MatchingAgent
from matching_agent import models as a
from matching_agent.errors import AgentError
from matching_agent.llm import DeepSeekClient
from matching_agent.source_client import SourceClient
from matching_agent.validation import prepare_candidates

from . import models as d
from .provider import trace_tool


def _relation(knowledge, prefs):
    if (prefs.goal == "distinguish" or prefs.difficulty == "hard") and all(k.example for k in knowledge):
        return "term_scenario"
    if all(k.knowledge_type == "component_function" or
           (k.source_type or "").lower() in {"image", "diagram", "visual"} for k in knowledge):
        return "component_function"
    return "term_definition"


def _bundle(knowledge, relation):
    # The host supplies a scoped roster, rather than exposing the upload directory or its files.
    material_id = "scope_" + a.digest({"rows": [
        (k.knowledge_id, k.term, k.definition, k.source_ref) for k in knowledge
    ]})
    sources = []
    items = []
    for k in knowledge:
        # One evidence record per concept also works when several share a page locator.
        source_id = "s_" + hashlib.sha256(k.knowledge_id.encode()).hexdigest()[:24]
        modality = "mixed" if k.source_type == "mixed" else (
            "image" if (k.source_type or "").lower() in {"image", "diagram", "visual"} else "text")
        evidence = getattr(k, "evidence", None) or k.definition
        sources.append(a.Source(source_id=source_id, material_id=material_id, locator=k.source_ref,
                                evidence=evidence, modality=modality, origin_ids=getattr(k, "source_ids", [])))
        items.append(a.KnowledgeItem(knowledge_id=k.knowledge_id, concept=k.term, definition=k.definition,
                                     example=k.example, relation_type=relation, source_refs=[source_id],
                                     evidence=evidence, modality=modality))
    language = "zh" if any(re.search(r"[\u3400-\u9fff]", k.term + k.definition) for k in knowledge) else "en"
    return a.KnowledgeBundle(material_id=material_id, knowledge=items, sources=sources, language=language)


def _preferences(prefs, count, selected=None):
    return a.UserPreferences(level=prefs.learner_level,
                             learning_goal="distinguish" if prefs.goal == "distinguish" else "recognize",
                             difficulty=prefs.difficulty, pair_count=count,
                             selected_knowledge_ids=selected)


def _statistics(report):
    return a.LearningStatistics(
        session_id=report.session_id, game_id=report.game_id,
        status="completed" if report.matched_pairs == report.total_pairs else "exited",
        metrics=a.LearningMetrics(first_attempt_accuracy=report.first_attempt_accuracy,
                                  total_attempt_accuracy=report.overall_attempt_accuracy,
                                  completion_rate=report.completion_rate, total_attempts=report.valid_attempts,
                                  total_errors=report.mistakes, hints_used=sum(report.hints_by_concept.values())),
        by_knowledge=[a.KnowledgePerformance(knowledge_id=k.knowledge_id, attempts=k.attempts,
                                             errors=k.mistakes, hints=k.hints, completed=k.matched,
                                             first_attempt_correct=k.first_attempt_correct) for k in report.concepts],
        weak_knowledge_ids=report.weak_knowledge_ids,
    )


class AgentAdapter:
    """One isolated agent and async client per synchronous backend request."""

    def __init__(self, live: bool = False):
        self.live = live

    def _run(self, operation):
        async def invoke():
            client = DeepSeekClient() if self.live else SourceClient()
            try:
                agent = MatchingAgent(client, trace_tool=trace_tool)
                if self.live:
                    # Cancel the tool loop before the host expires the job; an already
                    # dispatched remote inference may still complete on the provider.
                    deadline = max(.01, float(os.getenv("EDUGAME_SERVICE_TIMEOUT", "400")) - .25)
                    async with asyncio.timeout(deadline):
                        return await operation(agent)
                return await operation(agent)
            finally:
                if self.live:
                    await client.close()

        # All callers are already running on a bounded D service worker.
        return asyncio.run(invoke())

    def plan(self, knowledge: list[d.KnowledgeItem], preferences: d.UserPreferences) -> d.MatchingPlan:
        bundle = _bundle(knowledge, _relation(knowledge, preferences))
        prefs = _preferences(preferences, min(len(knowledge), preferences.pair_count))
        proposed = self._run(lambda agent: agent.prepare_plan(bundle, prefs))
        by_id = {k.knowledge_id: k for k in knowledge}
        first = by_id[proposed.selected_knowledge_ids[0]].term
        title = f"{first[:60]} 等概念配对" if bundle.language == "zh" else f"{first[:60]} and related concepts"
        return d.MatchingPlan(title=title, goal=preferences.goal, learner_level=preferences.learner_level,
                              difficulty=proposed.difficulty, knowledge_ids=proposed.selected_knowledge_ids,
                              relationship_type=proposed.relation_type, rationale=proposed.rationale,
                              warnings=proposed.warnings)

    def generate(self, knowledge: list[d.KnowledgeItem], plan: d.MatchingPlan,
                 previous: d.GameConfigInternal | None = None) -> d.GameConfigInternal:
        relation = _relation(knowledge, plan) if plan.relationship_type == "auto" else plan.relationship_type
        if relation not in {"term_definition", "term_scenario", "component_function"}:
            raise ValueError("Choose a supported matching relationship.")
        bundle = _bundle(knowledge, relation)
        prefs = _preferences(plan, len(plan.knowledge_ids), plan.knowledge_ids)
        target = prepare_candidates(bundle, prefs)
        confirmed = a.MatchingPlan(
            plan_id=a.new_id("plan"), material_id=bundle.material_id, knowledge_digest=a.digest(bundle),
            selected_knowledge_ids=plan.knowledge_ids, actual_pair_count=len(plan.knowledge_ids),
            relation_type=relation, language=target["output_language"], preferences=prefs,
            difficulty=plan.difficulty, rationale=plan.rationale or "按照已确认的方案生成配对。",
        )
        prior = {p.knowledge_id: p.right for p in previous.pairs} if previous else {}

        async def generate(agent):
            return await agent.generate_game(bundle, agent.confirm_plan(confirmed, bundle), previous_rights=prior)

        result = self._run(generate)
        if result.status != "completed" or result.game is None:
            raise AgentError("game_quality", "卡片校验需要更清楚的证据，请调整知识点或改用另一段资料。")
        by_id = {k.knowledge_id: k for k in knowledge}
        pairs = []
        for p in result.game.pairs:
            k = by_id[p.knowledge_id]
            # Pair wording belongs to A's validated game. For the post-answer teaching
            # note, use B's sourced definition and example. Even an accepted model
            # explanation can add a stronger guarantee than the original handout.
            explanation = k.definition
            if k.example and k.example != k.definition and len(explanation) + len(k.example) < 1980:
                label = "例：" if bundle.language == "zh" else "Example: "
                explanation += "\n" + label + k.example
            hint = (f"回想{k.source_ref}中关于“{k.term}”的描述。"
                    if bundle.language == "zh" else f"Recall how {k.source_ref} describes {k.term}.")
            pairs.append(d.MatchingPair(
                pair_id="p_" + hashlib.sha256(k.knowledge_id.encode()).hexdigest()[:24], knowledge_id=k.knowledge_id,
                left=p.left, right=p.right, explanation=explanation, source_ref=k.source_ref, hint=hint,
            ))
        return d.GameConfigInternal(title=plan.title, pairs=pairs)

    def feedback(self, report: d.LearningReport, knowledge: list[d.KnowledgeItem]) -> str:
        bundle = _bundle(knowledge, "term_definition")
        feedback = self._run(lambda agent: agent.feedback_for_round(
            _statistics(report), bundle, game_id=report.game_id, knowledge_ids={k.knowledge_id for k in knowledge},
            language=bundle.language, preferences=a.UserPreferences(pair_count=len(knowledge)),
        ))
        by_id = {k.knowledge_id: k for k in knowledge}
        lines = [feedback.summary]
        for review in feedback.reviews:
            k = by_id[review.knowledge_id]
            lines.append(f"{k.term}（{k.source_ref}）：{review.explanation}" if bundle.language == "zh"
                         else f"{k.term} ({k.source_ref}): {review.explanation}")
        return "\n".join(lines)
