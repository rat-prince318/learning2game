"""Convert common native Word/PowerPoint equation objects before plain-text extraction."""

from __future__ import annotations

M = "{http://schemas.openxmlformats.org/officeDocument/2006/math}"
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
_ESCAPES = str.maketrans({
    "\\": r"\backslash ", "{": r"\{", "}": r"\}", "$": r"\$", "%": r"\%",
    "&": r"\&", "#": r"\#", "_": r"\_", "^": r"\hat{}", "~": r"\sim ",
    "\u00b7": r"\cdot ", "⁡": "", "⁢": r"\,", "−": "-",
})


class UnsupportedOfficeEquation(ValueError):
    """The containing passage must be reviewed in its original document."""


def _tex(node) -> str:
    if node is None:
        return ""
    kind = node.tag.split("}")[-1]

    def child(name):
        return _tex(node.find(M + name))

    def option(name, default):
        prop = node.find(f"{M}{kind}Pr/{M}{name}")
        return prop.get(M + "val", default) if prop is not None else default

    if kind == "t":
        return (node.text or "").translate(_ESCAPES)
    if kind.endswith("Pr") or kind in {"ctrlPr", "proofErr", "bookmarkStart", "bookmarkEnd"}:
        return ""
    if kind in {"oMath", "r", "e", "num", "den", "deg", "sub", "sup", "lim", "fName", "box"}:
        return "".join(_tex(k) for k in node)
    if kind == "f":
        if option("type", "bar") == "noBar":
            return r"{\genfrac{}{}{0pt}{}{" + child("num") + "}{" + child("den") + "}}"
        return r"\frac{" + child("num") + "}{" + child("den") + "}"
    if kind in {"sSub", "sSup", "sSubSup", "sPre"}:
        subs, sups = child("sub"), child("sup")
        indices = ("_{" + subs + "}" if subs else "") + ("^{" + sups + "}" if sups else "")
        base = "{" + child("e") + "}"
        return "{}" + indices + base if kind == "sPre" else base + indices
    if kind == "rad":
        degree = child("deg") if option("degHide", "0") not in {"1", "on", "true"} else ""
        return r"\sqrt" + ("[" + degree + "]" if degree else "") + "{" + child("e") + "}"
    if kind == "m":
        rows = [" & ".join(_tex(e) for e in r.findall(M + "e")) for r in node.findall(M + "mr")]
        return r"\begin{matrix}" + r" \\ ".join(rows) + r"\end{matrix}"
    if kind == "d":
        fences = {"{": r"\{", "}": r"\}", "": ".", "‖": r"\Vert ", "〈": r"\langle ", "〉": r"\rangle "}
        def fence(k, default):
            char = option(k, default)
            if char not in fences and char not in {"(", ")", "[", "]", "|", "⌊", "⌋", "⌈", "⌉"}:
                raise UnsupportedOfficeEquation(k)
            return fences.get(char, char)
        sep = option("sepChr", "|").translate(_ESCAPES)
        contents = sep.join(_tex(e) for e in node.findall(M + "e"))
        return r"\left" + fence("begChr", "(") + contents + r"\right" + fence("endChr", ")")
    if kind == "nary":
        op = option("chr", "∫")
        ops = {"∑": r"\sum", "∏": r"\prod", "∫": r"\int", "∬": r"\iint", "∭": r"\iiint",
               "∮": r"\oint", "⋃": r"\bigcup", "⋂": r"\bigcap"}
        if op not in ops:
            raise UnsupportedOfficeEquation(kind)
        result = ops[op]
        for key, mark in (("sub", "_"), ("sup", "^")):
            if child(key) and option(key + "Hide", "0") not in {"1", "on", "true"}:
                result += mark + "{" + child(key) + "}"
        return result + " " + child("e")
    if kind in {"limLow", "limUpp"}:
        return r"\mathop{" + child("e") + r"}\limits" + ("_" if kind == "limLow" else "^") + "{" + child("lim") + "}"
    if kind == "bar":
        return (r"\underline" if option("pos", "top") == "bot" else r"\overline") + "{" + child("e") + "}"
    if kind == "func":
        return r"\operatorname{" + child("fName") + "} " + child("e")
    if kind == "acc":
        accents = {"̂": r"\hat", "̅": r"\bar", "̃": r"\tilde", "⃗": r"\vec", "̇": r"\dot", "̈": r"\ddot"}
        mark = option("chr", "̂")
        if mark in accents:
            return accents[mark] + "{" + child("e") + "}"
    raise UnsupportedOfficeEquation(kind)


def paragraph_text(paragraph, warn) -> str:
    """Use the native reader for regular paragraphs, preserving its established behavior."""
    root = paragraph._p
    has_math = root.find(".//" + M + "oMath") is not None
    has_scripts = root.find(".//" + W + "vertAlign") is not None or root.find(".//" + A + "rPr[@baseline]") is not None
    if not (has_math or has_scripts):
        return paragraph.text

    def walk(node):
        if node.tag == M + "oMath":
            return r"\(" + _tex(node) + r"\)"
        kind = node.tag.split("}")[-1]
        if kind == "t":
            return node.text or ""
        if kind in {"br", "cr", "tab"}:
            return "\t" if kind == "tab" else "\n"
        if kind in {"Fallback", "del", "instrText"} or kind.endswith("Pr"):
            return ""
        text = "".join(walk(k) for k in node)
        if kind == "r":
            vert = node.find(W + "rPr/" + W + "vertAlign")
            baseline = node.find(A + "rPr[@baseline]")
            effect = vert.get(W + "val") if vert is not None else None
            if baseline is not None:
                offset = baseline.get("baseline", "0").removesuffix("%")
                try:
                    height = float(offset)
                except ValueError:
                    height = 0
                effect = "superscript" if height > 0 else "subscript" if height < 0 else None
            marker = {"superscript": "sup", "subscript": "sub"}.get(effect)
            if marker:
                return f"<{marker}>{text}</{marker}>"
        return text

    try:
        return walk(root)
    except UnsupportedOfficeEquation:
        warn("一段原生公式含特殊排版，已跳过该段。可把公式写为 LaTeX 后重新上传。")
        return ""
