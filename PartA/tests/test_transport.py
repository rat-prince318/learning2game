import json

import httpx
from openai import AsyncOpenAI
import pytest

from matching_agent.errors import AgentError
from matching_agent.llm import DeepSeekClient


def response(content=None, tools=None, finish_reason="stop"):
    return {"id": "mock_response", "object": "chat.completion", "created": 1,
            "model": "deepseek-flash", "choices": [{"index": 0, "finish_reason": finish_reason,
            "message": {"role": "assistant", "content": content, "tool_calls": tools}}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}}


def build(handler, **kwargs):
    sdk = AsyncOpenAI(api_key="test-key-not-real", base_url="https://api.deepseek.com",
                      http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)), max_retries=0)
    return DeepSeekClient(sdk=sdk, retry_delay=0, **kwargs)


async def test_real_sdk_request_shape_and_tool_protocol():
    requests = []
    def handler(request):
        body = json.loads(request.content)
        requests.append(body)
        assert request.url.path == "/chat/completions"
        assert body["thinking"] == {"type": "disabled"}
        assert body["stream"] is False and body["model"] == "deepseek-flash"
        if len(requests) == 1:
            return httpx.Response(200, json=response(tools=[{"id": "deepseek_real_format_id", "type": "function",
                "function": {"name": "lookup", "arguments": '{"id":"a"}'}}], finish_reason="tool_calls"))
        return httpx.Response(200, json=response(content="Finished"))
    client = build(handler)
    tools = [{"type": "function", "function": {"name": "lookup", "parameters": {"type": "object"}}}]
    messages = [{"role": "user", "content": "Read the data"}]
    first = await client.choose(messages, tools)
    assert first.tool_calls[0].id == "deepseek_real_format_id"
    messages += [first.as_message(), {"role": "tool", "tool_call_id": first.tool_calls[0].id, "content": '{"ok":true}'}]
    second = await client.choose(messages, tools)
    assert second.content == "Finished"
    assert requests[1]["messages"][-1]["tool_call_id"] == "deepseek_real_format_id"
    assert client.request_count == 2 and client.usage["prompt_tokens"] == 20
    await client.close()


@pytest.mark.parametrize("status", [429, 500, 503])
async def test_temporary_failures_retry_exactly_twice(status):
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(status, json={"error": {"message": "PRIVATE_PROVIDER_BODY"}})
    client = build(handler)
    with pytest.raises(AgentError) as exc:
        await client.choose([{"role": "user", "content": "test"}], [])
    assert len(calls) == 3 and exc.value.retryable
    assert "PRIVATE_PROVIDER_BODY" not in str(exc.value.as_dict())
    await client.close()


@pytest.mark.parametrize("status", [400, 401, 403, 404, 422])
async def test_permanent_failures_not_retried(status):
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(status, json={"error": {"message": "PRIVATE"}})
    client = build(handler)
    with pytest.raises(AgentError) as exc:
        await client.choose([], [])
    assert len(calls) == 1 and exc.value.code == "model_request_rejected"
    assert not exc.value.retryable
    await client.close()


async def test_timeout_has_finite_retries():
    calls = []
    def handler(request):
        calls.append(request)
        raise httpx.ReadTimeout("secret timeout detail", request=request)
    client = build(handler)
    with pytest.raises(AgentError) as exc:
        await client.choose([], [])
    assert exc.value.code == "model_timeout" and len(calls) == 3
    await client.close()


async def test_recovers_from_one_transient_failure():
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(503, json={}) if len(calls) == 1 else httpx.Response(200, json=response(content='{"ok":true}'))
    client = build(handler)
    result = await client.structured("example", "Return JSON", {"evidence": "fact"}, {"type": "object"})
    assert result == {"ok": True} and len(calls) == 2
    assert json.loads(calls[-1].content)["response_format"] == {"type": "json_object"}
    await client.close()


@pytest.mark.parametrize("content", ["not json", "[]", "null", "```json\n{}\n```"])
async def test_invalid_json_rejected(content):
    client = build(lambda _: httpx.Response(200, json=response(content=content)))
    with pytest.raises(AgentError) as exc:
        await client.structured("test", "Return JSON", {}, {})
    assert exc.value.code == "invalid_json"
    assert client.request_count == 1
    await client.close()


async def test_truncated_json_not_treated_as_complete():
    client = build(lambda _: httpx.Response(200, json=response(content="{}", finish_reason="length")))
    with pytest.raises(AgentError) as exc:
        await client.structured("test", "JSON", {}, {})
    assert exc.value.code == "model_output_truncated"
    await client.close()


def test_missing_key_fails_without_offline_fallback(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    with pytest.raises(AgentError) as exc:
        DeepSeekClient()
    assert exc.value.code == "missing_api_key"

