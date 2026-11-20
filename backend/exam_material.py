"""Separate numbered exercises, verbatim conditions and worked solutions before authoring."""

from __future__ import annotations

import hashlib
import re
import unicodedata
from dataclasses import dataclass, field

from .exam_answers import conflicts_with_solution
from .material_processing import Material, MaterialError, TextBlock
from .models import MAX_MATERIAL_POINTS, KnowledgeItem, MaterialResult
from .question_identity import exercise_key

_PROBLEM = re.compile(
    r"^(?:(?:question|problem|exercise)\s+(\d{1,3})\s*[.、:)]?|(\d{1,3})[.、)](?=\s|[^\x00-\x7f])\s*|第\s*(\d{1,3})\s*题\s*[.、:：]?)\s*(.*)$",
    re.I,
)
_PART = re.compile(r"^[（(]([a-hA-H])[)）]\s*(.+)$")
_SOLUTION = re.compile(r"(?<!\w)(?:solution|answer|working|解答|参考答案|解析)\s*[:：]\s*", re.I)
_SCORE = re.compile(r"\(\s*\d+(?:\.\d+)?\s*(?:pt(?:s)?\.?|points?|分)\s*\)", re.I)
_EXAM = re.compile(
    r"\b(?:midterm|exam(?:ination)?|problem set|answer key|mark(?:ing)? scheme|grading guide(?:line)?|quiz)\b|期[中末]考试|试卷|参考解答|考试时间",
    re.I,
)
_FOOTER = re.compile(
    r"^(?:©|copyright\b|page\s+\d+\s*(?:of\s*\d+)?$|第\s*\d+\s*页\s*(?:共\s*\d+\s*页)?$)", re.I
)
_ADMINISTRATIVE = re.compile(
    r"^(?:time (?:allowed|limit)|exam(?:ination)? (?:duration|rules)|candidate (?:id|name|number)|"
    r"seat (?:number|no\.)|room no\.|permitted materials|closed.book|approved references?|"
    r"show all (?:your )?work|write (?:your )?name|do not open (?:this |the )?(?:paper|booklet)|"
    r"考试时间|考试纪律|考生须知|注意事项|准考证号|座位号|允许携带)\s*",
    re.I,
)


def normalize(text):
    # OCR line wrapping sometimes splits long words at the physical line edge.
    text = re.sub(r"(?<=[A-Za-z])-\s+(?=[a-z])", "", text)
    return " ".join(unicodedata.normalize("NFKC", text).split())


@dataclass
class Passage:
    lines: list[tuple[str, TextBlock]] = field(default_factory=list)

    @property
    def text(self) -> str:
        return normalize(" ".join(line for line, block in self.lines))

    def add(self, text, block):
        if text.strip():
            self.lines.append((text.strip(), block))


@dataclass
class Part:
    letter: str
    ask: Passage = field(default_factory=Passage)
    solution: Passage = field(default_factory=Passage)


@dataclass
class Problem:
    number: int
    setup: Passage = field(default_factory=Passage)
    parts: list[Part] = field(default_factory=list)


def parse_exam(material: Material, filename: str) -> list[Problem] | None:
    problems = []
    current = None
    target = None
    scored = 0
    for block in material.blocks:
        for raw in block.text.splitlines():
            raw = raw.strip()
            if not raw or _FOOTER.match(raw):
                continue
            if _SCORE.search(raw):
                scored += 1
            line = _SCORE.sub("", raw).strip()
            if not line:
                continue
            start = _PROBLEM.match(line)
            if start:
                number = int(next(group for group in start.groups()[:3] if group))
                if number > 0:
                    current = Problem(number)
                    problems.append(current)
                    target = current.setup
                    line = start[4]
            if current is None:
                continue
            sub = _PART.match(line)
            if sub and sub[1].islower():
                part = Part(sub[1])
                current.parts.append(part)
                target = part.ask
                line = sub[2]
            answer = _SOLUTION.search(line)
            if answer:
                target.add(line[: answer.start()], block)
                if not current.parts:
                    current.parts.append(Part(""))
                target = current.parts[-1].solution
                line = line[answer.end() :]
            target.add(line, block)
    headings = [
        line.strip()
        for b in material.blocks[:28]
        for line in b.text.splitlines()
        if len(line.strip()) < 90 and not re.search(r"[.!?。！？]$", line.strip())
    ]
    # 'Final' on its own is common in a student's final set of lecture notes.
    # Numbered glossary entries keep going through the ordinary lecture reader.
    targets = sum(
        bool(
            re.search(
                r"[?？]|\b(?:find|calculate|determine|derive|prove|evaluate)\b|求解|计算",
                " ".join([p.setup.text, *(part.ask.text for part in p.parts)]),
                re.I,
            )
        )
        for p in problems
    )
    looks_numbered = len(problems) >= 2 and targets >= 2 or scored >= 2 and any(p.parts for p in problems)
    cover = " ".join(b.text for b in material.blocks[:35])
    cover_fields = re.search(r"time allowed\s*[:：]|答题时间\s*[:：]", cover, re.I) and re.search(
        r"candidate (?:id|number)|seat (?:no|number)|closed.book|座位号|准考证|考生须知", cover, re.I
    )
    if (
        not cover_fields
        and not looks_numbered
        and not any(_EXAM.search(s) for s in [*headings, filename.replace("_", " ")])
    ):
        return None
    return problems


def knowledge_from_exam(material, problems, filename, *, live_provider=None):
    from .physics_exam import solve_part

    items, skipped, model_candidates = [], 0, 0
    seen = set()
    assigned_ids = set()
    for problem in problems:
        for part in problem.parts or [Part("")]:
            # A standalone numbered question often ends in the same paragraph
            # as its conditions. Do not feed the worked solution to the solver.
            task_text = part.ask.text or problem.setup.text
            if _ADMINISTRATIVE.match(problem.setup.text) or _ADMINISTRATIVE.match(task_text):
                continue
            result = solve_part(problem.setup.text, task_text)
            if result and conflicts_with_solution(result, part.solution.text):
                result = None
            reviewed_by_model = False
            if result is None and live_provider and model_candidates < 8:
                from .exam_provider import grounded_question, independently_solved_question, standalone_candidate

                # An attached solution always governs. Never retry a rejected official answer as an unkeyed paper.
                solver = grounded_question if part.solution.text else independently_solved_question
                if part.solution.text or standalone_candidate(problem, part):
                    model_candidates += 1
                    try:
                        result = solver(live_provider, problem, part)
                        reviewed_by_model = result is not None
                    except MaterialError:
                        live_provider = None
                        material.warn("模型未完成试题复核，本次保留已核验的题目。")
            if result is None:
                skipped += 1
                continue
            match = exercise_key(result.en.prompt, result.en.options[result.correct_index])
            if match in seen:
                continue
            seen.add(match)
            evidence = [*problem.setup.lines, *part.ask.lines]
            if not evidence:
                continue
            source = evidence[0][1]
            sources = list(
                dict.fromkeys(
                    b.source_id
                    for _, b in ([*evidence, *part.solution.lines] if reviewed_by_model else evidence)
                )
            )
            pages = sorted({b.page for _, b in evidence if b.page})
            anchor = f"Q{problem.number}" + (f"({part.letter})" if part.letter else "")
            place = (
                "p. " + ("–".join(str(n) for n in (pages[0], pages[-1])) if len(pages) > 1 else str(pages[0]))
                if pages
                else source.label
            )
            # Material IDs remain content-derived and valid after a file is renamed.
            id_source = result.en.prompt + "|" + anchor
            digest = hashlib.sha256(id_source.encode()).hexdigest()[:16]
            if digest in assigned_ids:
                # Sections can restart numbering with a generic stem and different choices.
                digest = hashlib.sha256((id_source + "|" + result.en.options[result.correct_index]).encode()).hexdigest()[:16]
            assigned_ids.add(digest)
            model_solved = reviewed_by_model and not part.solution.text
            attribution = "模型独立求解与复核 (model-checked)" if model_solved else "改编练习 (adapted exercise)"
            items.append(
                KnowledgeItem(
                    knowledge_id="kp_" + digest,
                    term=result.en.term,
                    definition=result.en.definition,
                    evidence=normalize(" ".join(row for row, _ in evidence))[:2000],
                    page=source.page,
                    source_ref=f"{filename} / {attribution} / {place} / {anchor}",
                    source_ids=sources[:100],
                    source_type="text",
                    knowledge_type="model_checked_exam_problem" if model_solved else "adapted_exam_problem",
                    exam_question=result,
                )
            )
            if len(items) == MAX_MATERIAL_POINTS:
                break
        if len(items) == MAX_MATERIAL_POINTS:
            material.warn(f"本次试卷已收录 {MAX_MATERIAL_POINTS} 道题，其余内容可分章上传。")
            break
    if not items:
        raise MaterialError(
            "已识别出试卷。本次未找到能在当前模式下核验答案的完整试题。请上传含题干和解答的版本，或选取带完整条件的题页。"
        )
    if skipped:
        material.warn(
            f"已识别试卷，收录 {len(items)} 道可核验的题目。另有 {skipped} 个题项需要更清晰的条件、解答或图示。"
        )
    return MaterialResult(knowledge=items, warnings=material.warnings[:12], needs_review_count=skipped)
