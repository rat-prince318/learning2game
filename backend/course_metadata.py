"""Administrative labels commonly printed on lecture and examination covers."""
import re
import unicodedata

_COVER = re.compile(
    r"(?:[A-Z]{2,6}[- ]?\d{3,5}[A-Z]?|(?:lecture|lesson|week|chapter|slide|unit|session)\s*#?\s*\d+(?:\s*[:：-].*)?"
    r"|第[零一二三四五六七八九十百\d]+[课讲章周节]|(?:course|module)\s*(?:code|title|name|number|outline|objectives?)"
    r"|learning\s+(?:outcomes?|objectives?|goals?)|(?:agenda|syllabus|prerequisites?|instructor|lecturer|office hours|"
    r"grading policy|lecture title|course overview|table of contents|goal|goals)|"
    r"课程(?:编号|代码|名称|大纲|安排|目标)|学习目标|授课教师|授课时间|考生须知|考试时间|目录|本讲内容)", re.I)


def is_course_metadata(term: str) -> bool:
    label = unicodedata.normalize("NFKC", term).strip().strip(" #*:：。.")
    return _COVER.fullmatch(label) is not None
