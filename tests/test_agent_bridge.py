import asyncio
from types import SimpleNamespace
from threading import BoundedSemaphore

import pytest
from matching_agent import models as a
from matching_agent.source_client import SourceClient
from matching_agent.wording import has_unwanted_wording
from pydantic import ValidationError

from backend.agent_adapter import AgentAdapter, _bundle
from backend.models import ConceptPerformance, KnowledgeItem, LearningReport, UserPreferences
from backend.provider import call_service


def topic():
    return [
        KnowledgeItem(knowledge_id="index", term="数据库索引", definition="按特定列组织的辅助查找结构",
                      source_ref="课堂讲义 / 第 2 页", evidence="资料原句：按特定列组织的辅助查找结构。", source_ids=["p2"]),
        KnowledgeItem(knowledge_id="transaction", term="事务", definition="作为整体提交或回滚的一组操作",
                      source_ref="课堂讲义 / 第 3 页", source_ids=["p3"]),
        KnowledgeItem(knowledge_id="cursor", term="游标", definition="顺序访问查询结果的机制",
                      source_ref="课堂讲义 / 第 4 页", source_ids=["p4"]),
    ]


def test_real_agent_tools_with_edited_two_pair_plan_and_repractice():
    knowledge = topic()
    service = AgentAdapter()
    app = SimpleNamespace(state=SimpleNamespace(services=service, service_slots=BoundedSemaphore(1), service_timeout=10))
    trace = []
    plan = call_service(app, "plan", knowledge, UserPreferences(pair_count=6), tool_trace=trace)
    assert len(plan.knowledge_ids) == 3 and trace[-1]["name"] == "design_matching_plan"
    selected = ["transaction", "index"]
    plan = plan.model_copy(update={"title": "我的短练习", "knowledge_ids": selected, "difficulty": "hard"})
    game = call_service(app, "generate", knowledge, plan, tool_trace=trace)
    assert game.title == plan.title
    assert {p.knowledge_id for p in game.pairs} == set(selected)
    assert {p.source_ref for p in game.pairs} == {k.source_ref for k in knowledge if k.knowledge_id in selected}
    assert [t["name"] for t in trace] == ["design_matching_plan", "generate_matching_config", "validate_matching_config"]
    practice = service.generate(knowledge, plan, game)
    old = {p.knowledge_id: p for p in game.pairs}
    assert all(p.right != old[p.knowledge_id].right for p in practice.pairs)
    assert all(p.pair_id == old[p.knowledge_id].pair_id for p in practice.pairs)
    assert _bundle(knowledge, "term_definition").sources[0].origin_ids == ["p2"]


def test_feedback_uses_frozen_performance_and_the_b_sources():
    knowledge = topic()[:2]
    concepts = [ConceptPerformance(knowledge_id=k.knowledge_id, term=k.term, source_ref=k.source_ref,
                                   explanation=k.definition, attempts=1, mistakes=int(i==0),
                                   first_attempt_correct=i!=0, matched=i!=0, hints=0)
                for i,k in enumerate(knowledge)]
    report = LearningReport(session_id="s", game_id="g", total_pairs=2, matched_pairs=1,
                            attempted_concepts=2, untouched_concepts=[], valid_attempts=2, correct_attempts=1,
                            first_attempt_accuracy=.5, overall_attempt_accuracy=.5, completion_rate=.5,
                            hints_by_concept={}, weak_knowledge_ids=["index"], mistakes=1, concepts=concepts)
    advice = AgentAdapter().feedback(report, knowledge)
    assert knowledge[0].term in advice and knowledge[0].source_ref in advice
    assert knowledge[1].source_ref not in advice
    assert not has_unwanted_wording(advice)


@pytest.mark.parametrize("text", [
    "课程\u00b7练习", "这不是考试，而是游戏。", "并非结论。", "不代表掌握。", "不一定成立。",
    "这不足以说明结果。", "更准确地说，这只是第一步。", "Not only a score but a grade.",
])
def test_excluded_interface_language_is_rejected_in_model_output(text):
    assert has_unwanted_wording(text)
    with pytest.raises(ValidationError):
        a.FeedbackDraft(summary=text, reviews=[])


def test_source_check_flags_an_unattributed_offline_answer():
    item = {"knowledge_id":"term", "concept":"Routers", "definition":"Forward packets between networks."}
    result = asyncio.run(SourceClient().structured("validate_matching_config", "", {
        "selected_knowledge":[item], "game":{"language":"en","relation_type":"component_function",
        "pairs":[{"knowledge_id":"term","pair_id":"pair_term","right":"Produce drinking water.",
                  "explanation":item["definition"]}]}
    }, {}))
    assert [i["code"] for i in result["issues"]] == ["unsupported"]


def test_validated_pair_keeps_its_cards_and_displays_a_sourced_teaching_note(monkeypatch):
    knowledge = [
        KnowledgeItem(knowledge_id="pin", term="Release PIN",
                      definition="A private four-digit code entered to collect a queued print job.",
                      source_ref="campus-printing.pdf / p.1"),
        KnowledgeItem(knowledge_id="tray", term="Output tray", definition="Collects printed pages.",
                      source_ref="campus-printing.pdf / p.2", source_type="image"),
    ]
    adapter = AgentAdapter()
    plan = adapter.plan(knowledge, UserPreferences(pair_count=2))
    generated = [SimpleNamespace(knowledge_id=k.knowledge_id, left=k.term,
                                 right="Resulting hard copies collect here." if k.knowledge_id == "tray" else k.definition,
                                 explanation="This ensures only authorized access to printed documents.")
                 for k in knowledge]
    response = SimpleNamespace(status="completed", game=SimpleNamespace(pairs=generated))
    monkeypatch.setattr(adapter, "_run", lambda operation: response)
    returned = adapter.generate(knowledge, plan)
    assert [p.right for p in returned.pairs] == [p.right for p in generated]
    assert [p.explanation for p in returned.pairs] == [k.definition for k in knowledge]
    assert [p.source_ref for p in returned.pairs] == [k.source_ref for k in knowledge]
