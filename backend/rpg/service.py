"""Synchronous RPG methods for CourseServices' bounded backend workers."""

import asyncio
import os
from functools import partial

from matching_agent.llm import DeepSeekClient

from . import lesson_author, offline
from .agent import RPGAgent
from .lesson_provider import lesson_client
from .validation import RPGContentError, select
from ..provider import trace_tool


class RPGService:
    def __init__(self, *, live=False, client_factory=DeepSeekClient):
        self.live = live
        self.client_factory = client_factory

    def _invoke(self, method, *args):
        async def run():
            # Flash writes directly in the learner's language from the original evidence.
            # Planning does not need a translation pass or a second model provider.
            flash = lesson_client() if self.live and method in {"plan", "generate"} else None
            client = flash or (self.client_factory() if self.live else None)
            try:
                if flash and method == "plan":
                    knowledge, preferences, previous_report = args
                    with trace_tool("plan_course_lessons"):
                        selected, warnings = select(knowledge, preferences, previous_report)
                        return offline.assemble_plan(preferences, selected, offline.local_plan(preferences, selected), warnings)
                operation = partial(lesson_author.generate, flash) if flash else getattr(RPGAgent(client), method)
                if client is None:
                    return await operation(*args)
                deadline = max(.01, float(os.getenv("EDUGAME_SERVICE_TIMEOUT", "400")) - .25)
                async with asyncio.timeout(deadline):
                    return await operation(*args)
            finally:
                if client is not None:
                    await client.close()
        return asyncio.run(run())

    def recommend_game_type(self, knowledge, preferences):
        return self._invoke("recommend", knowledge, preferences)

    def plan_rpg(self, knowledge, preferences, previous_report=None):
        return self._invoke("plan", knowledge, preferences, previous_report)

    def generate_rpg(self, knowledge, plan, previous=None):
        result = self._invoke("generate", knowledge, plan, previous)
        if not result.validation.valid:
            raise RPGContentError("本轮关卡未通过资料与内容核验，请调整范围或补充更具体的资料后再生成。")
        return result.config

    def feedback_rpg(self, report, knowledge):
        return self._invoke("feedback", report, knowledge)
