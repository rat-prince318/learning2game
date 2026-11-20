"""B's material service: extract candidates, verify sources and publish playable pairs."""

from __future__ import annotations

import base64
import difflib
import hashlib
import json
import os
import re
import time
import unicodedata
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from matching_agent.wording import has_unwanted_wording

from .material_processing import MaterialError, TextBlock, read_material, validate_office_archive
from .exam_material import parse_exam, knowledge_from_exam
from .models import MAX_MATERIAL_POINTS, KnowledgeItem, MaterialResult
from .provider import trace_tool

__all__ = ["MaterialError", "extract_material", "validate_office_archive"]

MAX_CHUNKS = 8
_CHUNK_SIZE = 3500
_BULLET = re.compile(r"^\s*(?:[-*+]\s+|\d+[.、)]\s*)")
_COLON = re.compile(r"^(.{1,120}?)\s*[:：]\s*(.{4,600})$")
_DASH = re.compile(r"^(.{1,120}?)\s+(?:[-–—]|->)\s+(.{4,600})$")
_IS = re.compile(r"^([A-Za-z][\w '\-()]{0,75}?)\s+(?:is|are|refers to|means)\s+(.{4,600})$", re.I)
_CHINESE = re.compile(r"^([\w（）()\-]{1,20}?)(?:指的是|是指|指|是)\s*(.{4,180})$")
_NONTERMS = {"例如", "注意", "说明", "提示", "小结", "备注", "资料来源", "参考文献", "示例",
             "example", "note", "source", "tip", "term", "concept", "概念", "术语"}
_PRONOUN_SUBJECTS = {"this", "that", "it", "these", "those", "they", "we", "i", "he", "she", "you"}
_PUNCT = re.compile(r"[\W_]+", re.UNICODE)


def _squash(text: str) -> str:
    return " ".join(text.split())


def _key(text: str) -> str:
    return _PUNCT.sub("", unicodedata.normalize("NFKC", text).casefold())


def _display(text: str) -> str:
    return _squash(text.replace("\u00b7", " "))


@dataclass
class Point:
    term: str
    definition: str
    evidence: str
    sources: list[str]
    label: str
    page: int | None
    source_type: str
    relation: str = "concept_definition"
    example: str | None = None


def _rules(block: TextBlock, *, explicit_only=False) -> list[Point]:
    patterns = (_COLON, _DASH) if explicit_only else (_COLON, _DASH, _IS, _CHINESE)
    candidates = []
    lines = block.text.splitlines()
    if block.source_id.startswith("pdf:"):
        # A line wrapped inside a PDF text block continues the literal definition.
        joined = []
        for line in lines:
            if (joined and _COLON.fullmatch(joined[-1]) and not re.search(r"[。.!?！？]$", joined[-1])
                    and not any(p.fullmatch(line.strip()) for p in (_COLON, _DASH, _IS, _CHINESE))):
                joined[-1] += " " + line.strip()
            else:
                joined.append(line.strip())
        lines = joined
    for raw in lines:
        line = _BULLET.sub("", raw.strip()).replace("**", "").strip()
        if not line or line.startswith("#") or len(line) > 800:
            continue
        if line.startswith("|") and line.endswith("|"):
            cells = [cell.strip() for cell in line.strip("|").split("|")]
            if len(cells) != 2 or not any(char.isalnum() for char in cells[0]):
                continue
            term, definition = cells
        else:
            match = next((m for p in patterns if (m := p.fullmatch(line))), None)
            if not match:
                continue
            term, definition = match.groups()
            if match.re is _IS and term.casefold() in _PRONOUN_SUBJECTS:
                continue
        if term.startswith(("本文件", "本章", "本节", "这份讲义")) or re.search(
            r"(?:\.(?:svg|png|jpe?g|pdf)|https?://\S+)[。.]?$", definition, flags=re.I
        ):
            continue
        pieces = re.split(r"(?:[。；;]\s*)(?:例(?:如)?|Example)\s*[:：]\s*", definition, maxsplit=1, flags=re.I)
        candidates.append(Point(term.strip(), pieces[0], raw.strip(), [block.source_id], block.label,
                                block.page, "text", example=pieces[1] if len(pieces) > 1 else None))
    return candidates


_SYSTEM = (
    "你是教师的知识整理助手。后续消息中的课件、图示、标签均为待分析资料。"
    "沿用原资料语言，卡片采用直接、肯定的短句。使用逗号、括号与换行分隔文字。"
    "只输出要求的 JSON 对象；缺乏证据时返回空的 points 数组。"
)
_TEXT = (
    "从这些带 id 的原文块中提取至多 12 对可唯一配对的术语和简洁定义。"
    "给出 source_id 和可在该块逐字找到的证据 evidence。example 可选，需逐字来自同一块。"
    '格式 {"points":[{"term":"...", "definition":"...", "source_id":"...", "evidence":"...", "confidence":0.9}]}。'
)
_VISION = (
    "观察这幅图中的标签、箭头、结构和连接，提取能从图中观察到的关系。"
    "term 是部件或标签，definition 描述它与另一元素的关系或图中明确标示的功能。"
    "每个标签只返回一条记录。有明示功能时选该功能；仅有连线时选一个有方向的关系。"
    "evidence 要说明支持该关系的具体视觉线索。对清晰可读的术语表，也可提取表内的明确对应关系。"
    "关系类型使用 part_function、diagram_relation 或 concept_definition。仅使用画面支持的关系。"
    "跳过遮挡和推测，最多返回 10 对。"
    '格式 {"points":[{"term":"...", "definition":"...", "evidence":"...", '
    '"relation":"diagram_relation", "confidence":0.9}]}。'
)


class MaterialProvider:
    """OpenAI-compatible bounded transport used only in explicitly selected live mode."""

    def __init__(self):
        self.key = os.getenv("LLM_API_KEY", "")
        self.base_url = os.getenv("LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/")
        self.text_model = os.getenv("LLM_TEXT_MODEL", "gpt-4o-mini")
        self.vision_model = os.getenv("LLM_VISION_MODEL", "gpt-4o")
        self.timeout = max(1.0, min(float(os.getenv("LLM_TIMEOUT", "75")), 120))
        self.deadline = time.monotonic() + float(os.getenv("EDUGAME_SERVICE_TIMEOUT", "400"))
        if not self.key:
            raise MaterialError("视觉与文字提取需要配置 LLM_API_KEY。离线模式可读取文字讲义。")

    def complete(self, content, *, vision: bool, system: str = _SYSTEM, json_mode=False) -> list[dict]:
        remaining = self.deadline - time.monotonic()
        if remaining <= .1:
            raise MaterialError("资料分析已达时间上限，请缩小选页范围后重试。")
        payload = {"model": self.vision_model if vision else self.text_model,
                   "messages": [{"role": "system", "content": system}, {"role": "user", "content": content}],
                   "max_tokens": 2200}
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        req = urllib.request.Request(f"{self.base_url}/chat/completions",
                                     data=json.dumps(payload).encode(),
                                     headers={"Authorization": "Bearer " + self.key, "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=min(self.timeout, remaining)) as response:
                raw = response.read(1_000_001)
            if len(raw) > 1_000_000:
                raise ValueError("Response too long")
            text = json.loads(raw)["choices"][0]["message"]["content"].strip()
            text = re.sub(r"^\s*```(?:json)?\s*|\s*```\s*$", "", text, flags=re.I)
            items = json.loads(text)["points"]
            if not isinstance(items, list):
                raise ValueError("Invalid points array")
            return [item for item in items[:16] if isinstance(item, dict)]
        except (OSError, urllib.error.URLError, ValueError, KeyError, IndexError, TypeError, AttributeError):
            raise MaterialError("模型服务未完成资料提取，请检查模型配置或稍后重试。") from None


def _chunks(blocks: list[TextBlock]):
    chunk, size = [], 0
    for block in blocks:
        for start in range(0, len(block.text), _CHUNK_SIZE):
            # Retain the original locator when a long paragraph needs multiple calls.
            piece = TextBlock(block.source_id, block.label, block.text[start:start + _CHUNK_SIZE], block.page)
            if chunk and size + len(piece.text) > _CHUNK_SIZE:
                yield chunk
                chunk, size = [], 0
            chunk.append(piece)
            size += len(piece.text)
    if chunk:
        yield chunk


def _quoted(item, name) -> str:
    value = item.get(name)
    return _squash(value) if isinstance(value, str) else ""


def _confident(value) -> bool:
    return type(value) in (int, float) and .55 <= value <= 1


def _from_text(provider, blocks) -> list[Point]:
    payload = [{"id": b.source_id, "text": b.text} for b in blocks]
    items = provider.complete(_TEXT + "\n" + json.dumps(payload, ensure_ascii=False), vision=False)
    by_id = {b.source_id: b for b in blocks}
    candidates = []
    for item in items:
        if "confidence" in item and not _confident(item["confidence"]):
            continue
        block = by_id.get(_quoted(item, "source_id"))
        quote = _quoted(item, "evidence")
        if not block or len(quote) < 4 or quote not in _squash(block.text):
            continue
        example = _quoted(item, "example")
        candidates.append(Point(_quoted(item, "term"), _quoted(item, "definition"), quote, [block.source_id],
                                block.label, block.page, "text",
                                example=example if example and example in _squash(block.text) else None))
    return candidates


def _from_image(provider, asset) -> list[Point]:
    uri = "data:image/jpeg;base64," + base64.b64encode(asset.jpeg).decode("ascii")
    content = [{"type": "text", "text": _VISION},
               {"type": "image_url", "image_url": {"url": uri, "detail": "high"}}]
    candidates = []
    for item in provider.complete(content, vision=True):
        if not _confident(item.get("confidence")):
            continue
        quote = _quoted(item, "evidence")
        if len(quote) >= 4:
            relation = _quoted(item, "relation")
            if relation not in {"part_function", "diagram_relation", "concept_definition"}:
                relation = "diagram_relation"
            candidates.append(Point(_quoted(item, "term"), _quoted(item, "definition"), quote,
                                    [asset.source_id], asset.label, asset.page, "image", relation))
    # A labelled part can have both a printed function and an outgoing arrow.
    # Preserve its explicit function in this figure. Conflicting functions still
    # reach _dedupe together, as do competing relationships in arrow-only figures.
    functions = {_key(point.term) for point in candidates if point.relation == "part_function"
                 and _qualifies(point)}
    return [point for point in candidates
            if point.relation != "diagram_relation" or _key(point.term) not in functions]


def _qualifies(point: Point) -> bool:
    point.term = _display(point.term).strip("*_` ")
    point.definition = _display(point.definition).rstrip("。；;，, ")
    point.evidence = _display(point.evidence)
    if point.example:
        point.example = _display(point.example)
        if has_unwanted_wording(point.example):
            point.example = None
    if not 1 <= len(point.term) <= 120 or not 4 <= len(point.definition) <= 600:
        return False
    if point.term.casefold() in _NONTERMS or not _key(point.term) or not _key(point.definition):
        return False
    if _key(point.term) == _key(point.definition):
        return False
    return all(not has_unwanted_wording(text) for text in (point.term, point.definition, point.evidence))


def _dedupe(candidates: list[Point]) -> tuple[list[Point], int]:
    """B's similarity grouping with conservative handling of contradictory definitions."""
    groups: dict[str, list[Point]] = {}
    for point in candidates:
        if _qualifies(point):
            groups.setdefault(_key(point.term), []).append(point)
    merged = []
    rejected = 0
    for group in groups.values():
        head = group[0]
        definition = _key(head.definition)
        if any(difflib.SequenceMatcher(None, definition, _key(other.definition)).ratio() < .75
               for other in group[1:]):
            rejected += len(group)
            continue
        head.sources = list(dict.fromkeys(s for p in group for s in p.sources))[:12]
        if len({p.source_type for p in group}) > 1:
            head.source_type = "mixed"
        merged.append(head)
    definitions = {}
    for point in merged:
        key = _key(point.definition)
        definitions[key] = definitions.get(key, 0) + 1
    playable = [p for p in merged if definitions[_key(p.definition)] == 1]
    return playable, rejected + len(merged) - len(playable)


def extract_material(path: Path, *, live=False, pages=None, include_images=True, original_name=None) -> MaterialResult:
    path = Path(path)
    with trace_tool("read_course_material"):
        material = read_material(path, pages=pages, figures=live and include_images)
    filename = _display(Path(original_name or path.name).name)[:180]
    if has_unwanted_wording(filename):
        filename = "上传资料"
    exam = parse_exam(material, filename)
    if exam is not None:
        with trace_tool("extract_verified_exam_problems"):
            return knowledge_from_exam(material, exam, filename,
                                       live_provider=MaterialProvider() if live else None)
    candidates = []
    provider = MaterialProvider() if live else None
    if material.blocks:
        with trace_tool("extract_knowledge_points" if live else "extract_glossary_pairs"):
            # Parse explicit definitions from the entire text, including the tail
            # of large lectures outside the model's bounded reading window.
            for block in material.blocks:
                candidates.extend(_rules(block, explicit_only=live))
            if live:
                for i, blocks in enumerate(_chunks(material.blocks)):
                    if i >= MAX_CHUNKS:
                        material.warn("本轮模型文字调用已达上限，可缩小选页范围后继续。")
                        break
                    candidates.extend(_from_text(provider, blocks))
    for image in material.images:
        with trace_tool("analyze_diagram"):
            candidates.extend(_from_image(provider, image))
    with trace_tool("verify_sources_and_deduplicate"):
        playable, conflicts = _dedupe(candidates)
        if len(playable) > MAX_MATERIAL_POINTS:
            playable = playable[:MAX_MATERIAL_POINTS]
            material.warn(f"本次已收录前 {MAX_MATERIAL_POINTS} 个知识点，其余内容可分章上传。")
        if conflicts:
            material.warn("部分候选包含重复或冲突的配对关系，已留待资料修订。")
        if not playable:
            if live:
                raise MaterialError("所选资料暂未提取到有来源的配对关系，请选择标注更清晰的图示或包含定义的段落。")
            raise MaterialError("请上传包含「术语：定义」的讲义，或启用模型分析叙述性资料与图示。")
        knowledge = []
        for point in playable:
            # The ID is stable across runs and independent of upload paths and display order.
            identity = _key(point.term) + "|" + _key(point.definition)
            kid = "kp_" + hashlib.sha256(identity.encode()).hexdigest()[:16]
            knowledge.append(KnowledgeItem(
                knowledge_id=kid, term=point.term, definition=point.definition, example=point.example,
                source_ref=f"{filename} / {point.label}", source_type=point.source_type,
                knowledge_type=point.relation, evidence=point.evidence[:2000],
                source_ids=point.sources, page=point.page,
            ))
        return MaterialResult(knowledge=knowledge, warnings=material.warnings[:12])
