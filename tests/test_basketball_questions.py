import asyncio

import pytest
from matching_agent.errors import AgentError
from matching_agent.validation import normalized

from backend.basketball_questions import Shot, _render_math, eligible_item, generate_shots, text_problem
from backend.agent_adapter import _bundle
from backend.material_adapter import Point, _dedupe
from backend.models import ExamQuestion, ExamWording, KnowledgeItem, MatchingPlan


@pytest.mark.parametrize("value", [
    "Which arrow is marked in the diagram?", "Compare figure 2 with the control.",
    "如图所示，物体所受的合力是多少？", "![apparatus](photo.png)", "<svg viewBox='0 0 2 2'>",
    r"\includegraphics{cells.png}", "data:image/png;base64,AAAA", "Refer to a.png",
    "下一句是什么？", r"Find \(\frac{1}{3}x", r"What is $\frac{1}{3x$?",
])
def test_unusable_on_a_ball(value):
    assert text_problem(value)


def test_visual_evidence_can_yield_a_self_contained_text_question():
    source = KnowledgeItem(knowledge_id="k", term="Graph theory", source_type="image", source_ref="Slide 1",
                           definition="The degree of a vertex counts incident edges.")
    assert eligible_item(source)
    assert not eligible_item(source.model_copy(update={"term": "Learning objectives"}))
    assert not eligible_item(source.model_copy(update={"definition": "Read the value shown below."}))
    assert normalized(r"$x+y$") != normalized(r"$x-y$")
    assert normalized(r"$P$") != normalized(r"$p$")
    assert not text_problem(r"Compute the price after a $5 discount.")
    assert not text_problem(r"Evaluate \(\frac{x+y}{2}\) at \(x=y=1\).")


def test_glossary_definition_and_a_model_quote_from_the_same_evidence():
    a = Point("Momentum", r"Mass times velocity, $p=mv$. Example: a cart in motion.",
              r"Momentum: Mass times velocity, $p=mv$. Example: a cart in motion.",
              ["p2"], "slide 2", 2, "text", literal=True)
    b = Point("Linear momentum", "Product of mass and velocity.", "Mass times velocity",
              ["p2"], "slide 2", 2, "text")
    c = Point("Net force", "The vector sum of all forces.", "The vector sum of all forces.",
              ["p3"], "slide 3", 3, "text")
    assert [i.term for i in _dedupe([a, b, c])[0]] == ["Momentum", "Net force"]


def test_two_distinct_exam_problems_on_the_same_topic_reach_the_planner():
    items = []
    for i in (10, 20):
        wording = ExamWording(term="Current", definition="Charge transferred per unit time.",
                             prompt=f"How much current transfers {i} C in 2 s?",
                             options=["5 A", "10 A", "20 A"], hint="Divide charge by time.",
                             explanation="Use the definition of electric current.")
        items.append(KnowledgeItem(knowledge_id=f"q{i}", term=wording.term, definition=wording.definition,
                                  source_ref=f"Page {i}", exam_question=ExamQuestion(
                                      en=wording, zh=wording, correct_index=0 if i == 10 else 1)))
    selected = _bundle(items, "term_definition", "en", shot_plan=True).knowledge
    assert len({q.concept for q in selected}) == len({q.definition for q in selected}) == 2


def shot(kid, ball, hoop):
    return Shot(knowledge_id=kid, ball=ball, hoop=hoop, hint="Think about the direction of the change.",
                explanation="The observed physical change follows the course definition.", study_term=hoop)


def test_same_renderer_rejects_balanced_but_invalid_tex():
    good = shot("frac", r"Compute \(\frac{1}{3}+\frac{2}{3}\).", r"$1$")
    bad = shot("bad", r"Evaluate $\inventedcommand{1}$.", r"$\frac{1}$")
    assert not asyncio.run(_render_math([good]))
    assert len(asyncio.run(_render_math([bad]))) == 2


class Reviewer:
    def __init__(self, ambiguous=False):
        self.ambiguous = ambiguous
        self.calls = []
        self.shots = [shot("evap", "Liquid water becomes vapour at the surface. Name the process.", "Evaporation"),
                      shot("cond", "Cooling water vapour forms droplets. Name the process.", "Condensation")]

    async def structured(self, task, system, payload, schema):
        self.calls.append(task)
        if task == "author_basketball_shots":
            return {"shots": [s.model_dump() for s in self.shots]}
        if task == "verify_shot_evidence":
            assert len(payload["sources"]) == len(payload["shots"]) == 2
            return {"checks": [{"knowledge_id": s.knowledge_id, "supported": True, "reason": "Supported."}
                               for s in self.shots]}
        assert task == "blind_review_hoops"
        assert set(payload) == {"hoops", "balls", "language"}
        assert all(set(b) == {"ball_number", "text"} for b in payload["balls"])
        labels = {value: key for key, value in payload["hoops"].items()}
        return {"decisions": [{"ball_number": i, "sound": True, "reason": "Compared with every target.",
                               "valid_hoops": list(labels.values()) if self.ambiguous else [labels[s.hoop]]}
                              for i, s in enumerate(self.shots, 1)]}


@pytest.mark.parametrize("ambiguous", [False, True])
def test_blind_assignment_and_source_audit_precede_publication(ambiguous):
    client = Reviewer(ambiguous)
    knowledge = [KnowledgeItem(knowledge_id=s.knowledge_id, term=s.hoop, definition=s.ball, source_ref="Chapter 1")
                 for s in client.shots]
    plan = MatchingPlan(title="Water", difficulty="easy", knowledge_ids=["evap", "cond"], question_language="en")
    if ambiguous:
        with pytest.raises(AgentError, match="知识点"):
            asyncio.run(generate_shots(client, knowledge, plan))
        assert client.calls.count("blind_review_hoops") == 3
    else:
        game = asyncio.run(generate_shots(client, knowledge, plan))
        assert [g.right for g in game.pairs] == ["Evaporation", "Condensation"]
        assert client.calls.count("verify_shot_evidence") == 1
