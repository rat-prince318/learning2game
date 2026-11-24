"""B's source-aware course readers: lines, tables, figures and PDF page renders."""

from __future__ import annotations

import io
import re
import zipfile
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import BinaryIO
from xml.etree import ElementTree

from PIL import Image, ImageOps

from .office_math import paragraph_text

MAX_PAGE_COUNT = 80
MAX_FIGURES = 5
MAX_IMAGE_PIXELS = 16_000_000
MAX_IMAGE_SIDE = 1600
MAX_TEXT_CHARS = 140_000
MAX_BLOCKS = 4000
MAX_ARCHIVE_BYTES = 64 * 1024**2
# The native MuPDF library is single-threaded. Keep every document and page on
# the same worker even when FastAPI accepts concurrent uploads.
_PDF_READER = ThreadPoolExecutor(max_workers=1, thread_name_prefix="course-pdf")


class MaterialError(ValueError):
    """A user-facing message curated by these readers, safe to return to the browser."""


@dataclass
class TextBlock:
    source_id: str
    label: str
    text: str
    page: int | None = None


@dataclass
class ImageAsset:
    source_id: str
    label: str
    # JPEG content is short-lived and never written to the store.
    jpeg: bytes
    page: int | None = None


@dataclass
class Material:
    blocks: list[TextBlock] = field(default_factory=list)
    images: list[ImageAsset] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    text_chars: int = 0

    def warn(self, message: str):
        if message not in self.warnings:
            self.warnings.append(message)

    def add_text(self, source_id: str, label: str, text: str, page: int | None = None):
        text = text.strip()
        if not text:
            return
        if self.text_chars + len(text) > MAX_TEXT_CHARS or len(self.blocks) >= MAX_BLOCKS:
            self.warn("资料达到单次文字处理上限，可按章节拆分后继续。")
            return
        self.blocks.append(TextBlock(source_id, label, text, page))
        self.text_chars += len(text)

    def wants_figure(self, enabled: bool) -> bool:
        if not enabled:
            self.warn("本轮提取文字内容。图示关系可在启用视觉模型后提取。")
            return False
        if len(self.images) >= MAX_FIGURES:
            self.warn(f"每次最多分析 {MAX_FIGURES} 幅图，可缩小选页范围后继续。")
            return False
        return True

    def add_figure(self, data: bytes, source_id: str, label: str, page: int | None = None):
        try:
            with Image.open(io.BytesIO(data)) as image:
                if image.width * image.height > MAX_IMAGE_PIXELS or getattr(image, "n_frames", 1) != 1:
                    self.warn("有一幅图超过尺寸或帧数上限，请提供单张静态图。")
                    return
                image.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE))
                # Keep white transparent areas white when converting office PNGs to JPEG.
                oriented = ImageOps.exif_transpose(image).convert("RGBA")
                canvas = Image.new("RGB", oriented.size, "white")
                canvas.paste(oriented, mask=oriented.getchannel("A"))
                dst = io.BytesIO()
                canvas.save(dst, format="JPEG", quality=88)
                self.images.append(ImageAsset(source_id, label, dst.getvalue(), page))
        except (OSError, ValueError, Image.DecompressionBombError):
            self.warn("有一幅图的格式需要转换，建议使用 PNG 或 JPEG。")


_OFFICE = {
    ".docx": ("word/document.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"),
    ".pptx": ("ppt/presentation.xml", "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"),
}


def validate_office_archive(file: BinaryIO, suffix: str):
    """Bound XML/media expansion and validate the OPC main-part type before loading."""
    try:
        part, content_type = _OFFICE[suffix]
        with zipfile.ZipFile(file) as archive:
            files = archive.infolist()
            if len(files) > 2500 or sum(entry.file_size for entry in files) > MAX_ARCHIVE_BYTES:
                raise MaterialError("文档解压后超出单次处理上限，请拆分章节再上传。")
            if any(entry.flag_bits & 1 or entry.filename.lower().endswith("vbaproject.bin") for entry in files):
                raise MaterialError("请使用无密码、无宏的课件副本。")
            names = set(archive.namelist())
            if len(names) != len(files) or part not in names:
                raise ValueError("Missing or duplicate office parts")
            if archive.getinfo("[Content_Types].xml").file_size > 2 * 1024**2:
                raise ValueError("OPC manifest limit")
            manifest = ElementTree.fromstring(archive.read("[Content_Types].xml"))
            if not any(entry.get("PartName") == "/" + part and entry.get("ContentType") == content_type
                       for entry in manifest):
                raise ValueError("Mismatched office type")
    except MaterialError:
        raise
    except (ValueError, OSError, zipfile.BadZipFile, KeyError, ElementTree.ParseError, RuntimeError):
        raise MaterialError("请上传与扩展名相符、可正常打开的 Word 或 PowerPoint 文件。") from None
    finally:
        file.seek(0)


def _selected_pages(total: int, pages: list[int] | None) -> list[int]:
    if total < 1 or (len(pages) if pages else total) > MAX_PAGE_COUNT:
        raise MaterialError(f"每次可读取 {MAX_PAGE_COUNT} 页，请选择本次要学习的章节页码。")
    if not pages:
        return list(range(1, total + 1))
    if any(type(n) is not int or not 1 <= n <= total for n in pages):
        raise MaterialError(f"请选择第 1 至 {total} 页之间的页码。")
    return sorted(set(pages))


def _drop_repeated_headers(material: Material):
    # B's cross-page repeated header filter, limited to edge lines.
    by_page: dict[int, list[TextBlock]] = {}
    for block in material.blocks:
        if block.page:
            by_page.setdefault(block.page, []).append(block)
    if len(by_page) < 3:
        return
    repeated: dict[str, set[int]] = {}
    candidates = set()
    for page, blocks in by_page.items():
        for block in (blocks[0], blocks[-1]):
            if len(block.text) <= 60 and not re.search(r"[:：]", block.text):
                repeated.setdefault(block.text, set()).add(page)
                candidates.add(block.source_id)
    material.blocks = [block for block in material.blocks if block.source_id not in candidates
                       or len(repeated[block.text]) < max(3, len(by_page) * .6)]


def _read_pdf(path: Path, material: Material, pages, figures: bool):
    import pymupdf

    with pymupdf.open(path) as doc:
        if doc.needs_pass:
            raise MaterialError("请上传可直接打开的 PDF 副本。")
        for number in _selected_pages(len(doc), pages):
            page = doc[number - 1]
            char_count = 0
            for index, block in enumerate(page.get_text("blocks", flags=pymupdf.TEXTFLAGS_BLOCKS & ~pymupdf.TEXT_PRESERVE_IMAGES)):
                if block[6] != 0:
                    continue
                text = block[4].strip()
                if not text or re.fullmatch(r"[\d\s/第页—\-]+", text):
                    continue
                char_count += len(text)
                material.add_text(f"pdf:p{number}:b{index}", f"第 {number} 页，第 {index + 1} 段", text, number)
            embedded = page.get_images(full=False)
            # Vector slides retain arrows, labels and their positions in a single page render.
            vector = char_count < 600 and len(page.get_drawings()) >= 3
            if not (embedded or vector or char_count == 0) or not material.wants_figure(figures):
                continue
            if any(w * h > MAX_IMAGE_PIXELS for _, _, w, h, *_ in embedded):
                material.warn(f"第 {number} 页的一幅图超过尺寸上限，请单独上传缩小后的图。")
                continue
            long_side = max(page.rect.width, page.rect.height)
            if not 0 < long_side < 1_000_000:
                material.warn(f"第 {number} 页的画布尺寸异常，请检查页面设置。")
                continue
            zoom = min(2.0, MAX_IMAGE_SIDE / long_side)
            pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), colorspace=pymupdf.csRGB, alpha=False)
            material.add_figure(pix.tobytes("png"), f"pdf:p{number}:figure", f"第 {number} 页图示", number)
    _drop_repeated_headers(material)


_HEADERS = {"概念", "名称", "术语", "词条", "定义", "含义", "说明", "功能", "作用", "描述", "解释",
            "term", "concept", "name", "definition", "description", "function"}


def _table_row(cells, warn) -> str:
    values = []
    for cell in cells:
        paragraphs = cell.paragraphs if hasattr(cell, "paragraphs") else cell.text_frame.paragraphs
        text = " ".join(paragraph_text(p, warn) for p in paragraphs).strip()
        if text:
            values.append(" ".join(text.split()))
    if len(values) == 2 and all(value.casefold() in _HEADERS for value in values):
        return ""
    return "：".join(values) if len(values) == 2 else " | ".join(values)


def _read_slides(path: Path, material: Material, pages, figures: bool):
    from pptx import Presentation
    from pptx.enum.shapes import MSO_SHAPE_TYPE

    slides = Presentation(str(path)).slides
    for number in _selected_pages(len(slides), pages):
        for index, shape in enumerate(slides[number - 1].shapes):
            sid = f"pptx:p{number}:s{index + 1}"
            label = f"第 {number} 张幻灯片"
            if shape.has_table:
                for ri, row in enumerate(shape.table.rows, 1):
                    material.add_text(f"{sid}:r{ri}", f"{label}，表格第 {ri} 行", _table_row(row.cells, material.warn), number)
            elif shape.has_text_frame:
                material.add_text(sid, label, "\n".join(paragraph_text(p, material.warn) for p in shape.text_frame.paragraphs).replace("\v", "\n"), number)
            elif shape.shape_type == MSO_SHAPE_TYPE.PICTURE and material.wants_figure(figures):
                material.add_figure(shape.image.blob, sid, f"{label}，图 {index + 1}", number)


def _read_docx(path: Path, material: Material, figures: bool):
    import docx
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    doc = docx.Document(str(path))
    para = table = 0
    # Walking children in order retains the relation between paragraphs and tables.
    for child in doc.element.body.iterchildren():
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            para += 1
            material.add_text(f"docx:p{para}", f"第 {para} 段", paragraph_text(Paragraph(child, doc), material.warn))
        elif tag == "tbl":
            table += 1
            for ri, row in enumerate(Table(child, doc).rows, 1):
                material.add_text(f"docx:t{table}:r{ri}", f"表 {table} 第 {ri} 行", _table_row(row.cells, material.warn))
    img = 0
    for rel in doc.part.rels.values():
        if not rel.is_external and rel.reltype.endswith("/image"):
            img += 1
            if material.wants_figure(figures):
                material.add_figure(rel.target_part.blob, f"docx:image{img}", f"插图 {img}")


def read_material(path: Path, *, pages: list[int] | None, figures: bool) -> Material:
    material = Material()
    suffix = path.suffix.lower()
    if pages and suffix not in {".pdf", ".pptx"}:
        raise MaterialError("选页适用于 PDF 和 PowerPoint。")
    try:
        if path.stat().st_size > 32 * 1024**2:
            raise MaterialError("请将材料拆分为 32 MiB 以内的文件。")
        if suffix in _OFFICE:
            with path.open("rb") as stream:
                validate_office_archive(stream, suffix)
        if suffix == ".pdf":
            _PDF_READER.submit(_read_pdf, path, material, pages, figures).result()
        elif suffix == ".pptx":
            _read_slides(path, material, pages, figures)
        elif suffix == ".docx":
            _read_docx(path, material, figures)
        elif suffix in {".txt", ".md", ".markdown"}:
            # Count source lines before removing blank lines or Markdown headings.
            with path.open(encoding="utf-8-sig") as stream:
                for number, line in enumerate(stream, 1):
                    material.add_text(f"line:{number}", f"第 {number} 行", line)
                    if material.text_chars >= MAX_TEXT_CHARS or len(material.blocks) >= MAX_BLOCKS:
                        break
        elif suffix in {".jpg", ".jpeg", ".png"}:
            if figures:
                material.add_figure(path.read_bytes(), "image:1", "图 1")
            else:
                raise MaterialError("图示关系提取需要启用视觉模型。也可以上传包含术语和定义的文字讲义。")
        else:
            raise MaterialError("请上传 PDF、PPTX、DOCX、TXT、Markdown、PNG 或 JPEG 文件。")
    except MaterialError:
        raise
    except Exception:
        raise MaterialError("资料读取失败。请检查文件内容，或将所需章节另存后重新上传。") from None
    return material
