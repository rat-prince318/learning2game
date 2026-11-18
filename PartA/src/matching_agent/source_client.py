"""Source-based local runner for the classroom app's tool workflow."""

import json
import re
from uuid import uuid4

from .llm import ModelMessage, ToolCall
from .validation import normalized
from .wording import has_unwanted_wording


def _excerpt(text, limit):
    """Keep an entire sentence where possible. Mark shortened extracts explicitly."""
    if len(text) <= limit:
        return text
    for match in reversed(list(re.finditer(r"[。！？!?；;]|[.](?=\s)", text[:limit]))):
        return text[: match.end()]
    return text[:limit - 1].rstrip() + "…"


def _card_text(item, value):
    # A cloze keeps a definition usable when the source repeats the answer word.
    value = re.sub(re.escape(item["concept"]), "____", value, flags=re.IGNORECASE)
    return _excerpt(value, 180)


def _choices(item, language, relation):
    definition = item["definition"]
    example = item.get("example")
    preferred = example if relation == "term_scenario" and example else definition
    candidates = [preferred]
    if example and example != preferred:
        candidates.append(example)
    # A different sourced sentence can supply a second retrieval cue.
    candidates += [p.strip() for p in re.split(r"(?<=[。！？!?;；])|\.\s+", definition)
                   if len(p.strip()) >= 12 and p.strip().rstrip(".。") != preferred.rstrip(".。")]
    if language == "zh":
        candidates.append("填入概念：____ 的特点是" + definition.rstrip("。.") + "。")
    else:
        candidates.append("Fill in the term: ____ — " + definition)
    options = [_card_text(item, c) for c in candidates if c]
    return list(dict.fromkeys(c for c in options if not has_unwanted_wording(c)
                              and normalized(item["concept"]) not in normalized(c)))


def _make_pair(item, payload):
    language = payload["output_language"]
    options = _choices(item, language, payload["confirmed_plan"]["relation_type"])
    previous = {p["knowledge_id"]: p["right"] for p in payload.get("previous_pairs", [])}
    if not options:
        raise ValueError("A shorter direct description is required for this concept.")
    right = next((t for t in options if t != previous.get(item["knowledge_id"])), options[0])
    return {"pair_id": "pair_" + item["knowledge_id"], "knowledge_id": item["knowledge_id"],
            "left": item["concept"], "right": right, "explanation": _excerpt(item["definition"], 400),
            "source_refs": item["source_refs"]}


class SourceClient:
    """Implements the same tool protocol locally. No model is contacted."""

    mode = "local"

    async def choose(self, messages, tools):
        spec = tools[0]["function"]
        context = json.loads(messages[1]["content"])["context"]
        fields = spec["parameters"].get("properties", {})
        args = {field: context[field] for field in fields if field in context}
        return ModelMessage(tool_calls=[ToolCall(uuid4().hex, spec["name"], json.dumps(args))])

    async def structured(self, task, system, payload, schema):
        zh = payload.get("output_language", "zh") == "zh"
        if task == "design_matching_plan":
            prefs = payload["preferences"]
            study_cases = prefs["learning_goal"] == "distinguish" or prefs["level"] == "familiar"
            required = set(payload["required_weak_ids"])
            pool = sorted(payload["eligible"], key=lambda item: (
                item["knowledge_id"] not in required,
                (not item.get("example")) if study_cases else len(item["definition"]),
            ))
            reason = ("先比较相近概念的描述，再回到资料核对各自的特点。" if study_cases
                      else "从资料里的简短释义开始，先记住各个概念的主要特征。")
            if payload["relation_type"] == "component_function":
                reason = "对照图示中的结构与功能，找出每个部件在图中的作用。"
            return {"selected_knowledge_ids": [k["knowledge_id"] for k in pool[:payload["target_count"]]],
                    "relation_type": payload["relation_type"],
                    "difficulty": prefs.get("difficulty") or ("medium" if study_cases else "easy"),
                    "language": payload["output_language"],
                    "rationale": reason if zh else "Match the terms against descriptions drawn from the handout."}

        if task in {"generate_matching_config", "repair_matching_config"}:
            selected = {k["knowledge_id"]: k for k in payload["selected_knowledge"]}
            if task == "repair_matching_config":
                return {"replacements": [_make_pair(selected[p["knowledge_id"]], payload)
                                         for p in payload["repairable_pairs"]]}
            pairs = [_make_pair(selected[k], payload) for k in payload["confirmed_plan"]["selected_knowledge_ids"]]
            return {"title": "课程配对练习" if zh else "Course matching practice",
                    "instructions": "选出与左侧概念相符的描述。" if zh else "Match each term to its description.",
                    "pairs": pairs}

        if task == "validate_matching_config":
            # The offline check verifies traceability to the allowed source-derived variants.
            # Semantic ambiguity across unrelated source facts needs a model or a reviewer.
            items = {k["knowledge_id"]: k for k in payload["selected_knowledge"]}
            issues = []
            for pair in payload["game"]["pairs"]:
                item = items[pair["knowledge_id"]]
                expected = _choices(item, payload["game"]["language"], payload["game"]["relation_type"])
                if pair["right"] not in expected or pair["explanation"] != _excerpt(item["definition"], 400):
                    issues.append({"code": "unsupported", "pair_id": pair["pair_id"],
                                   "knowledge_id": item["knowledge_id"], "reason": "卡片与所引资料有差异。",
                                   "suggestion": "按原资料重新选取定义或例子。"})
            return {"issues": issues}

        if task == "generate_learning_feedback":
            by_id = {k["knowledge_id"]: k for k in payload["knowledge"]}
            performance = {p["knowledge_id"]: p for p in payload["qualitative_performance"]}
            reviews = []
            for kid in payload["weak_knowledge_ids"]:
                p = performance[kid]
                if not p["completed"]:
                    tip = "从资料中找出定义，读完后合上资料，回忆关键词。"
                elif p["had_errors"]:
                    tip = "比较曾经混淆的选项，用自己的话说出这个概念的特点。"
                else:
                    tip = "回忆上轮提示中的线索，遮住提示再试。"
                if not zh:
                    tip = ("Compare the competing descriptions and explain your choice."
                           if p["had_errors"] else "Read the source, cover it, and recall the defining clue.")
                reviews.append({"knowledge_id": kid, "explanation": tip,
                                "source_refs": by_id[kid]["source_refs"]})
            summary = ("复习时先看下列概念，再用新的描述练习配对。" if reviews
                       else "本轮配对顺利。可以更换学习材料，尝试新的概念。")
            return {"summary": summary if zh else ("Review the concepts below." if reviews
                                                   else "Try a new topic for your next round."),
                    "reviews": reviews}
        raise ValueError(f"Unknown source workflow step: {task}")
