"""Check legible answer-key results against a locally derived practice answer.

A multi-step derivation can contain intermediate values. Compare the final
measurement (or an explicitly identified final formula), never its first number.
"""

import math
import re


def _math_text(text):
    text = text.strip().removeprefix(r"\(").removesuffix(r"\)")
    text = re.sub(r"\\mathrm\{([^{}]*)\}", r"\1", text)
    text = re.sub(r"\\frac\{([^{}]+)\}\{([^{}]+)\}", r"(\1)/(\2)", text)
    for source, dest in (
        (r"\,", " "),
        (r"\cdot", "*"),
        (r"\times", "*"),
        ("−", "-"),
        ("²", "^2"),
        ("·", "*"),
        ("×", "*"),
        (r"\left", ""),
        (r"\right", ""),
    ):
        text = text.replace(source, dest)
    return text.strip()


def _signature(text):
    # Used only for matching compact explicit keys. Preserve signs and case:
    # M and m frequently denote different masses in a mechanics problem.
    text = _math_text(text).replace("{", "(").replace("}", ")").replace(" ", "")
    # Strip only redundant parentheses around a single product. Preserve sums.
    text = re.sub(r"\(([0-9A-Za-z_^\\.*]+)\)", r"\1", text)
    return text.rstrip(".").removeprefix("+")


def conflicts_with_solution(question, solution):
    if not solution:
        return False
    options = [_math_text(s) for s in question.en.options]
    correct = options[question.correct_index]
    number = r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?"
    measurement = re.fullmatch(rf"({number})\s+(.+)", correct)
    source = _math_text(solution)
    if (
        "taking right to be positive" in question.en.prompt.casefold()
        and re.search(
            r"(?:direction is |accelerat(?:es|ion is) )?(?:to the left|leftward)[.\s]*$", source, re.I
        )
        and not correct.startswith("-")
    ):
        return True
    if measurement:
        unit = measurement[2]
        for word, symbol in (
            ("radians", "rad"),
            ("radian", "rad"),
            ("joules", "J"),
            ("joule", "J"),
            ("newtons", "N"),
            ("newton", "N"),
        ):
            source = re.sub(rf"\b{word}\b", symbol, source, flags=re.I)
        unit_pattern = re.escape(unit).replace(r"\ ", r"\s*")
        given = re.findall(rf"(?<![\w.])({number})\s*{unit_pattern}(?![\w/^])", source)
        if given:
            return not math.isclose(float(given[-1]), float(measurement[1]), rel_tol=0.003, abs_tol=1e-9)
        bare = re.fullmatch(rf"(?:\w+\s*=\s*)?({number})[.\s]*", source)
        return bool(bare and not math.isclose(float(bare[1]), float(measurement[1]), rel_tol=0.003))
    # Some clean keys consist solely of a formula, or explicitly delimit a
    # final result at the end of the derivation. If such a key cannot be
    # reconciled (including algebraically unfamiliar notation), request review.
    key = re.split(r"(?:final answer|final result|correct answer|最终答案)\s*[:：]\s*", source, flags=re.I)[
        -1
    ]
    explicit = key != source or len(source) < 90
    key = re.sub(r"^(?:[^\s=]{1,12}\s*=\s*)", "", key.strip())
    key = re.sub(r"[,;]?\s+(?:to the )?(right|left)(?:ward)?\.?$", "", key, flags=re.I)
    if explicit and re.fullmatch(r"[A-Za-z0-9\s_\\^{}()+*/.\-]+", key):
        # Ordinary sentences and fraction stacks in PDFs are not explicit keys.
        if re.search(r"\b[A-Za-z]{4,}\b", key) or not re.search(r"[/^*\\()]|\d[A-Za-z]", key):
            return False
        return _signature(key) != _signature(correct)
    return False
