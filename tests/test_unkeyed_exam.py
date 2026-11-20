"""A no-key paper can publish only after answer-free solving and two isolated language checks."""

import json

import pytest

from backend.exam_material import knowledge_from_exam, parse_exam
from backend.material_processing import Material, MaterialError


PREMISE = "Three notebooks sell for 24 coins each and one atlas sells for 65 coins."
TASK = "Which order increases the seller's earnings the most and by how much?"


def paper(*lines):
    material = Material()
    for i, line in enumerate(("Economics Exam", *lines), start=1):
        material.add_text(f"line:{i}", f"line {i}", line)
    return material


class Economics:
    def __init__(self, bad=""):
        self.calls = []
        self.bad = bad
        self.positions = []
        self.options = {
            "en": ["The notebooks, by 7 coins.", "The atlas, by 7 coins.", "Both yield the same earnings."],
            "zh": ["笔记本订单多赚七枚。", "地图册订单多赚七枚。", "两份订单的收入相同。"],
        }

    def complete(self, prompt, **kwargs):
        instruction, raw = prompt.split("\n", 1)
        body = json.loads(raw)
        stage = instruction.split(".")[0]
        self.calls.append(stage)
        if stage == "OPEN SOLVER":
            assert set(body) == {"conditions", "task"}
            return [
                {
                    "complete": True,
                    "reasoning_task": True,
                    "unique": self.bad != "ambiguous",
                    "condition_quote": "Fabricated premise" if self.bad == "quote" else PREMISE,
                    "task_quote": TASK,
                    "answer": "The notebooks earn seven coins more.",
                    "working": "Three notebooks earn 72 coins, which exceeds the atlas price by 7 coins.",
                }
            ]
        if stage == "BILINGUAL AUTHOR":
            assert "independent_solution" in body and body["original"]["task"] == TASK
            wordings = {
                "en": {
                    "term": "Earnings comparison",
                    "definition": "The notebooks earn seven more coins.",
                    "prompt": PREMISE + " " + TASK,
                    "explanation": "The two totals differ by seven coins.",
                    "hint": "Sum the income for each order.",
                },
                "zh": {
                    "term": "订单收益比较",
                    "definition": "笔记本订单的收益比地图册多七枚。",
                    "prompt": "三本笔记本每本售价二十四枚，另一个订单的一本地图册售价六十五枚。哪个订单收入更高，相差多少？",
                    "explanation": "两份订单的收入相差七枚。",
                    "hint": "分别计算两份订单的收入。",
                },
            }
            for lang, entry in wordings.items():
                entry["options"] = self.options[lang]
            return [{"question": {"correct_index": 0, **wordings}}]
        assert stage == "BLIND REVIEW"
        assert set(body) == {"student_language", "options", "prompt", "original"}
        lang = body["student_language"]
        assert "hint" not in raw and "independent_solution" not in raw and "correct_index" not in raw
        choice = next(letter for letter, value in body["options"].items() if value == self.options[lang][0])
        self.positions.append(choice)
        reasons = {
            "en": "Three notebooks earn 72 coins, which exceeds 65 by seven coins.",
            "zh": "三本笔记本共收入七十二枚，比地图册的六十五枚多七枚。",
        }
        answer = body["options"][choice]
        if lang == self.bad:
            answer = next(v for v in body["options"].values() if v != answer)
        checks = {
            k: {"why": "Compared against the derived order earnings.", "matches": v == answer}
            for k, v in body["options"].items()
        }
        return [
            {
                "valid": True,
                "checks": checks,
                "source_quote": "changed evidence" if self.bad == "review_quote" else PREMISE,
                "reason": reasons[lang],
            }
        ]


def extract(m, service):
    return knowledge_from_exam(m, parse_exam(m, "handout.txt"), "handout.txt", live_provider=service)


def test_no_key_source_runs_open_solver_before_author_and_two_independent_reviews():
    m = paper("1. " + PREMISE, "(a) " + TASK)
    reviewer = Economics()
    item = extract(m, reviewer).knowledge[0]
    assert reviewer.calls == ["OPEN SOLVER", "BILINGUAL AUTHOR", "BLIND REVIEW", "BLIND REVIEW"]
    assert len(set(reviewer.positions)) == 2
    assert item.knowledge_type == "model_checked_exam_problem" and "model-checked" in item.source_ref
    assert item.evidence == PREMISE + " " + TASK and item.source_ids == ["line:2", "line:3"]
    assert "七十二" in item.exam_question.zh.explanation and "72" in item.exam_question.en.explanation


@pytest.mark.parametrize(
    "invalid,count", [("quote", 1), ("ambiguous", 1), ("zh", 3), ("en", 4), ("review_quote", 3)]
)
def test_any_missing_evidence_or_failed_blind_choice_discards_the_whole_question(invalid, count):
    reviewer = Economics(invalid)
    with pytest.raises(MaterialError):
        extract(paper("1. " + PREMISE, "(a) " + TASK), reviewer)
    assert len(reviewer.calls) == count


@pytest.mark.parametrize(
    "line",
    [
        "1. What is the time allowed for the final examination?",
        "1. See Figure 3 for the data distribution. Which plan earns more?",
        "1. Which of the following plans would increase a seller's earnings if",
        "1. 根据图表中的数据，判断哪种策略收益最高？",
    ],
)
def test_unavailable_figures_or_instructions_never_reach_solver(line):
    reviewer = Economics()
    with pytest.raises(MaterialError):
        extract(paper(line), reviewer)
    assert reviewer.calls == []


def test_each_upload_caps_unkeyed_inference():
    reviewer = Economics()
    lines = [s for n in range(1, 13) for s in (f"{n}. " + PREMISE, "(a) " + TASK)]
    extract(paper(*lines), reviewer)
    assert reviewer.calls.count("OPEN SOLVER") == 8
    assert len(reviewer.calls) == 32


def test_worked_answer_precedes_the_unkeyed_branch_even_if_rejected():
    class WrongQuote:
        def __init__(self):
            self.calls = 0

        def complete(self, prompt, **kwargs):
            assert "worked solution" in prompt
            self.calls += 1
            return [{"answer_quote": "fabricated"}]

    provider = WrongQuote()
    with pytest.raises(MaterialError):
        extract(
            paper("1. " + PREMISE, "(a) " + TASK, "Solution: The notebook order earns 7 more coins."),
            provider,
        )
    assert provider.calls == 1
