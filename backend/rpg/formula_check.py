"""Use the shipped browser renderer when Node is available on the generation host."""

import asyncio
import json
import shutil
import subprocess
from pathlib import Path


_RENDERER = Path(__file__).resolve().parents[2] / "scripts" / "check_course_formulas.mjs"


async def verify_rendering(unit):
    fields = [unit.title, unit.note]
    for question in unit.questions:
        fields.extend((question.prompt, *question.options, question.hint, question.explanation))
    math_fields = [text for text in fields if "\\" in text or "$" in text]
    node = shutil.which("node")
    if not math_fields or node is None:
        return
    # Text enters stdin as JSON, never as a shell/JS expression.
    result = await asyncio.to_thread(subprocess.run, [node, str(_RENDERER)],
                                     input=json.dumps(math_fields), capture_output=True,
                                     encoding="utf-8", timeout=8, check=True)
    failed = json.loads(result.stdout)
    if failed:
        raise ValueError("KaTeX could not render this formula. Rewrite it using supported LaTeX: "
                         + math_fields[failed[0]][:250])
