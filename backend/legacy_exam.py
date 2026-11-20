"""Detect old glossary captures of exam covers without modifying saved games."""

import re


REUPLOAD_GUIDANCE = (
    "旧版试卷题库收录了考试说明。请重新上传原试卷并创建新游戏，旧存档会保留。 "
    "This older question bank includes exam instructions. Upload the original paper again "
    "and create a new game. Your existing save is preserved."
)

_DURATION = re.compile(r"^(?:time allowed|exam(?:ination)? duration|考试时间|考试时长)$", re.I)
_LENGTH = re.compile(
    r"^(?:\d+(?:[.:]\d+)?|one|two|three|four)\s*(?:hours?|hrs?\.?|minutes?|分钟|小时)\b", re.I
)
_ADMIN = re.compile(r"^(?:(?:closed|open)[ -]book exam(?:ination)?|准考证号|考生须知|允许携带的资料)$", re.I)
_EXAM_NAME = re.compile(
    r"(?:\b(?:exam(?:ination)?|midterm|grading guide(?:line)?|answer key)\b|试卷|期[中末]考试)", re.I
)


def has_legacy_exam_cover(knowledge, filename=""):
    if not knowledge or any(item.exam_question for item in knowledge):
        return False
    duration, rules, exam_source = False, False, False
    for item in knowledge:
        if item.page is not None and item.page > 2:
            continue
        name = item.source_ref.split(" / ", 1)[0]
        exam_source |= bool(_EXAM_NAME.search((filename + " " + name).replace("_", " ")))
        label = item.term.lstrip(" \t•*-").rstrip(":：").strip()
        duration |= bool(_DURATION.fullmatch(label) and _LENGTH.match(item.definition))
        rules |= bool(_ADMIN.fullmatch(label))
    return duration and (rules or exam_source)
