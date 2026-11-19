"""Synchronous RPG methods for CourseServices' bounded backend workers."""

import asyncio
import os

from matching_agent.llm import DeepSeekClient

from .agent import RPGAgent
from .validation import RPGContentError


class RPGService:
    def __init__(self, *, live=False, client_factory=DeepSeekClient):
        self.live = live
        self.client_factory = client_factory

    def _invoke(self, method, *args):
        async def run():
            client = self.client_factory() if self.live else None
            try:
                agent = RPGAgent(client)
                operation = getattr(agent, method)
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
