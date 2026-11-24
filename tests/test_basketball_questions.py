import asyncio

import pytest
from matching_agent.errors import AgentError
from matching_agent.validation import normalized

from backend.basketball_questions import (
    Distractor, Shot, _local_review, _render_math, eligible_item, generate_shots, option_issue, text_problem,
)
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


def shot(kid, ball, hoop, wrong=("Freezing", "Melting", "Sublimation")):
    return Shot(knowledge_id=kid, ball=ball, hoop=hoop, hint="Think about the direction of the change.",
                distractors=[Distractor(text=t, misconception=f"Confuses this change with {t}.") for t in wrong],
                explanation="The observed physical change follows the course definition.", study_term=hoop)


def test_same_renderer_rejects_balanced_but_invalid_tex():
    good = shot("frac", r"Compute \(\frac{1}{3}+\frac{2}{3}\).", r"$1$")
    bad = shot("bad", r"Evaluate $\inventedcommand{1}$.", r"$\frac{1}$")
    assert not asyncio.run(_render_math([good]))
    assert len(asyncio.run(_render_math([bad]))) == 2
    wrong = shot("rate", "Find the rate.", "$2$", wrong=("$1$", r"$\oops{4}$", "$5$"))
    assert "distractor_2" in asyncio.run(_render_math([wrong]))[0]


@pytest.mark.parametrize("key, wrong, accepted", [
    ("3 m/s east", ("3 m/s west", "12 m/s east", "12 m/s west"), True),
    ("3 m/s east", ("3 m/s", "12 m/s east", "12 m/s west"), False),
    (r"$\frac{1}{2}\,\mathrm{V}$", ("0.5 V", "1 V", "2 V"), False),
    ("15 W", ("3 W", "18 V", "75 W"), False),
    ("10 J", ("5 J", "10.0 J", "20 J"), False),
    ("2e3 Pa", (r"$2 \times 10^{3}\,\mathrm{Pa}$", "100 Pa", "200 Pa"), False),
    ("5 m/s east", ("-5 m/s west", "5 m/s north", "4 m/s south"), False),
    ("1000 m", ("1 km", "10 m", "100 m"), False),
    ("5 J", ("5 J", "15 J", "20 J"), False),
    ("15 W", ("3 W", "18 W", "75 W"), True),
    ("增加 60 焦耳", ("减少 60 焦耳", "增加 6 焦耳", "减少 6 焦耳"), True),
    ("Stack", ("Queue", "Heap", "Binary tree"), True),
    ("A", ("B", "C", "无法确定"), False),
    ("B", ("A", "D", "A, C"), False),
    ("A", ("AB", "B", "O"), True),
])
def test_options_belong_to_one_question(key, wrong, accepted):
    s = shot("q", "Find the result.", key, wrong)
    assert bool(_local_review([s], ["q"], None)) != accepted


def test_different_questions_can_share_the_same_correct_result():
    a = shot("a", "Question one", "15 W", ("3 W", "18 W", "75 W"))
    b = shot("b", "Question two", "15 W", ("5 W", "30 W", "10 W"))
    assert not _local_review([a,b], ["a","b"], "en")


@pytest.mark.parametrize("prompt,key,wrong,accepted", [
    ("A cart moves for 2 s. What is its speed?", "9 J", ("3 J", "6 J", "12 J"), False),
    ("速度为多少？", "12 J", ("3 J", "6 J", "9 J"), False),
    ("物体的加速度为多少？", "3 m/s^2", ("1 m/s^2","2 m/s^2","4 m/s^2"), True),
    ("A ball has an initial speed of 3 m/s. What is its kinetic energy?",
     "9 J", ("3 J", "6 J", "12 J"), True),
    ("Which derivative is correct?", "$2x$", ("$x^2$", "$x/2$", "$-x$"), True),
])
def test_expected_dimension_comes_from_the_requested_quantity(prompt, key, wrong, accepted):
    assert bool(option_issue([key,*wrong], prompt)) != accepted


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
                               | {"distractor_checks": [{"number": i, "defensible": True, "reason": "Valid contrast."}
                                                       for i in (1, 2, 3)]} for s in self.shots]}
        assert task == "blind_review_hoops"
        assert set(payload) == {"hoops", "ball", "language"}
        assert set(payload["hoops"]) == set("ABCD")
        key = next(s.hoop for s in self.shots if s.ball == payload["ball"])
        return {"sound": True, "reason": "All givens are present.",
                "choices": [{"label": label, "correct": self.ambiguous or value == key, "comparable": True,
                             "reason": "Compared with the phase change."} for label, value in payload["hoops"].items()]}


def test_repair_keeps_a_passing_ball_after_one_misconception_is_rejected():
    class OneBadError(Reviewer):
        def __init__(self):
            super().__init__()
            self.author_requests = []

        async def structured(self, task, system, payload, schema):
            if task == "author_basketball_shots":
                ids = [s["knowledge_id"] for s in payload["sources"]]
                self.author_requests.append(ids)
                return {"shots": [s.model_dump() for s in self.shots if s.knowledge_id in ids]}
            if task == "verify_shot_evidence":
                checks = []
                for s in payload["shots"]:
                    bad = s["knowledge_id"] == "cond" and len(self.author_requests) == 1
                    checks.append({"knowledge_id":s["knowledge_id"],"supported":True,"reason":"Supported.",
                                   "distractor_checks":[{"number":n, "defensible":not (bad and n == 2),
                                       "reason":"Verify the phase transition."} for n in (1,2,3)]})
                return {"checks":checks}
            return await super().structured(task, system, payload, schema)

    client = OneBadError()
    knowledge = [KnowledgeItem(knowledge_id=s.knowledge_id, term=s.hoop, definition=s.ball,
                               source_ref="Chapter 1") for s in client.shots]
    plan = MatchingPlan(title="Water", difficulty="easy", knowledge_ids=["evap","cond"], question_language="en")
    assert len(asyncio.run(generate_shots(client, knowledge, plan)).pairs) == 2
    assert client.author_requests == [["evap", "cond"], ["cond"]]
    assert client.calls.count("blind_review_hoops") == 3


@pytest.mark.parametrize("ambiguous", [False, True])
def test_blind_assignment_and_source_audit_precede_publication(ambiguous):
    client = Reviewer(ambiguous)
    knowledge = [KnowledgeItem(knowledge_id=s.knowledge_id, term=s.hoop, definition=s.ball, source_ref="Chapter 1")
                 for s in client.shots]
    plan = MatchingPlan(title="Water", difficulty="easy", knowledge_ids=["evap", "cond"], question_language="en")
    if ambiguous:
        with pytest.raises(AgentError, match="知识点"):
            asyncio.run(generate_shots(client, knowledge, plan))
        assert client.calls.count("blind_review_hoops") == 10
    else:
        game = asyncio.run(generate_shots(client, knowledge, plan))
        assert [g.right for g in game.pairs] == ["Evaporation", "Condensation"]
        assert all(len(g.distractors) == 3 for g in game.pairs)
        assert client.calls.count("blind_review_hoops") == 2
        assert client.calls.count("verify_shot_evidence") == 1
