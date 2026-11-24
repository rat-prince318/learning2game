"""The same Flash deployment writes lessons and reviews their questions."""
import os

from matching_agent.llm import BAILIAN_FLASH, BAILIAN_URL, DeepSeekClient


def lesson_enabled() -> bool:
    return bool(os.getenv("DASHSCOPE_API_KEY")) and os.getenv("EDUGAME_MODE", "live").strip().lower() == "live"


def lesson_client():
    if lesson_enabled():
        return DeepSeekClient(api_key=os.environ["DASHSCOPE_API_KEY"], base_url=BAILIAN_URL, model=BAILIAN_FLASH)
    return None
