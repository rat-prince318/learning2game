"""Check source matching, independent answer keys and both teaching languages."""

from fractions import Fraction

import pytest

from backend.models import KnowledgeItem
from backend.physics_exam import solve_part
from backend.rpg.models import RPGChallengeInternal, RPGOption
from backend.rpg.physics_drills import _TOPICS, _choice, physics_drills


VECTORS = "Two vectors u = 1^i + 2^j and v = 2^i + 3^k."
FLYWHEEL = ("A flywheel is undergoing constant angular acceleration. Its angular acceleration is "
            "0.500 rad/s2. The flywheel reaches an angular velocity of 6.00 rad/s at t = 4.00 s.")
PULLEY = ("A block hangs from a massless cable wrapped around a uniform solid disk pulley. "
          "The cable unwinds without slipping.")
CART = "A cart of mass 7 kg travels at 6 m/s."


def verified(setup, ask):
    source = solve_part(setup, ask)
    assert source is not None
    entry = source.en
    item = KnowledgeItem(knowledge_id="concept-1", term=entry.term, definition=entry.definition,
                         source_ref="practice handout / p. 1", evidence=setup, exam_question=source)
    choices = [RPGOption(id="o" + str(i), text=value) for i, value in enumerate(entry.options)]
    q = RPGChallengeInternal(challenge_id="exercise-1", knowledge_id=item.knowledge_id,
                             prompt=entry.prompt, options=choices, correct_option_id=choices[source.correct_index].id,
                             hint=entry.hint, explanation=entry.explanation, source_ref=item.source_ref,
                             evidence=setup, success_text="Clear", remediation_text="Read your notes")
    return item, q


@pytest.mark.parametrize(("setup", "ask"), [
    (VECTORS, "Find u + v."), (VECTORS, "Find u · v."), (VECTORS, "Find u × v."),
    (FLYWHEEL, "Find the initial angular velocity."), (FLYWHEEL, "Find the angular displacement."),
    (FLYWHEEL, "Find the average angular velocity."), (PULLEY, "Find the angular speed of the pulley."),
    (PULLEY, "Find the rotational kinetic energy of the pulley."),
    ("An object of mass 8 kg accelerates at 3 m/s².", "Find the net force."),
    (CART, "Find its kinetic energy."), (CART, "Find its momentum."),
])
def test_verified_topics_get_four_distinct_bilingual_transfers(setup, ask):
    item, q = verified(setup, ask)
    localized = [physics_drills(q, item, lang) for lang in ("zh", "en")]
    for deck in localized:
        assert len({c.challenge_id for c in deck}) == len({c.prompt for c in deck}) == 4
        assert all(c.prompt != q.prompt and c.challenge_id != q.challenge_id for c in deck)
        assert all((c.knowledge_id, c.source_ref) == (item.knowledge_id, item.source_ref) for c in deck)
        assert all(len({o.text for o in c.options}) == len({o.id for o in c.options}) == 3 for c in deck)
        assert len({o.id for c in deck for o in c.options}) == 12
        assert all(c.hint != c.explanation and r"\(" in c.explanation for c in deck)
    for zh, en in zip(*localized):
        assert zh.prompt != en.prompt
        assert any("\u3400" <= char <= "\u9fff" for char in zh.prompt)
        assert not any("\u3400" <= char <= "\u9fff" for char in en.prompt)
        correct = lambda card: next(o.text for o in card.options if o.id == card.correct_option_id)
        assert correct(zh) == correct(en)
    assert physics_drills(q, item, "en") == localized[1]


def test_numerical_keys_and_foils_for_small_integer_examples():
    # Recompute independently for a=7, b=4 in the printed problems. For
    # instance, the braking wheel turns through 7*8/2 = 28 radians.
    answers = {
        "add": (7, 4, 15, -7), "dot": (28, -7, -28, 65), "cross": (28, -7, 14, 0),
        "initial": (16, 15, 3, 4), "angle": (64, 14, 28, 112), "mean": (11, 7, 15, 15),
        "rim": (7, 28, 7, 7), "disk": (112, 28, 28, 12), "force": (4, 7, -28, 4),
        "energy": (63, 4, 4, 336), "momentum": (-28, 7, 11, -56),
    }
    assert {topic for _, topic in _TOPICS.values()} == set(answers)
    for builder, topic in _TOPICS.values():
        assert tuple(problem.values[0] for problem in builder(topic, 7, 4)) == answers[topic]
        for a in range(3, 29):
            for b in range(3, 16):
                for problem in builder(topic, a, b):
                    assert len(set(problem.values)) == 3
    assert _choice(Fraction(15, 2), "m") == r"\(\frac{15}{2}\,\mathrm{m}\)"


def test_unverified_topics_and_mismatched_records_do_not_get_physics_drills():
    item, q = verified(CART, "Find its kinetic energy.")
    assert physics_drills(q, item.model_copy(update={"exam_question": None}), "en") == []
    assert physics_drills(q, item.model_copy(update={"knowledge_id": "other"}), "zh") == []
    source = item.exam_question
    other = source.model_copy(update={"en": source.en.model_copy(update={"term": "Solar energy policy"})})
    assert physics_drills(q, item.model_copy(update={"exam_question": other}), "zh") == []
