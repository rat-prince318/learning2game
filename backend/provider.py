"""Bound the time D waits for A/B, even if a provider's SDK stalls."""

from concurrent.futures import Future
from contextlib import contextmanager
from contextvars import ContextVar
from re import fullmatch
from threading import Thread
from time import perf_counter
from typing import Literal

from pydantic import Field

from .models import StrictModel


class ToolCall(StrictModel):
    name: str
    status: Literal["ok", "failed"]
    duration_ms: float = Field(ge=0)


_trace = ContextVar("edugame_tool_trace", default=None)


@contextmanager
def trace_tool(name: str):
    """A/B wrap actual tool executions; record names, outcomes and duration only."""
    if not fullmatch(r"[A-Za-z][A-Za-z0-9_.-]{0,63}", name):
        raise ValueError("Use a short, static tool name.")
    started = perf_counter()
    outcome = "failed"
    try:
        yield
        outcome = "ok"
    finally:
        entries = _trace.get()
        if entries is not None and len(entries) < 100:
            entries.append({"name": name, "status": outcome,
                            "duration_ms": round(1000 * (perf_counter() - started), 3)})


def call_service(app, method_name, *args, tool_trace=None):
    slots = app.state.service_slots
    if not slots.acquire(blocking=False):
        raise RuntimeError("All provider slots are busy.")
    future = Future()
    entries = []

    def invoke():
        token = _trace.set(entries)
        try:
            result = getattr(app.state.services, method_name)(*args)
        except Exception as exc:
            future.set_exception(exc)
        else:
            future.set_result(result)
        finally:
            _trace.reset(token)
            slots.release()

    # Adapters do not receive a DB handle. Late results cannot update the job.
    # A hung SDK retains one of four slots until it returns or the server restarts.
    thread = Thread(target=invoke, name=f"edugame-{method_name}", daemon=True)
    try:
        thread.start()
    except RuntimeError:
        slots.release()
        raise
    try:
        return future.result(timeout=app.state.service_timeout)
    finally:
        if tool_trace is not None:
            tool_trace.extend(entries[:])
