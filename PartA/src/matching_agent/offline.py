"""Deterministic test double. It is NOT an LLM or a semantic correctness proof."""
from __future__ import annotations

import copy
import json
from uuid import uuid4

from .errors import AgentError
from .llm import ModelMessage, ToolCall


class OfflineClient:
    mode = "offline"

    def __init__(self, variants: dict | None = None, *, inject: str | None = None):
        self.variants = variants or {}
        self.inject = inject
        self.structured_calls: list[str] = []
        self.conversations: list[list[dict]] = []

    async def choose(self, messages: list[dict], tools: list[dict]) -> ModelMessage:
        self.conversations.append(copy.deepcopy(messages))
        context = json.loads(messages[1]["content"])["context"]
        name = tools[0]["function"]["name"]
        fields = tools[0]["function"]["parameters"].get("properties", {})
        args = {key: context[key] for key in fields if key in context}
        return ModelMessage(tool_calls=[ToolCall("offline_" + uuid4().hex, name, json.dumps(args))])

    def _pair(self, knowledge: dict, *, familiar=False, practice=False):
        kid = knowledge["knowledge_id"]
        variants = self.variants.get(kid, {})
        right = variants.get("practice" if practice else "familiar", knowledge["definition"]) if familiar or practice else knowledge["definition"]
        return {"pair_id": "pair_" + kid, "knowledge_id": kid, "left": knowledge["concept"],
                "right": right, "explanation": knowledge["evidence"],
                "source_refs": list(knowledge["source_refs"])}

    async def structured(self, task: str, system: str, payload: dict, schema: dict) -> dict:
        self.structured_calls.append(task)
        if task == "design_matching_plan":
            prefs = payload["preferences"]
            required = payload["required_weak_ids"]
            familiar = prefs["level"] == "familiar"
            pool = sorted(payload["eligible"], key=lambda k: (
                k["knowledge_id"] not in required,
                k["difficulty"] != ("advanced" if familiar else "basic"), k["knowledge_id"]))
            return {"selected_knowledge_ids": [k["knowledge_id"] for k in pool[:payload["target_count"]]],
                    "relation_type": payload["relation_type"], "difficulty": prefs.get("difficulty") or ("medium" if familiar else "easy"),
                    "language": payload["output_language"],
                    "rationale": ("离线样例：优先薄弱点，并按学习水平选择可区分的概念。" if payload["output_language"] == "zh"
                                  else "Offline fixture: prioritize review needs and select concepts for this learning level.")}
        if task == "generate_matching_config":
            if self.inject == "invalid_json":
                raise AgentError("invalid_json", "Injected malformed JSON in offline test.")
            familiar = payload["confirmed_plan"]["preferences"]["level"] == "familiar"
            practice = bool(payload["previous_pairs"])
            pairs = [self._pair(k, familiar=familiar, practice=practice) for k in payload["selected_knowledge"]]
            if self.inject in {"duplicate", "persistent_duplicate"}:
                pairs[1]["right"] = pairs[0]["right"]
            if self.inject == "unsupported":
                pairs[0]["explanation"] = "OFFLINE_UNSUPPORTED_CLAIM"
            if self.inject == "no_source":
                pairs[0]["source_refs"] = ["missing_source"]
            return {"title": "离线配对演示" if payload["output_language"] == "zh" else "Offline matching demonstration",
                    "instructions": "选择概念对应的描述。" if payload["output_language"] == "zh" else "Match each concept to its description.",
                    "pairs": pairs}
        if task == "validate_matching_config":
            issues = []
            for pair in payload["game"]["pairs"]:
                if pair["explanation"] == "OFFLINE_UNSUPPORTED_CLAIM":
                    issues.append({"pair_id": pair["pair_id"], "knowledge_id": pair["knowledge_id"],
                                   "code": "unsupported", "reason": "离线注入的无依据解释。",
                                   "suggestion": "恢复资料证据中的解释。"})
            return {"issues": issues}
        if task == "repair_matching_config":
            knowledge = {k["knowledge_id"]: k for k in payload["selected_knowledge"]}
            pairs = [self._pair(knowledge[p["knowledge_id"]],
                               familiar=payload["confirmed_plan"]["preferences"]["level"] == "familiar",
                               practice=bool(payload["previous_pairs"])) for p in payload["repairable_pairs"]]
            if self.inject == "persistent_duplicate" and len(pairs) > 1:
                pairs[1]["right"] = pairs[0]["right"]
            return {"replacements": pairs,
                    "title": ("修复后的离线配对" if payload["output_language"] == "zh" else "Repaired offline matching game") if payload["allow_header_repair"] else None,
                    "instructions": ("选择对应描述。" if payload["output_language"] == "zh" else "Match each concept to its description.") if payload["allow_header_repair"] else None,
                    "warnings": []}
        if task == "generate_learning_feedback":
            chinese = payload["output_language"] == "zh"
            return {"summary": ("本轮表现提示可继续复习以下概念，并结合资料比较它们的区别。" if payload["weak_knowledge_ids"]
                                else "本轮表现稳定，可以尝试不同表述的练习。") if chinese else (
                                "Review the concepts below and compare their evidence." if payload["weak_knowledge_ids"]
                                else "Try varied descriptions in another practice session."),
                    "reviews": [{"knowledge_id": k["knowledge_id"], "explanation": k["evidence"],
                                 "source_refs": k["source_refs"]} for k in payload["knowledge"]]}
        raise AgentError("unsupported_offline_task", "离线客户端未实现该测试任务。")
