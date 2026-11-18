"""Small OpenAI-compatible transport; retries never turn into offline results."""
from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass, field
from typing import Any, Protocol

from openai import AsyncOpenAI, APIConnectionError, APIStatusError, APITimeoutError

from .errors import AgentError


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: str


@dataclass
class ModelMessage:
    content: str | None = None
    tool_calls: list[ToolCall] = field(default_factory=list)

    def as_message(self) -> dict:
        result: dict[str, Any] = {"role": "assistant", "content": self.content}
        if self.tool_calls:
            result["tool_calls"] = [
                {"id": c.id, "type": "function",
                 "function": {"name": c.name, "arguments": c.arguments}}
                for c in self.tool_calls
            ]
        return result


class ModelClient(Protocol):
    mode: str

    async def choose(self, messages: list[dict], tools: list[dict]) -> ModelMessage: ...

    async def structured(self, task: str, system: str, payload: dict,
                         schema: dict) -> dict: ...


class DeepSeekClient:
    mode = "live"

    def __init__(self, *, api_key: str | None = None, base_url: str | None = None,
                 model: str | None = None, timeout: float | None = None,
                 sdk: Any = None, retry_delay: float = 1.0):
        key = api_key or os.getenv("DEEPSEEK_API_KEY")
        if not key and sdk is None:
            raise AgentError("missing_api_key", "请在本地 .env 中设置 DEEPSEEK_API_KEY。")
        self.model = model or os.getenv("DEEPSEEK_MODEL", "deepseek-flash")
        self.base_url = base_url or os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
        self.timeout = timeout or float(os.getenv("AGENT_TIMEOUT_SECONDS", "60"))
        self.sdk = sdk or AsyncOpenAI(api_key=key, base_url=self.base_url,
                                     timeout=self.timeout, max_retries=0)
        self.retry_delay = retry_delay
        self.request_count = 0
        self.usage = {"prompt_tokens": 0, "completion_tokens": 0}

    async def close(self):
        await self.sdk.close()

    async def _request(self, **kwargs):
        for attempt in range(3):
            self.request_count += 1
            try:
                response = await asyncio.wait_for(
                    self.sdk.chat.completions.create(
                        model=self.model, stream=False, max_tokens=8192,
                        extra_body={"thinking": {"type": "disabled"}}, **kwargs),
                    timeout=self.timeout,
                )
                usage = getattr(response, "usage", None)
                if usage:
                    for key in self.usage:
                        self.usage[key] += getattr(usage, key, 0) or 0
                if not response.choices:
                    raise AgentError("empty_model_response", "模型返回了空响应。")
                choice = response.choices[0]
                if choice.finish_reason == "length":
                    raise AgentError("model_output_truncated", "模型输出超出长度限制，请缩短资料。")
                return choice.message
            except (APITimeoutError, APIConnectionError, asyncio.TimeoutError):
                failure = AgentError("model_timeout", "模型请求超时或连接失败。", retryable=True)
            except APIStatusError as exc:
                status = exc.status_code
                if status == 429 or status >= 500:
                    failure = AgentError("model_unavailable", "模型限流或暂时不可用。", retryable=True)
                else:
                    raise AgentError("model_request_rejected", "模型拒绝请求，请检查凭据、模型名和参数。",
                                     details={"http_status": status}) from None
            if attempt == 2:
                raise failure from None
            await asyncio.sleep(self.retry_delay * (2 ** attempt))
        raise AssertionError("unreachable")

    async def choose(self, messages: list[dict], tools: list[dict]) -> ModelMessage:
        msg = await self._request(messages=messages, tools=tools, tool_choice="auto")
        calls = [ToolCall(id=c.id, name=c.function.name, arguments=c.function.arguments)
                 for c in (msg.tool_calls or [])]
        return ModelMessage(content=msg.content, tool_calls=calls)

    async def structured(self, task: str, system: str, payload: dict, schema: dict) -> dict:
        msg = await self._request(
            messages=[
                {"role": "system", "content": system + "\nReturn a JSON object matching this schema:\n"
                 + json.dumps(schema, ensure_ascii=False)},
                {"role": "user", "content": json.dumps(
                    {"task": task, "untrusted_data": payload}, ensure_ascii=False)},
            ], response_format={"type": "json_object"},
        )
        try:
            value = json.loads(msg.content or "")
        except (json.JSONDecodeError, TypeError):
            raise AgentError("invalid_json", "模型未返回合法 JSON。") from None
        if not isinstance(value, dict):
            raise AgentError("invalid_json", "模型输出必须是 JSON 对象。")
        return value

