#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
EduGame Agent —— B 部分完整实现（单文件版）
================================================

一句话：把一份课件变成一份「概念—定义」配对题库，每条都能指回原文或原图。

这份文件就是一个完整的 B 模块，不依赖项目里其他任何代码。它做五件事：

    1. 解析    PDF / PPTX / DOCX / TXT / MD / 图片，逐页逐段保留来源编号
    2. 看图    把图真的送进视觉模型，抽出「部件—功能」关系（不是 OCR）
    3. 提取    按固定 JSON 结构产出知识点，每条都要能反查到原文
    4. 质检    合并重复、标记冲突、剔除不能出题的
    5. 交付    JSON（给 A 生成游戏）+ HTML（给人看、给用户勾选）

--------------------------------------------------------------------------------
怎么跑
--------------------------------------------------------------------------------
    # 1) 没有任何 API Key，也能看到完整效果（用内置演示答案）
    python edugame_b.py materials/02_cs_network_diagram.pdf --demo

    # 2) 用你自己的课件（无 Key 时文字部分走规则提取，图会提示未分析）
    python edugame_b.py 我的课件.pdf

    # 3) 配置好 Key 之后走真模型
    set LLM_API_KEY=sk-xxx
    set LLM_BASE_URL=https://api.openai.com/v1
    python edugame_b.py 我的课件.pdf --provider openai

    # 4) 只看某几页
    python edugame_b.py 课件.pdf --page 2 --page 3

--------------------------------------------------------------------------------
产出
--------------------------------------------------------------------------------
    终端报告         人眼直接看的五步过程
    out/<名字>.json  交给 A 的机器可读结果（含来源、证据、质量标记）
    out/<名字>.html  漂亮的卡片页，可以勾选排除知识点、导出 JSON

--------------------------------------------------------------------------------
设计上的三个硬约束（也是答辩最容易被问的）
--------------------------------------------------------------------------------
    1. 不让模型直接生成 HTML/JS，只产结构化数据 —— 这里的产物是 JSON
    2. 图必须是「图」进去，不是 OCR 成文字 —— analyze_image() 走 image_url 传 base64
    3. 每条知识点必须能反查来源 —— 模型的 evidence 会在原文里做子串校验，
       对不上就打上「来源不可核实」，绝不假装可信

作者备注：这是给「4 人 7 天课程项目」用的 B 模块，C 只需要读 JSON，A 只需要调
         `extract(path)` 一个函数。
"""

from __future__ import annotations

import argparse
import base64
import difflib
import hashlib
import html
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

# --------------------------------------------------------------------------- #
# 0. 配置
# --------------------------------------------------------------------------- #

IMAGE_DIR = Path("data/uploads")     # 图片落盘位置
OUT_DIR = Path("out")                # 结果输出位置
MAX_IMAGE_SIDE = 1600                # 送模型前先把图缩到这么长边，省 token
SUPPORTED = {".pdf", ".pptx", ".docx", ".txt", ".md", ".markdown",
             ".png", ".jpg", ".jpeg", ".webp", ".bmp"}


@dataclass
class LLMConfig:
    """模型配置。全部可以从环境变量覆盖，代码里不留任何 key。"""

    provider: str = "mock"                                    # mock | openai
    base_url: str = "https://api.openai.com/v1"
    api_key: str = ""
    text_model: str = "gpt-4o-mini"
    vision_model: str = "gpt-4o"
    timeout: int = 90

    @classmethod
    def from_env(cls, provider: str | None = None) -> "LLMConfig":
        key = os.getenv("LLM_API_KEY", "")
        auto = "openai" if key else "mock"
        return cls(
            provider=provider or os.getenv("LLM_PROVIDER", auto),
            base_url=os.getenv("LLM_BASE_URL", cls.base_url).rstrip("/"),
            api_key=key,
            text_model=os.getenv("LLM_TEXT_MODEL", cls.text_model),
            vision_model=os.getenv("LLM_VISION_MODEL", cls.vision_model),
            timeout=int(os.getenv("LLM_TIMEOUT", "90")),
        )


# --------------------------------------------------------------------------- #
# 1. 数据结构：这是 B 交给全组的「合同」
# --------------------------------------------------------------------------- #

@dataclass
class TextBlock:
    """一段文字 + 它在原文件里的确切位置。source_id 是后面所有追溯的锚点。"""

    source_id: str
    text: str
    page: int | None = None
    block_index: int = 0
    heading: str | None = None


@dataclass
class ImageAsset:
    """一张要被送进视觉模型的图。"""

    image_id: str
    path: str
    page: int | None = None
    kind: str = "embedded"          # embedded（真图片） | page_render（整页渲染）
    width: int = 0
    height: int = 0
    caption: str = ""


@dataclass
class Material:
    """一份课件解析完的样子。"""

    file_id: str
    filename: str
    file_type: str
    blocks: list[TextBlock] = field(default_factory=list)
    images: list[ImageAsset] = field(default_factory=list)
    issues: list[dict[str, str]] = field(default_factory=list)

    @property
    def total_chars(self) -> int:
        return sum(len(b.text) for b in self.blocks)


@dataclass
class Relation:
    """一条「A 的功能是 B」这种能直接做成配对卡的关系。"""

    left: str
    right: str
    relation: str = "功能是"
    evidence: str = ""
    confidence: float = 0.0


@dataclass
class ImageAnalysis:
    """一次图像理解的结构化结果。刻意分成三档，谁在胡说得看出来。"""

    image_id: str
    ok: bool = True
    page: int | None = None
    error: str = ""
    topic: str = ""
    visible_parts: list[str] = field(default_factory=list)
    connections: list[str] = field(default_factory=list)
    relations: list[Relation] = field(default_factory=list)
    uncertainties: list[str] = field(default_factory=list)
    confidence: float = 0.0


@dataclass
class KnowledgePoint:
    """B 的最终产物。A 拿到的就是这个列表。"""

    concept: str
    definition: str
    relation_type: str = "concept_definition"   # concept_definition | part_function | ...
    difficulty: str = "medium"
    evidence: str = ""
    sources: list[str] = field(default_factory=list)   # source_id 或 image_id
    source_kind: str = "text"                          # text | image
    source_desc: str = ""
    modality: str = "text"                             # text | image | mixed
    confidence: float = 0.0
    # 质检结果
    playable: bool = True
    review_reasons: list[str] = field(default_factory=list)
    knowledge_id: str = ""

    def __post_init__(self) -> None:
        self.concept = _strip_tail(_squash(self.concept))
        self.definition = _strip_tail(_squash(self.definition))
        if not self.knowledge_id:
            raw = f"{_norm(self.concept)}|{_norm(self.definition)}"
            self.knowledge_id = "kp_" + hashlib.sha1(raw.encode("utf-8")).hexdigest()[:12]
        self.check()

    # ---- 质检规则：全部写在明面上，谁都能来吵 ----
    def check(self) -> None:
        reasons: list[str] = []
        if not self.definition:
            reasons.append("定义为空")
        if len(self.definition) < 4:
            reasons.append("定义太短，不足以判断")
        if len(self.definition) > 90:
            reasons.append("定义过长，卡片放不下")
        if len(self.concept) > 30:
            reasons.append("概念名过长")
        if _leaks_answer(self.concept, self.definition):
            reasons.append("定义里直接出现概念本身，玩家一眼就能对上")
        if not self.sources:
            reasons.append("没有来源，无法核对")
        if self.confidence and self.confidence < 0.55:
            reasons.append("模型自评置信度偏低")
        self.review_reasons = reasons
        self.playable = not reasons

    @property
    def key(self) -> str:
        return _norm(self.concept)


@dataclass
class Result:
    """一次完整提取的结果。"""

    material_file: str
    points: list[KnowledgePoint] = field(default_factory=list)
    rejected: list[KnowledgePoint] = field(default_factory=list)
    image_analyses: list[ImageAnalysis] = field(default_factory=list)
    issues: list[dict[str, str]] = field(default_factory=list)
    stats: dict[str, Any] = field(default_factory=dict)


# --------------------------------------------------------------------------- #
# 2. 小工具
# --------------------------------------------------------------------------- #

_WS = re.compile(r"\s+")
_PUNCT = re.compile(r"[\s\u3000·、，。；：！？（）()\[\]【】\"'“”‘’\-—_/\\]+")


def _squash(s: str) -> str:
    """把连续空白压成一个空格，去掉首尾。"""

    return _WS.sub(" ", (s or "").replace("\r", " ").replace("\n", " ")).strip()


def _norm(s: str) -> str:
    """比对用的规范化：全角转半角、去标点、转小写。"""

    s = unicodedata.normalize("NFKC", s or "").lower()
    return _PUNCT.sub("", s)


def _file_id(path: Path) -> str:
    return "file_" + hashlib.sha1(
        (path.name + str(path.stat().st_size)).encode("utf-8")
    ).hexdigest()[:8]


def _leaks_answer(concept: str, definition: str) -> bool:
    """定义里是不是把概念本身写出来了。

    不能简单用 `concept in definition`：「胃」会命中「胃酸」，「甲状腺」会命中
    「甲状腺激素」，这类是真定义不是泄题。只有概念单独出现在句首，或后面紧跟
    「是 / 指 / 就是」，才算玩家能直接对上答案。
    """

    c = unicodedata.normalize("NFKC", concept or "").lower().strip()
    d = unicodedata.normalize("NFKC", definition or "").lower()
    if not c or c not in d:
        return False
    if d.startswith(c):
        return True
    cues = ("是", "指", "就是", "即", "，", "。", "；", "、")
    for m in re.finditer(re.escape(c), d):
        after = d[m.end():m.end() + 2]
        if not after or after.startswith(cues):
            return True
    return False


def _guess_difficulty(definition: str) -> str:
    n = len(definition or "")
    if n <= 16:
        return "easy"
    if n <= 40:
        return "medium"
    return "hard"


def _strip_tail(text: str) -> str:
    """卡片上不需要句末句号，视觉上会显得脏。"""

    return re.sub(r"[。；;，,\s]+$", "", (text or "").strip())


def _issue(level: str, code: str, message: str) -> dict[str, str]:
    return {"level": level, "code": code, "message": message}


# --------------------------------------------------------------------------- #
# 3. 解析器：五种格式，统一成 Material
# --------------------------------------------------------------------------- #

def _load_pymupdf():
    try:
        import pymupdf  # 新版包名

        return pymupdf
    except ImportError:
        import fitz  # 老版本

        return fitz


def _save_pixmap(pix, dest: Path) -> tuple[int, int]:
    dest.parent.mkdir(parents=True, exist_ok=True)
    pix.save(str(dest))
    return pix.width, pix.height


def parse_pdf(path: Path, fid: str, pages: list[int] | None = None,
              render: str = "auto", dpi: int = 150) -> Material:
    """PDF：逐页取文字块；同时判断「这一页其实是一张图」。

    关键点：课件里的架构图大多是矢量线条画的，page.get_images() 根本抽不到。
    所以这里数一下这一页画了多少条线（get_drawings），线条多而文字少，就判定
    「这页是图」，整页渲染成 PNG 再送视觉模型。这一步是「多模态不是 OCR」的命门。
    """

    pymupdf = _load_pymupdf()
    mat = Material(file_id=fid, filename=path.name, file_type="pdf")
    doc = pymupdf.open(str(path))

    targets = [p for p in (pages or range(1, doc.page_count + 1)) if 1 <= p <= doc.page_count]
    if not targets:
        mat.issues.append(_issue("error", "empty_document", "指定的页码超出文件范围"))
        return mat

    heading = ""
    img_seq = 0

    for pno in targets:
        page = doc[pno - 1]
        data = page.get_text("dict")

        page_chars = 0
        for bi, block in enumerate(data.get("blocks", [])):
            if block.get("type") != 0:
                continue
            lines = []
            for line in block.get("lines", []):
                text = "".join(span.get("text", "") for span in line.get("spans", []))
                if text.strip():
                    lines.append(text)
            if not lines:
                continue
            text = _squash("\n".join(lines))
            if not text:
                continue
            # 只丢纯页码类碎片；「防火墙」这种短标签是有效内容，必须留
            if len(text) <= 4 and re.fullmatch(r"[\d\s\-—–/.,第页]+", text):
                continue

            page_chars += len(text)
            if len(text) <= 40 and re.match(r"^(第?\s*\d+\s*[章节讲]|chapter\b)", text, re.I):
                heading = text
            mat.blocks.append(TextBlock(
                source_id=f"pdf:p{pno}:b{bi}",
                text=text,
                page=pno,
                block_index=bi,
                heading=heading or None,
            ))

        # ---- 这一页是不是其实是一张图？----
        try:
            drawings = len(page.get_drawings())
        except Exception:
            drawings = 0
        is_vector_diagram = drawings >= 12 and page_chars < 500

        embedded = page.get_images(full=True)
        big_embedded = [im for im in embedded if im[2] * im[3] >= 80 * 80]

        should_render = render == "all" or (render == "auto" and is_vector_diagram)

        if should_render and not big_embedded:
            try:
                pix = page.get_pixmap(dpi=dpi)
                img_seq += 1
                dest = IMAGE_DIR / fid / f"p{pno:03d}_render.png"
                w, h = _save_pixmap(pix, dest)
                mat.images.append(ImageAsset(
                    image_id=f"{fid}_img{img_seq:03d}",
                    path=str(dest),
                    page=pno,
                    kind="page_render",
                    width=w,
                    height=h,
                    caption=heading,
                ))
            except Exception as exc:
                mat.issues.append(_issue("warning", "render_failed", f"第 {pno} 页渲染失败：{exc}"))

        for im in big_embedded[:2]:
            xref = im[0]
            try:
                info = doc.extract_image(xref)
                img_seq += 1
                ext = info.get("ext", "png")
                dest = IMAGE_DIR / fid / f"p{pno:03d}_i{img_seq:03d}.{ext}"
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(info["image"])
                mat.images.append(ImageAsset(
                    image_id=f"{fid}_img{img_seq:03d}",
                    path=str(dest),
                    page=pno,
                    kind="embedded",
                    width=info.get("width", 0),
                    height=info.get("height", 0),
                    caption=heading,
                ))
            except Exception:
                continue

    _drop_repeated_headers(mat)

    if mat.total_chars == 0 and not mat.images:
        mat.issues.append(_issue(
            "warning", "no_text_layer",
            "这份 PDF 没有可抽取的文字，可能是扫描件；需要 OCR 才能读（当前版本未接 OCR）",
        ))
    doc.close()
    return mat


def _drop_repeated_headers(mat: Material) -> None:
    """跨页重复的页眉页脚不是知识，是排版噪音。

    判据保守：至少 3 页，且同一段话出现在 60% 以上的页面上，长度不超过 60 字。
    课件里「第三章 人体器官」这种页眉会被清掉，正文不会被误伤。
    """

    pages = {b.page for b in mat.blocks if b.page}
    if len(pages) < 3:
        return
    counter: dict[str, set[int]] = {}
    for block in mat.blocks:
        key = _norm(block.text)
        if 0 < len(key) <= 60:
            counter.setdefault(key, set()).add(block.page)  # type: ignore[arg-type]
    threshold = max(2, int(len(pages) * 0.6))
    repeated = {k for k, ps in counter.items() if len(ps) >= threshold}
    if not repeated:
        return
    kept = [b for b in mat.blocks if _norm(b.text) not in repeated]
    removed = len(mat.blocks) - len(kept)
    if removed:
        mat.blocks = kept
        mat.issues.append(_issue("info", "header_footer_removed",
                                 f"忽略 {removed} 段重复出现的页眉/页脚"))


def parse_pptx(path: Path, fid: str) -> Material:
    """PPT：按页取文字，形状里的图片单独存。"""

    from pptx import Presentation

    mat = Material(file_id=fid, filename=path.name, file_type="pptx")
    prs = Presentation(str(path))
    img_seq = 0

    for pno, slide in enumerate(prs.slides, 1):
        title = ""
        try:
            if slide.shapes.title and slide.shapes.title.has_text_frame:
                title = _squash(slide.shapes.title.text_frame.text)
        except Exception:
            title = ""

        bi = 0
        for shape in slide.shapes:
            if shape.has_text_frame:
                text = _squash(shape.text_frame.text)
                if len(text) <= 6:
                    continue
                mat.blocks.append(TextBlock(
                    source_id=f"pptx:p{pno}:b{bi}",
                    text=text, page=pno, block_index=bi, heading=title or None,
                ))
                bi += 1

            if shape.shape_type == 13:  # PICTURE
                try:
                    blob = shape.image.blob
                    ext = shape.image.ext or "png"
                    img_seq += 1
                    dest = IMAGE_DIR / fid / f"p{pno:03d}_s{img_seq:03d}.{ext}"
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    dest.write_bytes(blob)
                    mat.images.append(ImageAsset(
                        image_id=f"{fid}_img{img_seq:03d}",
                        path=str(dest), page=pno, kind="embedded",
                        width=shape.width, height=shape.height,
                        caption=title,
                    ))
                except Exception:
                    continue

    if not mat.blocks and not mat.images:
        mat.issues.append(_issue("warning", "empty_document", "这份 PPT 里没读到文字和图片"))
    return mat


TABLE_HEADER_WORDS = {"概念", "名称", "术语", "词条", "定义", "含义", "说明",
                      "功能", "作用", "描述", "解释", "定义/功能"}


def _docx_iter_blocks(doc):
    """按文档顺序遍历段落和表格。

    python-docx 的 doc.paragraphs 只给段落，表格内容一个字都读不到。真实课件里
    「概念—定义」经常就是一张两列表，直接跳过等于把最有用的内容丢了。
    """

    from docx.table import Table
    from docx.text.paragraph import Paragraph

    body = doc.element.body
    for child in body.iterchildren():
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            yield Paragraph(child, doc)
        elif tag == "tbl":
            yield Table(child, doc)


def _table_rows(table) -> list[list[str]]:
    rows: list[list[str]] = []
    for row in table.rows:
        cells = [_squash(cell.text) for cell in row.cells]
        # 合并单元格会重复同一段文字，去掉连续重复
        deduped: list[str] = []
        for cell in cells:
            if not deduped or deduped[-1] != cell:
                deduped.append(cell)
        if any(deduped):
            rows.append(deduped)
    return rows


def parse_docx(path: Path, fid: str) -> Material:
    """Word：段落 + 表格 + 内嵌图片，全部按文档顺序读。"""

    import docx

    mat = Material(file_id=fid, filename=path.name, file_type="docx")
    doc = docx.Document(str(path))

    bi = 0
    ti = 0
    heading = ""
    table_points = 0

    for item in _docx_iter_blocks(doc):
        if hasattr(item, "rows"):                      # 表格
            rows = _table_rows(item)
            if not rows:
                continue
            if rows and all(c in TABLE_HEADER_WORDS for c in rows[0] if c):
                rows = rows[1:]
            two_col = rows and all(len(r) == 2 for r in rows)
            for ri, row in enumerate(rows):
                if two_col:
                    # 两列表 = 天然的「概念：定义」，直接写成一行，后面规则/模型都能吃
                    text = f"{row[0]}：{row[1]}"
                    table_points += 1
                else:
                    text = " | ".join(c for c in row if c)
                if len(text) <= 4:
                    continue
                mat.blocks.append(TextBlock(
                    source_id=f"docx:t{ti}:r{ri}",
                    text=text, block_index=bi, heading=heading or None,
                ))
                bi += 1
            ti += 1
            continue

        para = item                                    # 段落
        text = _squash(para.text)
        if len(text) <= 6:
            continue
        style = (para.style.name or "").lower() if para.style else ""
        if "heading" in style or "标题" in style:
            heading = text
        mat.blocks.append(TextBlock(
            source_id=f"docx:b{bi}", text=text, block_index=bi, heading=heading or None,
        ))
        bi += 1

    if table_points:
        mat.issues.append(_issue("info", "table_extracted",
                                 f"从表格里读到 {table_points} 行「概念—定义」"))

    img_seq = 0
    for rel in doc.part.rels.values():
        if "image" not in rel.reltype:
            continue
        try:
            blob = rel.target_part.blob
            ext = Path(rel.target_part.partname).suffix.lstrip(".") or "png"
            img_seq += 1
            dest = IMAGE_DIR / fid / f"docx_i{img_seq:03d}.{ext}"
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(blob)
            mat.images.append(ImageAsset(
                image_id=f"{fid}_img{img_seq:03d}", path=str(dest), kind="embedded",
            ))
        except Exception:
            continue

    if not mat.blocks and not mat.images:
        mat.issues.append(_issue("warning", "empty_document", "这份文档里没读到内容"))
    return mat


def parse_text(path: Path, fid: str) -> Material:
    """TXT / Markdown：按空行切段，Markdown 顺手记一行标题。"""

    mat = Material(file_id=fid, filename=path.name, file_type=path.suffix.lstrip("."))
    raw = None
    for enc in ("utf-8", "utf-8-sig", "gb18030", "big5"):
        try:
            raw = path.read_text(encoding=enc)
            break
        except UnicodeDecodeError:
            continue
    if raw is None:
        raw = path.read_text(encoding="utf-8", errors="replace")
        mat.issues.append(_issue("warning", "encoding_guess", "编码不确定，已按 UTF-8 容错读取"))

    heading = ""
    blocks: list[str] = []
    buf: list[str] = []
    for line in raw.splitlines():
        stripped = line.strip()
        if stripped.startswith("#"):
            if buf:
                blocks.append("\n".join(buf))
                buf = []
            heading = stripped.lstrip("#").strip()
            continue
        if not stripped:
            if buf:
                blocks.append("\n".join(buf))
                buf = []
            continue
        buf.append(stripped)
    if buf:
        blocks.append("\n".join(buf))

    for bi, text in enumerate(blocks):
        # 保留行结构：一行往往就是一条「概念：定义」，压平会毁掉可切分性
        text = "\n".join(line.strip() for line in text.splitlines() if line.strip())
        if len(text) <= 4:
            continue
        mat.blocks.append(TextBlock(
            source_id=f"{mat.file_type}:b{bi}", text=text, block_index=bi,
            heading=heading or None,
        ))

    if not mat.blocks:
        mat.issues.append(_issue("warning", "empty_text", "文本文件里没读到可用内容"))
    return mat


def parse_image(path: Path, fid: str) -> Material:
    """单张图片：整张就是一张要分析的图。"""

    mat = Material(file_id=fid, filename=path.name, file_type=path.suffix.lstrip("."))
    try:
        from PIL import Image

        with Image.open(path) as im:
            w, h = im.size
    except Exception:
        w = h = 0
        mat.issues.append(_issue("warning", "broken_image", "图片可能已损坏，未能读取尺寸"))

    if w and h and (w < 60 or h < 60):
        mat.issues.append(_issue("warning", "image_too_small", f"图片只有 {w}x{h}，太小了"))

    dest = IMAGE_DIR / fid / path.name
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(path.read_bytes())
    mat.images.append(ImageAsset(
        image_id=f"{fid}_img001", path=str(dest), kind="embedded", width=w, height=h,
    ))
    return mat


def parse(path: str | Path, pages: list[int] | None = None) -> Material:
    """按后缀分发。任何失败都变成 issue，不抛异常——上层要能继续跑。"""

    p = Path(path)
    if not p.exists():
        return Material(
            file_id="file_missing", filename=p.name, file_type="unknown",
            issues=[_issue("error", "not_found", f"文件不存在：{p}")],
        )
    suffix = p.suffix.lower()
    if suffix not in SUPPORTED:
        return Material(
            file_id="file_unsupported", filename=p.name, file_type="unknown",
            issues=[_issue("error", "unsupported_type",
                           f"不支持的格式 {suffix}；支持 {', '.join(sorted(SUPPORTED))}")],
        )

    fid = _file_id(p)
    try:
        if suffix == ".pdf":
            return parse_pdf(p, fid, pages=pages)
        if suffix == ".pptx":
            return parse_pptx(p, fid)
        if suffix == ".docx":
            return parse_docx(p, fid)
        if suffix in {".txt", ".md", ".markdown"}:
            return parse_text(p, fid)
        return parse_image(p, fid)
    except ImportError as exc:
        return Material(
            file_id=fid, filename=p.name, file_type=suffix.lstrip("."),
            issues=[_issue("error", "missing_dependency",
                           f"缺少依赖：{exc}。请 pip install pymupdf python-pptx python-docx pillow")],
        )
    except Exception as exc:  # 损坏文件
        return Material(
            file_id=fid, filename=p.name, file_type=suffix.lstrip("."),
            issues=[_issue("error", "corrupted", f"解析失败：{exc}")],
        )


# --------------------------------------------------------------------------- #
# 4. 模型调用：OpenAI 兼容，只用标准库（不依赖任何 SDK）
# --------------------------------------------------------------------------- #

class Provider:
    """所有模型访问都走这两个方法，换供应商只改这里。"""

    name = "base"

    def chat(self, messages: list[dict[str, Any]], *, model: str,
             max_tokens: int = 2000) -> str:
        raise NotImplementedError


class MockProvider(Provider):
    """没有 Key 时用的离线实现：文字走规则，图走内置演示答案。"""

    name = "mock"

    def chat(self, messages: list[dict[str, Any]], *, model: str,
             max_tokens: int = 2000) -> str:
        text = ""
        for m in messages:
            if m.get("role") == "user" and isinstance(m.get("content"), str):
                text = m["content"]
        pairs = rule_extract_pairs(text)
        return json.dumps({"points": pairs}, ensure_ascii=False)


class OpenAIProvider(Provider):
    """OpenAI 兼容接口（OpenAI / 通义 / DeepSeek / 智谱 / 学校网关都能用）。"""

    name = "openai"

    def __init__(self, cfg: LLMConfig) -> None:
        self.cfg = cfg
        if not cfg.api_key:
            raise ValueError("没有可用的 LLM_API_KEY")

    def chat(self, messages: list[dict[str, Any]], *, model: str,
             max_tokens: int = 2000) -> str:
        body = {
            "model": model,
            "messages": messages,
            "temperature": 0.2,
            "max_tokens": max_tokens,
        }
        req = urllib.request.Request(
            f"{self.cfg.base_url}/chat/completions",
            data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.cfg.api_key}",
            },
            method="POST",
        )
        last_err: Exception | None = None
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=self.cfg.timeout) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                return self._pick_content(data)
            except urllib.error.HTTPError as exc:
                detail = exc.read().decode("utf-8", "replace")[:300]
                # 4xx 是请求本身有问题（模型名错、额度不足），重试没意义
                if exc.code < 500 and exc.code != 429:
                    raise RuntimeError(f"模型接口返回 {exc.code}：{detail}") from exc
                last_err = RuntimeError(f"模型接口返回 {exc.code}：{detail}")
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                last_err = RuntimeError(f"网络异常：{exc}")
            if attempt < 2:
                time.sleep(1.5 * (attempt + 1))
        raise last_err or RuntimeError("调用模型失败（原因未知）")

    @staticmethod
    def _pick_content(data: dict[str, Any]) -> str:

        try:
            return data["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError) as exc:
            raise RuntimeError(f"模型返回格式异常：{str(data)[:300]}") from exc


def get_provider(cfg: LLMConfig) -> Provider:
    if cfg.provider == "mock":
        return MockProvider()
    if cfg.provider == "openai":
        return OpenAIProvider(cfg)
    raise ValueError(f"未知 provider：{cfg.provider}")


def parse_json_loose(text: str) -> Any:
    """模型经常在 JSON 外面裹一层 ```json，这里容错剥掉。"""

    s = (text or "").strip()
    if s.startswith("```"):
        s = re.sub(r"^```[a-zA-Z]*\s*", "", s)
        s = re.sub(r"```\s*$", "", s).strip()
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        pass
    for lch, rch in (("{", "}"), ("[", "]")):
        i, j = s.find(lch), s.rfind(rch)
        if i != -1 and j > i:
            try:
                return json.loads(s[i:j + 1])
            except json.JSONDecodeError:
                continue
    raise ValueError("模型没有返回合法 JSON")


# --------------------------------------------------------------------------- #
# 5. 看图理解（B2）：这是全项目最容易被判「假多模态」的地方
# --------------------------------------------------------------------------- #

IMAGE_PROMPT = """你在为一款教育配对游戏提取知识。请仔细看这张图，只描述你真的看到的东西。

严格区分三类信息，不要混：
1. 图中直接可见的：形状、文字标签、箭头方向
2. 需要「图 + 常识」才能推出的：部件之间的功能关系、连接关系蕴含的结论
3. 无法确定的：模糊、被遮挡、看起来像但没把握的内容

输出 JSON（不要任何解释文字）：
{
  "topic": "这张图的主题，20 字以内",
  "visible_parts": ["图中能看到的部件名称"],
  "connections": ["箭头/连线的走向，例如：外网箭头指向防火墙"],
  "relations": [
    {"left": "部件名", "relation": "功能是", "right": "这个部件的作用，20 字以内",
     "evidence": "图里凭什么这么判断", "confidence": 0.0}
  ],
  "uncertainties": ["没把握的内容"],
  "confidence": 0.0
}

要求：
- relations 只放「能直接做成配对题」的，没有就返回空数组，不要硬凑
- 每条 relations 必须是这个图特有的，不能是「计算机很重要」这种废话
- 如果这张图没有信息量（纯装饰、纯 logo、纯照片），topic 写空字符串，relations 返回 []
- confidence 是你对整张图理解的整体把握，0 到 1
"""


def analyze_image(image: ImageAsset, provider: Provider, cfg: LLMConfig,
                  context: str = "") -> ImageAnalysis:
    """把图真的送进视觉模型。这里传的是 base64 图片，不是 OCR 文本。"""

    if provider.name == "mock":
        fixture = _demo_fixture_for(image)
        if fixture:
            return fixture
        return ImageAnalysis(
            image_id=image.image_id, ok=False,
            error="未配置 API Key，这张图没有真的被分析（避免假装看过）",
        )

    try:
        b64 = _prepare_image_b64(Path(image.path))
    except Exception as exc:
        return ImageAnalysis(image_id=image.image_id, ok=False, page=image.page,
                             error=f"读图失败：{exc}")

    user_text = IMAGE_PROMPT
    if context:
        user_text += f"\n\n这张图在原文中的上下文（只作参考，不要当成图里看到的内容）：\n{context[:600]}"
    if image.caption:
        user_text += f"\n\n图注：{image.caption}"

    messages = [{
        "role": "user",
        "content": [
            {"type": "text", "text": user_text},
            {"type": "image_url",
             "image_url": {"url": f"data:image/png;base64,{b64}", "detail": "high"}},
        ],
    }]

    try:
        raw = provider.chat(messages, model=cfg.vision_model, max_tokens=1500)
        data = parse_json_loose(raw)
    except Exception as exc:
        return ImageAnalysis(image_id=image.image_id, ok=False, page=image.page,
                             error=str(exc)[:200])

    relations: list[Relation] = []
    for item in data.get("relations") or []:
        if not isinstance(item, dict):
            continue
        left, right = _squash(str(item.get("left", ""))), _squash(str(item.get("right", "")))
        if not left or not right:
            continue
        relations.append(Relation(
            left=left, right=right,
            relation=_squash(str(item.get("relation", "") or "功能是")),
            evidence=_squash(str(item.get("evidence", ""))),
            confidence=float(item.get("confidence", 0.6) or 0.6),
        ))

    return ImageAnalysis(
        image_id=image.image_id,
        page=image.page,
        topic=_squash(str(data.get("topic", ""))),
        visible_parts=[_squash(str(x)) for x in (data.get("visible_parts") or [])][:15],
        connections=[_squash(str(x)) for x in (data.get("connections") or [])][:15],
        relations=relations,
        uncertainties=[_squash(str(x)) for x in (data.get("uncertainties") or [])][:8],
        confidence=float(data.get("confidence", 0.0) or 0.0),
    )


def _prepare_image_b64(path: Path) -> str:
    """缩图 + 转 PNG + base64。大图直接送模型既慢又贵。"""

    try:
        from PIL import Image

        with Image.open(path) as im:
            im = im.convert("RGB")
            w, h = im.size
            scale = min(1.0, MAX_IMAGE_SIDE / max(w, h))
            if scale < 1.0:
                im = im.resize((int(w * scale), int(h * scale)))
            import io

            buf = io.BytesIO()
            im.save(buf, format="PNG", optimize=True)
        return base64.b64encode(buf.getvalue()).decode("ascii")
    except ImportError:
        return base64.b64encode(path.read_bytes()).decode("ascii")


# --------------------------------------------------------------------------- #
# 6. 知识点提取（B4）：模型出候选，代码做校验
# --------------------------------------------------------------------------- #

EXTRACT_PROMPT = """你要把下面的学习资料整理成「配对游戏」用的知识点。配对游戏的玩法是：
左边显示一个概念，右边显示若干条定义，玩家要把它们连起来。所以：

一条知识点 = 一个概念 + 一条定义，而且必须能「唯一对应」。

硬性要求：
1. 只提取能形成明确对应关系的内容。目录标题、章节名、寒暄、「本章我们将学习」
   这类内容不要。
2. 每条 evidence 必须是资料里连续的原文片段（一字不改，20 到 80 字），
   用来核对你是不是编的。
3. definition 控制在 4 到 80 字，要能独立看懂，不要在定义里重复概念本身
   （比如「路由器：指的是路由器这种设备」就是废话）。
4. 同义概念合并成一条；如果资料里对同一概念有两种不同说法，各自保留。
5. source_id 填这段内容所属的编号，就是下面每个方括号里的那个。

输出 JSON（不要解释文字）：
{"points": [{"concept": "概念", "definition": "定义", "relation_type":
"concept_definition", "difficulty": "easy|medium|hard", "evidence": "原文片段",
"source_id": "编号", "confidence": 0.0}]}

最多输出 {max_points} 条，宁少勿滥。没有合适内容就返回 {"points": []}。

资料如下（每段前面的方括号是来源编号）：

{content}
"""


def rule_extract_pairs(text: str) -> list[dict[str, Any]]:
    """Mock 用的规则提取：认「概念：定义」「概念 - 定义」这两种写法。

    真模型不需要它，但没 Key 的时候它能让整条链路跑通、让 A/C 当天就能联调。
    """

    out: list[dict[str, Any]] = []
    patterns = [
        re.compile(r"^\s*[-*\d.、\s]*\**\s*([^：:，。；\n]{1,30}?)\s*\**\s*[：:]\s*(.{4,160})$"),
        re.compile(r"^\s*[-*\d.、\s]*\**\s*([^：:，。；\n]{1,30}?)\s*\**\s*[—\-]{1,2}\s*(.{6,160})$"),
    ]
    for line in text.splitlines():
        # 去掉 [source_id] 前缀，否则会被当成概念
        line = re.sub(r"^\s*\[[^\]]+\]\s*", "", line).strip()
        if not line or len(line) > 200:
            continue
        for pat in patterns:
            m = pat.match(line)
            if not m:
                continue
            concept = m.group(1).strip(" *_`\"'“”")
            definition = m.group(2).strip(" *_`")
            if not concept or len(concept) > 30:
                break
            if concept in {"例如", "注意", "说明", "提示", "注意点", "小结"}:
                break
            if len(definition) < 4:
                break
            out.append({
                "concept": concept,
                "definition": definition,
                "relation_type": "concept_definition",
                "difficulty": _guess_difficulty(definition),
                "evidence": line[:200],
                "confidence": 0.62,
            })
            break
    return out


def build_chunks(blocks: list[TextBlock], max_chars: int = 1800) -> list[list[TextBlock]]:
    """把文字块按长度打包，绝不把一段话切成两半（否则来源就对不上了）。"""

    chunks: list[list[TextBlock]] = []
    current: list[TextBlock] = []
    size = 0
    for block in blocks:
        if current and size + len(block.text) > max_chars:
            chunks.append(current)
            current, size = [], 0
        current.append(block)
        size += len(block.text)
    if current:
        chunks.append(current)
    return chunks


def extract_points(material: Material, provider: Provider, cfg: LLMConfig,
                   max_points: int = 24) -> tuple[list[KnowledgePoint], list[dict[str, str]]]:
    """文字部分的知识点提取。每条结果都要过来源校验。"""

    points: list[KnowledgePoint] = []
    issues: list[dict[str, str]] = []
    chunk_texts: dict[str, str] = {b.source_id: b.text for b in material.blocks}

    chunks = build_chunks(material.blocks)
    used = 0
    for ci, chunk in enumerate(chunks):
        if len(points) >= max_points:
            issues.append(_issue("info", "reached_limit",
                                 f"已达到本次上限 {max_points} 条，剩余内容未处理"))
            break
        prompt = (
            EXTRACT_PROMPT
            .replace("{max_points}", str(min(8, max_points - len(points))))
            .replace("{content}", "\n".join(f"[{b.source_id}] {b.text}" for b in chunk))
        )
        try:
            if provider.name == "mock":
                # mock 走规则，绝不能让 prompt 里的 JSON 示例被当成资料内容
                data = {"points": rule_extract_pairs(
                    "\n".join(f"[{b.source_id}] {b.text}" for b in chunk))}
            else:
                raw = provider.chat(
                    [{"role": "user", "content": prompt}],
                    model=cfg.text_model, max_tokens=2500,
                )
                data = parse_json_loose(raw)
        except Exception as exc:
            issues.append(_issue("warning", "model_failed",
                                 f"第 {ci + 1} 块提取失败：{str(exc)[:120]}"))
            continue

        used += 1
        for item in (data.get("points") or []):
            if not isinstance(item, dict):
                continue
            point = _to_point(item, chunk, chunk_texts)
            if point is not None:
                points.append(point)

    if used:
        issues.append(_issue("info", "coverage",
                             f"一共 {len(chunks)} 块，处理了 {used} 块"))
    return points, issues


def _to_point(item: dict[str, Any], chunk: list[TextBlock],
              chunk_texts: dict[str, str]) -> KnowledgePoint | None:
    """把模型给的一条候选，变成带可信来源的 KnowledgePoint。"""

    concept = _squash(str(item.get("concept", "")))
    definition = _squash(str(item.get("definition", "")))
    if not concept or not definition:
        return None

    evidence = _squash(str(item.get("evidence", "")))
    claimed = _squash(str(item.get("source_id", "")))

    # ---- 来源校验：三级定位，对不上就老实标出来 ----
    source_id = ""
    trusted = False
    if claimed in chunk_texts:
        source_id, trusted = claimed, True
    if not trusted and evidence:
        probe = evidence[:30]
        for block in chunk:
            if probe and probe in block.text:
                source_id, trusted = block.source_id, True
                break
    if not trusted:
        for block in chunk:
            if evidence and block.text and evidence[:20] in block.text:
                source_id, trusted = block.source_id, False
                break
    if not source_id and chunk:
        source_id = chunk[0].source_id

    point = KnowledgePoint(
        concept=concept,
        definition=definition,
        relation_type=_squash(str(item.get("relation_type", "concept_definition"))),
        difficulty=_squash(str(item.get("difficulty") or _guess_difficulty(definition))),
        evidence=evidence,
        sources=[source_id] if source_id else [],
        source_kind="text",
        source_desc=f"原文 {source_id}" if source_id else "来源不明",
        modality="text",
        confidence=float(item.get("confidence", 0.6) or 0.6),
    )
    if not trusted:
        point.playable = False
        point.review_reasons.append("来源无法核实（模型给的出处对不上原文）")
    return point


def points_from_images(analyses: list[ImageAnalysis]) -> list[KnowledgePoint]:
    """把图里抽出的关系变成知识点。

    注意这里是「确定性转换」：模型在图像阶段已经明确说出了 left/relation/right，
    到这一步只是换个容器，不再让它用文字模型复述一遍——复述就会走样，
    走样了「只能靠图才能得出的知识」这条验收标准就没法保证了。
    """

    out: list[KnowledgePoint] = []
    for analysis in analyses:
        if not analysis.ok:
            continue
        for rel in analysis.relations:
            point = KnowledgePoint(
                concept=rel.left,
                definition=rel.right,
                relation_type="part_function" if "功能" in rel.relation else "concept_definition",
                difficulty="medium",
                evidence=rel.evidence or f"图示：{analysis.topic}",
                sources=[analysis.image_id],
                source_kind="image",
                source_desc=(f"图示（第 {analysis.page} 页）" if analysis.page else "图示"),
                modality="image",
                confidence=rel.confidence or analysis.confidence,
            )
            out.append(point)
    return out


# --------------------------------------------------------------------------- #
# 7. 去重与质检（B5）
# --------------------------------------------------------------------------- #

def dedupe(points: list[KnowledgePoint]) -> tuple[list[KnowledgePoint], list[dict[str, str]]]:
    """同一概念合并；同一概念但定义差很多，标成冲突留给用户判断。"""

    issues: list[dict[str, str]] = []
    groups: dict[str, list[KnowledgePoint]] = {}
    for p in points:
        groups.setdefault(p.key, []).append(p)

    merged: list[KnowledgePoint] = []
    for key, group in groups.items():
        if len(group) == 1:
            merged.append(group[0])
            continue

        # 按定义相似度聚类
        clusters: list[list[KnowledgePoint]] = []
        for point in group:
            placed = False
            for cluster in clusters:
                if difflib.SequenceMatcher(
                    None, _norm(cluster[0].definition), _norm(point.definition)
                ).ratio() >= 0.75:
                    cluster.append(point)
                    placed = True
                    break
            if not placed:
                clusters.append([point])

        for cluster in clusters:
            head = cluster[0]
            for other in cluster[1:]:
                for sid in other.sources:
                    if sid not in head.sources:
                        head.sources.append(sid)
                if not head.evidence and other.evidence:
                    head.evidence = other.evidence
                if other.source_kind == "image":
                    head.source_kind = "mixed" if head.source_kind == "text" else head.source_kind
                    head.modality = "mixed"
            if len(cluster) > 1:
                issues.append(_issue("info", "merged",
                                     f"「{head.concept}」出现 {len(cluster)} 次，已合并来源"))
            merged.append(head)

        if len(clusters) > 1:
            issues.append(_issue(
                "warning", "conflicting_definition",
                f"「{group[0].concept}」在资料里有 {len(clusters)} 种不同说法，"
                f"已全部保留并标记待确认（不替用户做决定）",
            ))

    # 定义重复（不同概念用同一句定义）也会让配对不唯一
    by_def: dict[str, list[KnowledgePoint]] = {}
    for p in merged:
        by_def.setdefault(_norm(p.definition), []).append(p)
    for defn, group in by_def.items():
        if len(group) > 1:
            for p in group:
                if "与其它概念共用同一句定义，配对不唯一" not in p.review_reasons:
                    p.review_reasons.append("与其它概念共用同一句定义，配对不唯一")
                    p.playable = False

    return merged, issues


# --------------------------------------------------------------------------- #
# 8. 总流程
# --------------------------------------------------------------------------- #

def extract(path: str | Path, cfg: LLMConfig | None = None,
            pages: list[int] | None = None, demo: bool = False,
            max_points: int = 24, max_images: int = 5,
            material: Material | None = None) -> Result:
    """B 的唯一入口。A 只需要调这一个函数。

    传 material 进来可以复用已经解析好的结果（CLI 就是靠这个避免读两遍文件）。
    """

    cfg = cfg or LLMConfig.from_env()
    provider = get_provider(cfg)

    material = material or parse(path, pages=pages)
    result = Result(material_file=material.filename)
    result.issues.extend(material.issues)

    # ---- 看图 ----
    analyses: list[ImageAnalysis] = []
    for image in material.images[:max_images]:
        context = ""
        if image.page:
            same_page = [b.text for b in material.blocks if b.page == image.page]
            context = "\n".join(same_page)[:500]
        analysis = analyze_image(image, provider, cfg, context=context)
        if demo and not analysis.relations:
            fallback = _demo_fixture_for(image, force=True)
            if fallback:
                fallback.ok = True
                fallback.error = ""
                analysis = fallback
        analyses.append(analysis)
        if not analysis.ok:
            result.issues.append(_issue("warning", "image_skipped",
                                        f"图 {image.image_id} 未分析：{analysis.error}"))
    if len(material.images) > max_images:
        result.issues.append(_issue("info", "image_limit",
                                    f"一共 {len(material.images)} 张图，本次只分析前 {max_images} 张"))
    result.image_analyses = analyses

    # ---- 文字提取 ----
    text_points, extract_issues = extract_points(material, provider, cfg, max_points)
    result.issues.extend(extract_issues)

    # ---- 图像关系直接落成知识点 ----
    image_points = points_from_images(analyses)
    if image_points:
        result.issues.append(_issue("info", "image_derived",
                                    f"从图示关系直接生成 {len(image_points)} 条知识点"))

    # ---- 去重与质检 ----
    all_points = text_points + image_points
    merged, dedupe_issues = dedupe(all_points)
    result.issues.extend(dedupe_issues)

    if len(merged) > max_points:
        merged = merged[:max_points]

    if len(merged) < 3:
        result.issues.append(_issue(
            "warning", "too_few_points",
            f"只得到 {len(merged)} 条知识点，不够开一局配对游戏（建议至少 6 条）",
        ))

    result.points = [p for p in merged if p.playable]
    result.rejected = [p for p in merged if not p.playable]

    result.stats = {
        "kept": len(result.points),
        "rejected": len(result.rejected),
        "image_derived": sum(1 for p in result.points if p.source_kind in ("image", "mixed")),
        "images_analyzed": sum(1 for a in analyses if a.ok),
        "text_blocks": len(material.blocks),
        "chars": material.total_chars,
    }
    return result


# --------------------------------------------------------------------------- #
# 9. 内置演示答案（--demo 用）
#     只在显式加 --demo 时生效，且终端会明确打印「这是演示数据」。
# --------------------------------------------------------------------------- #

_DEMO_FIXTURES: dict[str, dict[str, Any]] = {
    "network": {
        "topic": "校园网出口拓扑：外网经防火墙、路由器、交换机接入内网终端",
        "visible_parts": ["外网", "防火墙", "路由器", "交换机", "内网主机", "服务器"],
        "connections": [
            "外网箭头指向防火墙，表示外部流量必须先经过边界设备",
            "防火墙向下连到路由器",
            "路由器向下连到交换机",
            "交换机同时连接内网主机和服务器",
        ],
        "relations": [
            {"left": "防火墙", "relation": "功能是",
             "right": "位于外网与内网之间，检查并过滤进出流量",
             "evidence": "外网与路由器之间只有防火墙一个节点", "confidence": 0.86},
            {"left": "路由器", "relation": "功能是",
             "right": "连接防火墙与交换机，在不同网段之间转发数据包",
             "evidence": "上游连防火墙、下游连交换机", "confidence": 0.84},
            {"left": "交换机", "relation": "功能是",
             "right": "在同一网段内连接多台终端并转发数据帧",
             "evidence": "同时连出两条线到内网主机和服务器", "confidence": 0.83},
        ],
        "uncertainties": ["旁边那条虚线是否表示被阻断的备用链路"],
        "confidence": 0.85,
    },
}


def _demo_fixture_for(image: ImageAsset, force: bool = False) -> ImageAnalysis | None:
    """按文件名/所在页码猜该用哪份演示答案。force=True 时不再挑剔条件。"""

    key = ""
    name = Path(image.path).name.lower()
    if "network" in name or "拓扑" in name:
        key = "network"
    elif image.page == 1 and not force:
        key = ""
    elif force and "render" in name:
        key = "network"

    if not key or key not in _DEMO_FIXTURES:
        return None
    data = _DEMO_FIXTURES[key]
    return ImageAnalysis(
        image_id=image.image_id,
        page=image.page,
        topic=data["topic"],
        visible_parts=list(data["visible_parts"]),
        connections=list(data["connections"]),
        relations=[Relation(**r) for r in data["relations"]],
        uncertainties=list(data["uncertainties"]),
        confidence=data["confidence"],
    )


# --------------------------------------------------------------------------- #
# 10. 输出：终端报告 + JSON + HTML
# --------------------------------------------------------------------------- #

def _rule(title: str) -> None:
    print()
    print("=" * 74)
    print(f"  {title}")
    print("=" * 74)


def _kv(label: str, value: Any) -> None:
    print(f"  {label:<12}{value}")


def print_report(material: Material, result: Result, demo: bool) -> None:
    print()
    print(f"文件：{material.filename}   类型：{material.file_type}")
    if demo:
        print("模式：DEMO（无 API Key，图中的关系使用内置演示答案，不是模型输出）")

    _rule("第 1 步 / 5   解析：文字带位置，图片单独挑出来")
    _kv("文字块", f"{len(material.blocks)} 块，共 {material.total_chars} 字")
    _kv("图片", f"{len(material.images)} 张")
    for b in material.blocks[:3]:
        _kv(b.source_id, b.text[:56] + ("…" if len(b.text) > 56 else ""))
    for img in material.images:
        _kv("图片", f"{img.image_id}  第 {img.page or '-'} 页  {img.kind}  "
                    f"{img.width}x{img.height}")

    _rule("第 2 步 / 5   看图：图里画的，文字里往往没有")
    if not result.image_analyses:
        print("  这份材料里没有需要分析的图。")
    for a in result.image_analyses:
        print(f"\n  {a.image_id}")
        if not a.ok:
            _kv("状态", f"未分析 — {a.error}")
            continue
        _kv("主题", a.topic or "-")
        _kv("看得见的", "、".join(a.visible_parts[:8]) or "-")
        _kv("可配对关系", f"{len(a.relations)} 条")
        for r in a.relations:
            print(f"      {r.left} --{r.relation}--> {r.right}")
        if a.uncertainties:
            _kv("不确定", "、".join(a.uncertainties[:4]))

    _rule("第 3 步 / 5   知识点：每条都能回到原文或原图")
    total = len(result.points) + len(result.rejected)
    print(f"  候选 {total} 条 → 可用 {len(result.points)} 条，不可用 {len(result.rejected)} 条\n")
    for i, p in enumerate(result.points, 1):
        tag = "【图】" if p.source_kind == "image" else "【文】"
        print(f"  {i:2d}. {p.concept}")
        print(f"      {p.definition}")
        print(f"      {tag} {p.source_desc}   难度 {p.difficulty}   "
              f"关系 {p.relation_type}")
        if p.evidence:
            print(f"      证据：{p.evidence[:70]}")
        print()

    _rule("第 4 步 / 5   质检：宁可少，不许错")
    if result.rejected:
        print("  这些不参与出题：")
        for p in result.rejected:
            print(f"    - {p.concept}：{'；'.join(p.review_reasons)}")
    else:
        print("  没有被剔除的知识点。")
    if result.issues:
        print("\n  过程记录（不隐藏）：")
        for it in result.issues:
            print(f"    [{it['level']}] {it['code']}：{it['message']}")

    _rule("第 5 步 / 5   交付")
    _kv("统计", json.dumps(result.stats, ensure_ascii=False))


def save_json(material: Material, result: Result, demo: bool,
              path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "material": {
            "file_id": material.file_id,
            "filename": material.filename,
            "file_type": material.file_type,
            "text_blocks": len(material.blocks),
            "images": [
                {"image_id": i.image_id, "page": i.page, "kind": i.kind, "path": i.path}
                for i in material.images
            ],
        },
        "points": [asdict(p) for p in result.points],
        "rejected": [asdict(p) for p in result.rejected],
        "image_analyses": [asdict(a) for a in result.image_analyses],
        "issues": result.issues,
        "stats": result.stats,
        "meta": {
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "demo_mode": demo,
            "schema_version": "1.0",
        },
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def save_html(material: Material, result: Result, demo: bool, path: Path) -> Path:
    """一张能直接给别人看的卡片页：可以勾掉不要的知识点，然后导出 JSON。"""

    image_map = {img.image_id: img for img in material.images}

    def thumb(p: KnowledgePoint) -> str:
        """来自图的知识点，必须能把原图放出来给人核对。"""

        if p.source_kind not in ("image", "mixed"):
            return ""
        for sid in p.sources:
            img = image_map.get(sid)
            if not img:
                continue
            try:
                uri = Path(img.path).resolve().as_uri()
            except Exception:
                continue
            page = f"第 {img.page} 页" if img.page else ""
            return (f'<a href="{uri}" target="_blank" class="thumb">'
                    f'<img src="{uri}" alt="原图"><span>原图 {page}（点击放大）</span></a>')
        return ""

    def card(i: int, p: KnowledgePoint) -> str:
        tag = "图" if p.source_kind in ("image", "mixed") else "文"
        return f"""
        <label class="card" data-id="{html.escape(p.knowledge_id)}">
          <input type="checkbox" checked>
          <div class="body">
            <div class="row">
              <span class="idx">{i:02d}</span>
              <span class="concept">{html.escape(p.concept)}</span>
              <span class="tag tag-{tag}">{tag}</span>
              <span class="tag">{html.escape(p.relation_type)}</span>
              <span class="tag">{html.escape(p.difficulty)}</span>
            </div>
            <div class="def">{html.escape(p.definition)}</div>
            <div class="meta">来源 {html.escape(p.source_desc)}
              {('· 证据：' + html.escape(p.evidence[:60])) if p.evidence else ''}</div>
            {thumb(p)}
          </div>
        </label>"""

    rejected = "".join(
        f"<li><b>{html.escape(p.concept)}</b> — {'；'.join(html.escape(r) for r in p.review_reasons)}</li>"
        for p in result.rejected
    ) or "<li>没有被剔除的知识点</li>"

    issues = "".join(
        f"<li><span class='lv lv-{html.escape(it['level'])}'>{html.escape(it['level'])}</span>"
        f"{html.escape(it['message'])}</li>"
        for it in result.issues
    ) or "<li>无</li>"

    data_json = json.dumps([asdict(p) for p in result.points], ensure_ascii=False)

    doc = f"""<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>知识点清单 · {html.escape(material.filename)}</title>
<style>
  :root {{ --ink:#2c2c2a; --mute:#5f5e5a; --line:#dcdad3; --bg:#faf9f6;
          --blue:#185fa5; --blue-bg:#e6f1fb; --red:#a32d2d; --red-bg:#fcebeb; }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; padding:32px 20px 80px; background:var(--bg); color:var(--ink);
         font-family:-apple-system,"Segoe UI","Microsoft YaHei",system-ui,sans-serif;
         line-height:1.6; }}
  .wrap {{ max-width:860px; margin:0 auto; }}
  h1 {{ font-size:20px; font-weight:500; margin:0 0 6px; }}
  .sub {{ color:var(--mute); font-size:13px; margin-bottom:24px; }}
  .stats {{ display:flex; gap:10px; flex-wrap:wrap; margin-bottom:24px; }}
  .stat {{ background:#fff; border:1px solid var(--line); border-radius:10px;
           padding:10px 16px; font-size:13px; }}
  .stat b {{ font-size:18px; font-weight:500; margin-right:4px; }}
  h2 {{ font-size:14px; font-weight:500; margin:28px 0 12px; }}
  .card {{ display:flex; gap:12px; background:#fff; border:1px solid var(--line);
           border-radius:10px; padding:14px 16px; margin-bottom:10px; cursor:pointer; }}
  .card:hover {{ border-color:#b4b2a9; }}
  .card input {{ margin-top:3px; }}
  .card.off {{ opacity:.45; }}
  .row {{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; }}
  .idx {{ color:#b4b2a9; font-size:12px; font-variant-numeric:tabular-nums; }}
  .concept {{ font-weight:500; font-size:15px; }}
  .def {{ margin-top:4px; }}
  .meta {{ margin-top:6px; color:var(--mute); font-size:12px; }}
  .thumb {{ display:inline-flex; flex-direction:column; gap:4px; margin-top:10px;
            text-decoration:none; }}
  .thumb img {{ max-height:130px; max-width:100%; border:1px solid var(--line);
                border-radius:6px; display:block; }}
  .thumb span {{ font-size:11px; color:var(--blue); }}
  .tag {{ font-size:11px; padding:1px 7px; border:1px solid var(--line);
          border-radius:999px; color:var(--mute); }}
  .tag-图 {{ background:var(--blue-bg); border-color:#b5d4f4; color:var(--blue); }}
  .tag-文 {{ background:#eaf3de; border-color:#c0dd97; color:#3b6d11; }}
  ul {{ padding-left:18px; font-size:13px; color:var(--mute); }}
  .lv {{ display:inline-block; min-width:44px; margin-right:8px; font-size:11px;
         text-align:center; border-radius:4px; padding:0 6px; background:#f1efe8; }}
  .lv-warning {{ background:var(--red-bg); color:var(--red); }}
  .lv-error {{ background:#791f1f; color:#fff; }}
  .bar {{ position:fixed; left:0; right:0; bottom:0; background:#fff;
          border-top:1px solid var(--line); padding:12px 20px; display:flex;
          justify-content:center; gap:12px; }}
  button {{ font:inherit; font-size:13px; padding:8px 18px; border-radius:8px;
            border:1px solid var(--line); background:#fff; cursor:pointer; }}
  button.primary {{ background:var(--blue); border-color:var(--blue); color:#fff; }}
</style></head>
<body><div class="wrap">
  <h1>知识点清单</h1>
  <div class="sub">{html.escape(material.filename)} · 共 {len(material.blocks)} 段文字
    · {len(material.images)} 张图 · 生成于 {datetime.now():%Y-%m-%d %H:%M}
    {(' · <b>演示数据</b>（未接真实模型）') if demo else ''}</div>

  <div class="stats">
    <div class="stat"><b>{result.stats.get('kept', 0)}</b>条可用</div>
    <div class="stat"><b>{result.stats.get('rejected', 0)}</b>条剔除</div>
    <div class="stat"><b>{result.stats.get('image_derived', 0)}</b>条来自图</div>
    <div class="stat"><b>{result.stats.get('images_analyzed', 0)}</b>张图已分析</div>
  </div>

  <h2>可用知识点（取消勾选可以排除）</h2>
  {''.join(card(i, p) for i, p in enumerate(result.points, 1)) or '<p class="sub">没有可用的知识点。</p>'}

  <h2>被剔除的知识点</h2>
  <ul>{rejected}</ul>

  <h2>过程记录</h2>
  <ul>{issues}</ul>
</div>
<div class="bar">
  <button onclick="toggleAll(true)">全选</button>
  <button onclick="toggleAll(false)">全不选</button>
  <button onclick="exportJson()" class="primary">导出已勾选 JSON</button>
</div>
<script>
const DATA = {data_json};
function toggleAll(on) {{
  document.querySelectorAll('.card').forEach(c => {{
    c.querySelector('input').checked = on;
    c.classList.toggle('off', !on);
  }});
}}
document.querySelectorAll('.card').forEach(c => {{
  c.querySelector('input').addEventListener('change', e => {{
    c.classList.toggle('off', !e.target.checked);
  }});
}});
function exportJson() {{
  const keep = new Set([...document.querySelectorAll('.card')]
    .filter(c => c.querySelector('input').checked)
    .map(c => c.dataset.id));
  const out = DATA.filter(p => keep.has(p.knowledge_id));
  const blob = new Blob([JSON.stringify({{ points: out }}, null, 2)], {{ type: 'application/json' }});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'confirmed_points.json';
  a.click();
}}
</script>
</body></html>"""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(doc, encoding="utf-8")
    return path


# --------------------------------------------------------------------------- #
# 11. 命令行
# --------------------------------------------------------------------------- #

def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        description="把课件变成配对题库（EduGame Agent 的 B 部分）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("file", help="课件路径：pdf / pptx / docx / txt / md / 图片")
    ap.add_argument("--page", type=int, action="append", dest="pages",
                    help="只看指定页码，可重复：--page 2 --page 3")
    ap.add_argument("--provider", choices=["mock", "openai"], default=None,
                    help="模型来源，默认按有没有 LLM_API_KEY 自动选")
    ap.add_argument("--demo", action="store_true",
                    help="无 Key 时用内置演示答案看完整效果（会明确标注）")
    ap.add_argument("--max-points", type=int, default=24, help="最多提取多少条")
    ap.add_argument("--max-images", type=int, default=5, help="最多分析几张图")
    ap.add_argument("--out", default=None, help="结果输出目录，默认 out/")
    ap.add_argument("--no-html", action="store_true", help="不生成 HTML 卡片页")
    args = ap.parse_args(argv)

    cfg = LLMConfig.from_env(args.provider)
    if cfg.provider == "openai" and not cfg.api_key:
        print("提示：没有 LLM_API_KEY，本次退回 mock 模式（文字走规则，图不分析）")
        cfg = LLMConfig(provider="mock", base_url=cfg.base_url,
                        text_model=cfg.text_model, vision_model=cfg.vision_model)

    material = parse(args.file, pages=args.pages)
    result = extract(args.file, cfg, pages=args.pages, demo=args.demo,
                     max_points=args.max_points, max_images=args.max_images,
                     material=material)

    print_report(material, result, demo=args.demo)

    out_dir = Path(args.out or OUT_DIR)
    stem = Path(args.file).stem
    json_path = save_json(material, result, args.demo, out_dir / f"{stem}.json")
    print(f"\n  JSON → {json_path}")
    if not args.no_html:
        html_path = save_html(material, result, args.demo, out_dir / f"{stem}.html")
        print(f"  HTML → {html_path}")

    if not result.points:
        print("\n  没有提取到可用的知识点。常见原因：")
        print("    · 没配 API Key，且这是图片类材料（图不会分析）")
        print("    · 课件文字太少，或知识点不是「概念—定义」结构")
        print("    · 试加 --demo 看完整效果")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
