"""Tool dispatcher plus a deliberately content-free event log for D."""
from __future__ import annotations

import inspect
import json
import time
from dataclasses import dataclass
from typing import Any, Callable

from pydantic import BaseModel, ValidationError

from .errors import AgentError
from .llm import ModelClient, ToolCall
from .models import Contract, Text, new_id


class EmptyArgs(Contract):
    pass


class PlanArgs(Contract):
    plan_id: Text


class MaterialArgs(Contract):
    material_id: Text


class ImageArgs(Contract):
    image_id: Text


class SessionArgs(Contract):
    session_id: Text


@dataclass
class ToolSpec:
    name: str
    description: str
    arguments: type[BaseModel]
    handler: Callable

    def schema(self):
        return {"type": "function", "function": {
            "name": self.name, "description": self.description,
            "parameters": self.arguments.model_json_schema(),
        }}


def safe_result_summary(value: Any) -> dict:
    """Only host-defined counters/statuses: no arbitrary tool text or evidence."""
    if not isinstance(value, dict):
        return {}
    summary = {}
    for field in ("actual_pair_count", "repair_count"):
        if isinstance(value.get(field), int):
            summary[field] = value[field]
    if isinstance(value.get("repair_applied"), bool):
        summary["repair_applied"] = value["repair_applied"]
    report = value.get("validation")
    if isinstance(report, dict):
        summary.update(passed=report.get("passed") is True,
                       semantic_checked=report.get("semantic_checked") is True,
                       issue_count=len(report.get("issues", [])))
    for field in ("reviews", "warnings"):
        if isinstance(value.get(field), list):
            summary[field + "_count"] = len(value[field])
    if value.get("next_action") in {"validate_matching_config", "repair_matching_config", "complete"}:
        summary["next_action"] = value["next_action"]
    if isinstance(value.get("candidate"), dict):
        pairs = value["candidate"].get("pairs")
        summary["candidate_pair_count"] = len(pairs) if isinstance(pairs, list) else 0
    return summary


class RunContext:
    def __init__(self, stage: str, client: ModelClient, callback: Callable | None = None):
        self.run_id = new_id("run")
        self.stage = stage
        self.client = client
        self.callback = callback
        self.model_calls = 0
        self.tool_calls = 0
        self.events: list[dict] = []
        self.seen_call_ids: set[str] = set()

    async def emit(self, event: str, **data):
        record = {"run_id": self.run_id, "stage": self.stage,
                  "mode": self.client.mode, "event": event, **data}
        self.events.append(record)
        if self.callback:
            try:
                result = self.callback(record)
                if inspect.isawaitable(result):
                    await result
            except Exception:
                # Observability consumers must not change business state or cause retries.
                self.events.append({"run_id": self.run_id, "stage": self.stage,
                                    "mode": self.client.mode, "event": "event_sink_failed"})

    def reserve_model_call(self):
        if self.model_calls >= 12:
            raise AgentError("model_call_limit", "当前阶段已达到 12 次模型交互上限。")
        self.model_calls += 1

    async def structured(self, task: str, prompt: str, payload: dict,
                         model: type[BaseModel]) -> dict:
        self.reserve_model_call()
        await self.emit("model_request", task=task, request_number=self.model_calls)
        return await self.client.structured(task, prompt, payload, model.model_json_schema())

    async def dispatch(self, call: ToolCall, available: dict[str, ToolSpec]) -> dict:
        if self.tool_calls >= 12:
            raise AgentError("tool_call_limit", "当前阶段已达到 12 次工具执行上限。")
        self.tool_calls += 1
        started = time.perf_counter()
        known = call.name in available
        safe_tool = call.name if known else "<unknown>"
        await self.emit("tool_started", tool=safe_tool,
                        call_id=call.id[:100], tool_number=self.tool_calls)
        try:
            if call.id in self.seen_call_ids:
                raise AgentError("duplicate_tool_call", "同一 tool_call_id 不得重复执行。")
            self.seen_call_ids.add(call.id)
            if not known:
                raise AgentError("tool_not_allowed", "当前阶段不允许调用该工具。")
            spec = available[call.name]
            try:
                raw = json.loads(call.arguments)
                args = spec.arguments.model_validate(raw, strict=True)
            except (json.JSONDecodeError, ValidationError, TypeError):
                raise AgentError("invalid_tool_arguments", "工具参数与 Schema 不符。") from None
            await self.emit("tool_arguments", tool=safe_tool, call_id=call.id[:100],
                            fields=sorted(type(args).model_fields),
                            argument_bytes=len(call.arguments.encode("utf-8")))
            value = await spec.handler(args)
            if isinstance(value, BaseModel):
                value = value.model_dump(mode="json")
            result = {"ok": True, "data": value}
            await self.emit("tool_finished", tool=safe_tool, call_id=call.id[:100],
                            ok=True, result_fields=sorted(value) if isinstance(value, dict) else [],
                            result_summary=safe_result_summary(value),
                            elapsed_ms=round((time.perf_counter() - started) * 1000))
        except AgentError as exc:
            if exc.code in {"model_call_limit", "tool_call_limit", "model_timeout",
                            "model_unavailable", "model_request_rejected"}:
                raise
            result = {"ok": False, "error": exc.as_dict()}
            await self.emit("tool_finished", tool=safe_tool, call_id=call.id[:100],
                            ok=False, error_code=exc.code,
                            elapsed_ms=round((time.perf_counter() - started) * 1000))
        except ValidationError:
            result = {"ok": False, "error": {"code": "invalid_model_structure",
                                             "message": "模型输出未通过结构校验。"}}
            await self.emit("tool_finished", tool=safe_tool, call_id=call.id[:100],
                            ok=False, error_code="invalid_model_structure")
        except Exception:
            # Never expose arbitrary provider/adapter exceptions, which may contain raw data.
            raise AgentError("tool_execution_failed", "工具执行失败，请检查接入模块。") from None
        return result

