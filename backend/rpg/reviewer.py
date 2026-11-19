"""Independent editorial QA sees the student's view and an unkeyed reference sheet."""

from secrets import SystemRandom
from typing import Literal

from pydantic import Field, create_model

from ..models import StrictModel
from .models import RPGIssue, RPGValidationReport

Issue = Literal["ok", "ambiguous_choices", "unsupported_detail", "hint_leak", "revealed_answer",
                "unanswerable", "difficulty_mismatch"]


def prepare(game, plan, pool):
    random = SystemRandom()
    scene_views, expected, fields = [], {}, {}
    for scene in game.scenes:
        questions = {}
        for q in scene.challenges:
            slot = f"decision_{len(expected) + 1}"
            options = list(q.options)
            random.shuffle(options)  # The private draft puts its answer first before publication.
            labels = dict(zip("ABCD", options))
            questions[slot] = {"prompt": q.prompt, "available_hint": q.hint,
                               "choices": {letter: option.text for letter, option in labels.items()}}
            key = next(letter for letter, option in labels.items() if option.id == q.correct_option_id)
            expected[slot] = (key, q.challenge_id)
            answer_type = Literal[tuple(labels) + ("unclear",)]
            verdict = create_model(f"BlindDecision{len(expected)}", __base__=StrictModel,
                                   choice=(answer_type, ...), issue=(Issue, ...),
                                   note=(str | None, Field(None, max_length=300)))
            fields[slot] = (verdict, ...)
        scene_views.append({"name": scene.name, "description": scene.description,
                            "npc": scene.npc.model_dump(), "quest_title": scene.quest.title,
                            "objective": scene.quest.objective, "reward_name": scene.quest.reward.item.name,
                            "challenges": questions})
    references = [k.model_dump(include={"term", "definition", "example", "evidence", "source_ref", "source_type"},
                               exclude_none=True) for k in pool]
    random.shuffle(references)
    view = {"reference_sheet": references, "difficulty": plan.difficulty, "rules": game.rules,
            "title": game.title, "learning_objectives": plan.learning_objectives, "rationale": plan.rationale,
            "warnings": game.warnings, "scenes": scene_views}
    return view, create_model("BlindReview", __base__=StrictModel, **fields), expected


def grade(review, expected):
    issues, findings = [], []
    for slot, (answer, challenge_id) in expected.items():
        decision = getattr(review, slot)
        code = decision.issue
        if code == "ok" and decision.choice != answer:
            code = "blind_answer_mismatch"
        if code != "ok":
            issues.append(RPGIssue(code=code, challenge_id=challenge_id, message="请对照资料复核本题的线索和选项。"))
            findings.append({"slot": slot, "code": code, "note": decision.note or ""})
    return RPGValidationReport(valid=not issues, issues=issues), findings
