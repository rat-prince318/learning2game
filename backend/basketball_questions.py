"""Author short, self-contained basketball challenges and check them without the answer key."""
from __future__ import annotations

import asyncio
import hashlib
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path
from random import SystemRandom
from typing import Annotated

from matching_agent.errors import AgentError
from matching_agent.prompts import BOUNDARY
from matching_agent.wording import has_unwanted_wording
from pydantic import Field, ValidationError

from .course_metadata import is_course_metadata
from .models import GameConfigInternal, MatchingPair, StrictModel
from .provider import trace_tool
from .question_language import accepts

_VISUAL = re.compile(
    r"!\s*\[|<(?:img|svg|picture|canvas|image|iframe|object|embed)\b|data:\s*image/|"
    r"\\(?:includegraphics|href|html\w*)\b|\\begin\{(?:tikzpicture|picture)\}|https?://|"
    r"(?:下图|上图|附图|如图|见图|图中所|根据(?:下列|这幅|上|下)?[图表]|见附件|图\s*[一二三四五六七八九\d]+\s*(?:中|所示))|"
    r"\b(?:pictured|illustrated)\s+(?:above|below)|\b(?:as shown|shown)\s+(?:above|below)|"
    r"\b(?:figure|fig\.|diagram|image|table|graph)\s*(?:#?\d+\b|above|below)|"
    r"\b(?:see|using|from|in|consult|refer to|based on)\s+(?:the\s+)?(?:following |attached |accompanying )?"
    r"(?:diagram|figure|picture|image)\b|(?:^|[\s(/])[\w.-]+\.(?:png|gif|jpe?g|svg|webp)\b", re.I)
_RECALL = re.compile(r"下一句|上一句|原文(?:接下来|的下半句)|\b(?:next|preceding|following) sentence\b", re.I)
_MATH = re.compile(r"\$\$(.*?)\$\$|(?<!\\)\$(.+?)(?<!\\)\$|\\\((.+?)\\\)|\\\[(.+?)\\\]", re.S)
_BROKEN = re.compile(r"\\[()[\]]|\\(?:frac|sqrt|mathbf|mathrm|dfrac|tfrac)\b|[\x00-\x08\x0b\x0c\x0e-\x1f\ufffd]")


def text_problem(text: str) -> str | None:
    if _VISUAL.search(text) or _RECALL.search(text):
        return "The card requires an illustration, external reference or memorizing the source wording."
    # Escaped dollars are literal currency. Check math only inside known delimiters.
    for match in _MATH.finditer(text):
        expr = next(x for x in match.groups() if x is not None)
        depth = 0
        for char in re.sub(r"\\[{}]", "", expr):
            depth += int(char == "{") - int(char == "}")
            if depth < 0:
                break
        if depth or not expr.strip() or re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f\ufffd]", expr):
            return "A math expression has malformed TeX."
    remainder = _MATH.sub("", text)
    if _BROKEN.search(remainder) or re.search(r"(?<!\\)\$(?![\d\s])", remainder):
        return "Use complete math delimiters and preserve TeX escapes."
    return None


def eligible_item(item, language=None):
    if is_course_metadata(item.term):
        return False
    if item.exam_question:
        wordings = ([getattr(item.exam_question, language)] if language else
                    [item.exam_question.zh, item.exam_question.en])
        return all(not text_problem(value) for w in wordings
                   for value in (w.prompt, w.options[item.exam_question.correct_index], w.hint, w.explanation))
    return all(not text_problem(s) for s in (item.term, item.definition) if s)


class Shot(StrictModel):
    knowledge_id: str
    ball: Annotated[str, Field(min_length=2, max_length=360)]
    hoop: Annotated[str, Field(min_length=1, max_length=100)]
    hint: Annotated[str, Field(min_length=2, max_length=240)]
    explanation: Annotated[str, Field(min_length=3, max_length=500)]
    study_term: Annotated[str, Field(min_length=1, max_length=150)]


class Draft(StrictModel):
    shots: list[Shot] = Field(min_length=2, max_length=12)


class Judgement(StrictModel):
    ball_number: int = Field(ge=1, le=12, strict=True)
    valid_hoops: list[str] = Field(max_length=12)
    sound: bool = Field(strict=True)
    reason: Annotated[str, Field(min_length=1, max_length=500)]


class Review(StrictModel):
    decisions: list[Judgement] = Field(min_length=2, max_length=12)


class EvidenceCheck(StrictModel):
    knowledge_id: str
    supported: bool = Field(strict=True)
    reason: Annotated[str, Field(min_length=1, max_length=500)]


class EvidenceReview(StrictModel):
    checks: list[EvidenceCheck] = Field(min_length=2, max_length=12)


_AUTHOR = BOUNDARY + """
You design a physics-driven basketball learning game. Author one challenge per provided knowledge_id.
The BALL carries a short complete question, definition to recognize, or a concrete scenario / calculation.
The HOOP carries its concise answer (a result with units, named concept, or short phrase), visible at a distance.
Every ball must have exactly one correct hoop across this ENTIRE round. Aim for a single short sentence on the
ball and a few words or a formula on each backboard. Avoid naming the target concept inside a definition that
asks for its name. Prefer authentic examples, calculations and discriminating features over sentence completion.
For a vetted exercise retain the question's given quantities, units and required reasoning. Do not invent new
givens or trick questions. For prose ground the answer and explanation in the supplied facts. Use the selected
language for all fields; keep names, units and symbols intact. Use well-formed KaTeX math delimiters for formulas,
including on hoops; preserve signs, fractions, exponents and assumptions. Escape TeX backslashes in JSON.
Never use an image, file, URL or an instruction to look at a figure. A card must make sense in isolation.
Skip cover metadata, grading rules, incomplete stems, page recall and questions about sentence order.
The hint gives the first reasoning step, the explanation gives the reasoning and units, and study_term names
the concept. Match requested difficulty; use the evidence to adjust reasoning, never omit necessary context.
When previous cards exist prefer a different grounded application. When reviewer comments exist fix them.
"""
_REVIEW = BOUNDARY + """
Independently solve each numbered ball against ALL labelled hoops. For each ball list every defensible hoop
label (possibly zero or multiple), and a short reason. The author has not supplied a key. All needed conditions
must be present on the ball itself. Use only the information the player sees. Check signs, units, results and
language. Set sound=false for missing conditions, a ball that already gives its answer, missing illustrations,
truncated questions, faulty math, ambiguous wording or trivia about document organization. Use affirmative
wording for student text. Return one decision per ball. Never infer mapping from ordering.
"""


def _source(item, language):
    row = {"knowledge_id": item.knowledge_id, "term": item.term, "definition": item.definition,
           "evidence": item.evidence or item.definition, "example": item.example}
    if item.exam_question:
        entry = getattr(item.exam_question, language)
        row["verified_exercise"] = {"prompt": entry.prompt, "answer": entry.options[item.exam_question.correct_index],
                                    "reasoning": entry.explanation}
    return row


def _local_review(shots, ids, language):
    if len(shots) != len(ids) or {s.knowledge_id for s in shots} != set(ids):
        return ["Use every selected knowledge ID exactly once."]
    issues = []
    for side in ("ball", "hoop"):
        values = [" ".join(unicodedata.normalize("NFKC", getattr(s, side)).casefold().split()) for s in shots]
        if len(set(values)) != len(values):
            issues.append(f"Several {side} labels are identical. Distinguish them using course evidence.")
    for s in shots:
        for field in ("ball", "hoop", "hint", "explanation", "study_term"):
            value = getattr(s, field)
            issue = text_problem(value)
            if issue or has_unwanted_wording(value) or not accepts(value, language):
                issues.append(f"{s.knowledge_id} {field}: " + (issue or "Correct the language or wording."))
    return issues


async def _render_math(shots):
    fields = {}
    for shot in shots:
        for key in ("ball", "hoop", "hint", "explanation", "study_term"):
            for match in _MATH.finditer(getattr(shot, key)):
                expr = next(x for x in match.groups() if x is not None)
                fields.setdefault(expr, []).append(f"{shot.knowledge_id} {key}")
    if not fields:
        return []
    script = Path(__file__).resolve().parents[1] / "scripts" / "check_course_formulas.mjs"
    marked = [r"\(" + expr + r"\)" for expr in fields]
    # The child receives math strings via stdin only. Never evaluate supplied course content.
    try:
        options = {"creationflags": 0x08000000} if sys.platform == "win32" else {}
        proc = await asyncio.to_thread(subprocess.run, ["node", str(script)], input=json.dumps(marked),
                                       capture_output=True, text=True, timeout=10, **options)
    except (OSError, subprocess.TimeoutExpired):
        raise AgentError("math_renderer_unavailable", "请检查后端的 Node.js 22 和公式渲染服务。") from None
    if proc.returncode:
        raise AgentError("math_renderer_unavailable", "请检查后端的 Node.js 和公式渲染文件。")
    names = list(fields.values())
    return [", ".join(names[i]) + ": this TeX expression failed to render. Repair its syntax."
            for i in json.loads(proc.stdout)]


async def _review(client, shots, language):
    order = list(shots)
    SystemRandom().shuffle(order)
    labels = {s.knowledge_id: chr(65 + index) for index, s in enumerate(order)}
    payload = {"language": language,
               "hoops": {labels[s.knowledge_id]: s.hoop for s in order},
               "balls": [{"ball_number": i, "text": s.ball}
                         for i, s in enumerate(shots, 1)]}
    with trace_tool("blind_review_hoops"):
        raw = await client.structured("blind_review_hoops", _REVIEW, payload, Review.model_json_schema())
        result = Review.model_validate(raw)
    if sorted(x.ball_number for x in result.decisions) != list(range(1, len(shots) + 1)):
        return ["The review did not cover every ball exactly once; check the full round again."]
    return [f"{shots[x.ball_number - 1].knowledge_id}: {x.reason}" for x in result.decisions
            if not x.sound or x.valid_hoops != [labels[shots[x.ball_number - 1].knowledge_id]]]


async def _audit_evidence(client, shots, sources):
    prompt = BOUNDARY + """
    Audit one proposed ball, hoop, hint and explanation against its own source for each knowledge_id.
    Verify the answer, reasoning, mathematical signs, exact numerical givens, units and context.
    For a verified exam exercise preserve every necessary original condition and its actual task.
    For lecture material require that the cited principle supports the transfer problem.
    Report unsupported extra claims, mismatched topics and redundant questions that test the same fact.
    Return one check for every ID, with supported=false and a specific repair for any flaw.
    """
    with trace_tool("verify_shot_evidence"):
        raw = await client.structured("verify_shot_evidence", prompt, {
            "sources": sources, "shots": [s.model_dump() for s in shots]}, EvidenceReview.model_json_schema())
        checks = EvidenceReview.model_validate(raw).checks
    if sorted(c.knowledge_id for c in checks) != sorted(s.knowledge_id for s in shots):
        return ["The evidence audit must cover every selected ID exactly once."]
    return [f"{c.knowledge_id}: {c.reason}" for c in checks if not c.supported]


async def generate_shots(client, knowledge, plan, previous=None):
    by_id = {k.knowledge_id: k for k in knowledge}
    selected = [by_id[kid] for kid in plan.knowledge_ids]
    language = plan.question_language or ("zh" if any(re.search(r"[\u3400-\u9fff]", k.term + k.definition)
                                                       for k in selected) else "en")
    sources = [_source(k, language) for k in selected]
    payload = {"language": language, "difficulty": plan.difficulty, "learner_level": plan.learner_level,
               "learning_goal": plan.goal, "relationship": plan.relationship_type, "sources": sources}
    if previous:
        payload["previous"] = [{"ball": p.left, "hoop": p.right} for p in previous.pairs]
    for attempt in range(3):
        try:
            with trace_tool("author_basketball_shots" if attempt == 0 else "repair_basketball_shots"):
                raw = await client.structured("author_basketball_shots", _AUTHOR, payload, Draft.model_json_schema())
                shots = Draft.model_validate(raw).shots
            issues = _local_review(shots, plan.knowledge_ids, language)
            if not issues:
                with trace_tool("render_shot_formulas"):
                    issues = await _render_math(shots)
            if not issues:
                blind, evidence = await asyncio.gather(_review(client, shots, language),
                                                       _audit_evidence(client, shots, sources))
                issues = [*blind, *evidence]
            if not issues:
                return GameConfigInternal(title=plan.title, pairs=[
                    MatchingPair(pair_id="p_" + hashlib.sha256(s.knowledge_id.encode()).hexdigest()[:24],
                                 knowledge_id=s.knowledge_id, left=s.ball, right=s.hoop, hint=s.hint,
                                 explanation=s.explanation, study_term=s.study_term,
                                 source_ref=by_id[s.knowledge_id].source_ref) for s in shots])
            payload["previous_draft"] = [s.model_dump() for s in shots]
            payload["review"] = issues
        except ValidationError as exc:
            payload["review"] = ["Follow the required schema at " + ".".join(map(str, e["loc"]))
                                 for e in exc.errors(include_input=False, include_url=False)[:12]]
        except AgentError as exc:
            if exc.code != "invalid_json":
                raise
            payload["review"] = ["Return one complete JSON object with properly escaped TeX."]
    raise AgentError("game_quality", "请调整知识点范围后重新出题。")
