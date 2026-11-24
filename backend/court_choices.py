"""Offline question choices for imported exams, saved games and classroom glossaries."""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Mapping
from decimal import Decimal
from fractions import Fraction

from .question_language import accepts


class CourtChoicesUnavailable(ValueError):
    """The available evidence does not distinguish enough answers for this ball."""


def _get(record, field, default=None):
    return record.get(field, default) if isinstance(record, Mapping) else getattr(record, field, default)


def _key(value):
    return " ".join(unicodedata.normalize("NFKC", value).strip().casefold().split()).strip(".。")


# Members of each family answer the same sort of question. Put aliases in one entry
# so that e.g. "powerhouse"/different common names cannot become competing answers.
_FAMILIES = (
    (
        "细胞核|Nucleus",
        "线粒体|Mitochondrion|mitochondria",
        "细胞膜|Cell membrane|plasma membrane",
        "核糖体|Ribosome",
        "叶绿体|Chloroplast",
        "细胞壁|Cell wall",
        "液泡|Vacuole",
        "细胞质|Cytoplasm",
    ),
    (
        "温度计|Thermometer",
        "天平|Balance|weighing balance",
        "秒表|Stopwatch",
        "流量计|Flow meter|flowmeter",
        "压力计|Pressure gauge|pressure meter",
        "湿度计|Hygrometer",
        "电流表|Ammeter",
        "电压表|Voltmeter",
        "游标卡尺|Vernier caliper",
        "量筒|Graduated cylinder",
    ),
    (
        "心脏|Heart",
        "肺|Lungs|lung",
        "胃|Stomach",
        "肾脏|Kidneys|kidney",
        "肝脏|Liver",
        "胰腺|Pancreas",
        "小肠|Small intestine",
        "红细胞|Red blood cells|erythrocytes",
    ),
    (
        "监督学习|Supervised learning",
        "无监督学习|Unsupervised learning",
        "强化学习|Reinforcement learning",
        "半监督学习|Semi-supervised learning",
    ),
    ("分类|Classification", "回归|Regression", "聚类|Clustering", "降维|Dimensionality reduction"),
    (
        "过拟合|Overfitting",
        "欠拟合|Underfitting",
        "泛化|Generalization|generalisation",
        "数据泄漏|Data leakage",
    ),
    (
        "动量|Momentum|linear momentum",
        "动能|Kinetic energy",
        "加速度|Acceleration",
        "力|Force",
        "冲量|Impulse",
        "功率|Power",
        "平均速度|Average velocity",
    ),
    (
        "数据库索引|Database index|索引|index",
        "事务|Transaction",
        "游标|Cursor",
        "视图|Database view",
        "触发器|Trigger",
    ),
    (
        "栈|Stack|堆栈",
        "队列|Queue|FIFO queue",
        "双端队列|Deque|double-ended queue",
        "优先队列|Priority queue",
    ),
    ("路由器|Router", "交换机|Switch|network switch", "集线器|Hub", "调制解调器|Modem"),
    (
        "处理器|CPU|中央处理器|processor",
        "内存|RAM|随机存取存储器",
        "固态硬盘|SSD|solid-state drive",
        "显卡|Graphics card|GPU",
    ),
    ("操作系统|Operating system", "编译器|Compiler", "链接器|Linker", "调试器|Debugger"),
    ("递归|Recursion", "迭代|Iteration", "动态分派|Dynamic dispatch", "管道|Pipelining"),
    (
        "经线|Meridian|longitude line",
        "纬线|Parallel of latitude|latitude line",
        "等高线|Contour line",
        "等压线|Isobar",
    ),
    ("海拔|Elevation|altitude", "相对高度|Relative height", "坡度|Slope gradient", "等高距|Contour interval"),
    ("海陆风|Land and sea breeze", "季风|Monsoon", "山谷风|Mountain and valley breeze", "信风|Trade wind"),
    ("板块边界|Plate boundary", "克拉通|Craton", "岩脉|Dike", "岩基|Batholith"),
    (
        "流水侵蚀|Fluvial erosion",
        "风力侵蚀|Wind erosion",
        "冰川侵蚀|Glacial erosion",
        "海浪侵蚀|Wave erosion",
    ),
    (
        "温室效应|Greenhouse effect",
        "热岛效应|Urban heat island effect",
        "臭氧消耗|Ozone depletion",
        "辐射逆温|Radiation inversion",
    ),
    ("蒸发|Evaporation", "凝结|Condensation|凝结液化", "凝固|Freezing", "升华|Sublimation", "熔化|Melting"),
    ("出纸托盘|Output tray", "进纸托盘|Input tray", "定影器|Fuser", "搓纸轮|Pickup roller"),
    ("取件码|Release PIN|打印取件码", "打印队列|Print queue", "作业编号|Job ID", "打印配额|Print quota"),
    ("均值|Mean|average|算术平均数", "中位数|Median", "众数|Mode", "极差|Range"),
    ("平方|Square", "平方根|Square root|root", "倒数|Reciprocal", "绝对值|Absolute value"),
    ("顶点|Vertex|vertices", "棱|Edge|边", "面|Face", "对角线|Diagonal"),
)

_LABELS = tuple(tuple(entry.split("|") for entry in family) for family in _FAMILIES)
_INDEX = {_key(name): (family, entry) for family in _LABELS for entry in family for name in entry}
_SCALAR = re.compile(r"(?<![a-zA-Z0-9_.])[-+−]?(?:\d{1,13}(?:\.\d{1,8})?|\.\d{1,8})(?![\d.])")
# Accept only standalone quantities: neither exponents in a formula nor years in a sentence are values to perturb.
_PREFIX = re.compile(
    r"^(?:(?:(?:增加|减少|向[东西南北]|每(?:小时|分钟|秒)|约|等于|大小为|为)\s*){0,3}|(?:increases by|decreases by|approximately|about|east|west|north|south))$",
    re.I,
)
_UNIT = re.compile(
    r"^(?:(?:kg|mg|g|km|cm|mm|m|ms|s|min|h|kJ|J|N|Pa|kPa|MPa|W|kW|A|mA|V|Ω|Hz|kHz|mol|L|mL|rad|°C|K|%|°|"
    r"千克|克|千米|米|厘米|秒|小时|分钟|焦耳|牛顿|瓦特|帕斯卡|安培|伏特|弧度|度|次|个|倍|元)"
    r"(?:\^?[-+]?\d{1,2})?|[ /*⋅每])*$"
)
_DIRECTION = re.compile(r"(?:向[东西南北]|\b(?:east|west|north|south)(?:ward)?s?)$", re.I)


def _scalar(text):
    for match in _SCALAR.finditer(text):

        def plain(s):
            s = re.sub(r"\\(?:mathrm|text|operatorname)\s*\{([^{}]*)\}", r"\1", s)
            return re.sub(
                r"[\${}()\[\]]|\\(?:[,;! ]|%|[()[\]])", lambda m: "%" if m[0] == r"\%" else "", s
            ).strip()

        prefix = plain(text[: match.start()])
        if not _PREFIX.fullmatch(prefix):
            continue
        suffix = plain(text[match.end() :])
        suffix = _DIRECTION.sub("", suffix).strip()
        if not _UNIT.fullmatch(suffix) or suffix.startswith(("/", "^")):
            continue
        return match, Decimal(match[0].replace("−", "-"))
    return None


def _calculation_errors(prompt, answer):
    """Recover common operation mistakes when the givens reproduce the stored answer."""
    numbers = [Decimal(match[0].replace("−", "-")) for match in _SCALAR.finditer(prompt)]
    if len(numbers) != 2 or min(numbers) <= 0:
        return []
    for first, second in (numbers, numbers[::-1]):
        if re.search(r"动量|momentum", prompt, re.I) and first * second == answer:
            return [first + second, second, first]
        if re.search(r"动能|kinetic energy", prompt, re.I) and first * second**2 / 2 == answer:
            return [first * second, first * second**2, first * second / 2]
        if re.search(r"速度|速率|velocity|speed", prompt, re.I) and first / second == answer:
            return [first * second, first - second, first]
    return []


def _numeric_alternatives(prompt, correct):
    # Perturbing one solution is unsafe for predicates such as "which number is prime?"
    # or bounds with multiple valid values. Only exact-value questions take this path.
    if re.search(
        r"可能|举例|任举|举出|符合条件|可取|至少|至多|满足|大于|小于|质数|素数|倍数|"
        r"\b(?:could|might|possible|example|prime|divisible|multiple of|satisf(?:y|ies)|at least|at most|larger than|less than)\b",
        prompt,
        re.I,
    ):
        return []
    if not re.search(
        r"多少|多大|几[个米秒年次]|求|计算|数值|结果|等于|大小为|"
        r"\b(?:calculate|compute|evaluate|determine|find|how (?:many|much|fast|far|long)|what (?:is|was|year)|in which year)\b",
        prompt,
        re.I,
    ):
        return []
    scalar = _scalar(correct)
    if scalar is None:
        return []
    match, number = scalar
    integer = number == number.to_integral_value() and "." not in match[0]
    unit = Decimal(1).scaleb(number.as_tuple().exponent)
    size = abs(number)
    delta = max(unit, size / 4)
    if integer:
        delta = max(Decimal(1), delta.to_integral_value())
    values = [
        *_calculation_errors(prompt, size),
        size - delta,
        size + delta,
        size * 2,
        size + 2 * delta,
        size + 3 * delta,
        size / 2,
    ]
    if re.search(r"哪一年|哪年|what year|in which year", prompt, re.I) and integer:
        values = [size - 1, size + 1, size + 2]
    elif number == 0:
        values = [unit, 2 * unit, 3 * unit]
    if re.search(r"概率|probability", prompt, re.I) and "%" not in correct and 0 <= number <= 1:
        values = [Decimal("0.25"), Decimal("0.50"), Decimal("0.75"), Decimal(0), Decimal(1)]
    result = []
    for value in values:
        if value < 0 or value == size or ("%" in correct and 0 <= size <= 100 and value > 100):
            continue
        if number < 0:
            value = -value
        shown = format(value.normalize(), "f")
        if match[0].startswith("+") and not shown.startswith("-"):
            shown = "+" + shown
        option = correct[: match.start()] + shown + correct[match.end() :]
        if option not in result:
            result.append(option)
    if (
        result
        and re.search(r"速度|velocity", prompt, re.I)
        and not re.search(r"大小|速率|magnitude|speed", prompt, re.I)
    ):
        for first, second in (("向东", "向西"), ("向南", "向北"), ("east", "west"), ("north", "south")):
            for old, new in ((first, second), (second, first)):
                if old in correct:
                    return [correct.replace(old, new), result[0], result[0].replace(old, new), *result[1:]]
    return result


def _answer_key(text):
    scalar = _scalar(text)
    if scalar:
        match, value = scalar
        raw = text[: match.start()] + "#" + text[match.end() :]
        wrapper = re.sub(r"\\(?:mathrm|text)|[\${}\s]|\\(?:[,;! ]|[()[\]])", "", raw)
        wrapper = wrapper.replace(r"\%", "%")
        parts = re.fullmatch(r"(.*?)#(.*?)(向[东西南北]|east|west|north|south)?", wrapper, re.I)
        if parts and parts[2] in _SCALES:
            base, factor = _SCALES[parts[2]]
            return "number", Fraction(value) * factor, (parts[1].lower(), base, (parts[3] or "").lower())
        return "number", value, wrapper
    if re.search(r"[$\\^_]", text):
        return "math", re.sub(r"\s+", "", text).strip("$")
    name = _key(text)
    if name in _INDEX:
        name = _INDEX[name][1][0]
    return "text", name


_SCALES = {
    "": ("1", 1),
    "%": ("1", Fraction(1, 100)),
    "m": ("m", 1),
    "km": ("m", 1000),
    "cm": ("m", Fraction(1, 100)),
    "mm": ("m", Fraction(1, 1000)),
    "kg": ("kg", 1),
    "g": ("kg", Fraction(1, 1000)),
    "mg": ("kg", Fraction(1, 1000000)),
    "s": ("s", 1),
    "min": ("s", 60),
    "h": ("s", 3600),
    "ms": ("s", Fraction(1, 1000)),
    "m/s": ("m/s", 1),
    "km/h": ("m/s", Fraction(5, 18)),
    "J": ("J", 1),
    "kJ": ("J", 1000),
    "W": ("W", 1),
    "kW": ("W", 1000),
    "Pa": ("Pa", 1),
    "kPa": ("Pa", 1000),
    "MPa": ("Pa", 1000000),
    "A": ("A", 1),
    "mA": ("A", Fraction(1, 1000)),
    "L": ("L", 1),
    "mL": ("L", Fraction(1, 1000)),
}


def _distinct(correct, candidates):
    keys = {_answer_key(correct)}
    result = []
    for option in candidates:
        if not isinstance(option, str) or not option.strip():
            continue
        key = _answer_key(option)
        if key not in keys:
            keys.add(key)
            result.append(option)
        if len(result) == 3:
            break
    return result


def _math_card(term, description, en):
    # Build four general expressions rather than distractors with mismatched physical dimensions.
    k = _key(term)
    if k in {"mean", "average", "均值", "算术平均数"} and re.search(
        r"平均|average|mean|\\sum", description, re.I
    ):
        prompt = (
            "For any non-empty list of n real numbers, which expression gives its arithmetic mean?"
            if en
            else "给定任意一组 n 个实数（n 大于零），哪个式子给出它们的算术平均数？"
        )
        return (
            prompt,
            r"$\frac{1}{n}\sum_{i=1}^{n}x_i$",
            [r"$\sum_{i=1}^{n}x_i$", r"$\frac{1}{n}\sum_{i=1}^{n}x_i^2$", r"$\max_i x_i-\min_i x_i$"],
        )
    if k in {
        "square",
        "平方",
        "root",
        "square root",
        "平方根",
        "reciprocal",
        "倒数",
        "absolute value",
        "绝对值",
    }:
        index = (
            0
            if k in {"square", "平方"}
            else 1
            if k in {"root", "square root", "平方根"}
            else 2
            if k in {"reciprocal", "倒数"}
            else 3
        )
        signatures = (
            r"squar(?:e|es|ing)|平方|\^2",
            r"\\sqrt|square root|平方根",
            r"reciprocal|倒数|1/x",
            r"absolute value|绝对值|\\lvert",
        )
        if not re.search(signatures[index], description, re.I):
            return None
        names = (
            ("平方", "square"),
            ("正平方根", "positive square root"),
            ("倒数", "reciprocal"),
            ("绝对值", "absolute value"),
        )
        name = names[index][en]
        question = (
            f"For any positive real input $x$, which expression gives its {name}?"
            if en
            else f"对任意正实数 $x$，哪个式子给出它的{name}？"
        )
        formulas = [r"$x^2$", r"$\sqrt{x}$", r"$\frac{1}{x}$", r"$|x|$"]
        answer = formulas.pop(index)
        return question, answer, formulas
    return None


def _contains_term(text, term):
    return (
        term.casefold() in text.casefold()
        if re.search(r"[\u3400-\u9fff]", term)
        else bool(re.search(r"(?<!\w)" + re.escape(term) + r"(?!\w)", text, re.I))
    )


def _term_prompt(description, en):
    text = description.strip().rstrip("。.")
    if text.endswith(("?", "？")):
        return text
    return f"What does this describe? {text}." if en else f"哪一项符合这条描述？{text}。"


_GENERIC = set(
    "about above after also been being can each first from given into more most other same some that their them then these they this those through under using used uses when where which while with within without process system information operation structure object function working method".split()
)
_GENERIC_ZH = set(
    "一个 一种 用于 用来 进行 表示 描述 对应 处理 通过 不同 可以 需要 根据 通常 用在 得到 定义 包含 其中 主要".split()
)


def _features(text):
    words = {v for v in re.findall(r"[a-z]{4,}", text.lower()) if v not in _GENERIC}
    for run in re.findall(r"[\u3400-\u9fff]{2,}", text):
        words.update(run[i : i + 2] for i in range(len(run) - 1) if run[i : i + 2] not in _GENERIC_ZH)
    return words


def _nearby_terms(term, definition, peers, lang):
    """Use a shared technical anchor; membership in one upload alone gives no evidence of a domain."""
    original = _features(term + " " + definition)
    siblings = []
    for item in peers:
        name, detail = _get(item, "term", ""), _get(item, "definition", "")
        if (
            not name
            or len(name) > 65
            or not detail
            or len(detail) > 230
            or not all(accepts(v, lang) for v in (name, detail))
        ):
            continue
        if (
            _contains_term(name, term)
            or _contains_term(term, name)
            or _contains_term(definition, name)
            or _contains_term(detail, term)
        ):
            continue
        own, other = _features(definition), _features(detail)
        if not own or not other or len(own & other) / len(own | other) > 0.67:
            continue
        shared = original & _features(name + " " + detail)
        if shared and _key(detail) != _key(definition) and all(_key(p[1]) != _key(name) for p in siblings):
            siblings.append((len(shared), name, detail))
    return sorted(siblings, key=lambda x: -x[0])


_AMBIGUOUS_NAMES = (
    (
        ("root", "square", "square root", "absolute value", "reciprocal"),
        r"number|function|input|squar|math|power|reciprocal|absolute value|\\sqrt|\^[2-9]|数|函数|平方",
    ),
    (
        ("edge", "face", "vertex", "面", "边"),
        r"vertex|vertic|edge|solid|polyhed|flat surface|polygon|segment|角|棱|顶点|立体|多边形",
    ),
    (("balance",), r"mass|weigh|gravimet|质量|称量"),
    (
        ("index", "cursor", "transaction", "trigger"),
        r"database|table|quer|record|transactions?|sql|commit|rollback|数据库|列|查询|事务",
    ),
    (
        ("mean", "average", "median", "range", "mode"),
        r"average|middle|frequen|maximum|sum|dataset|statistic|sample|value|data|平均|均值|中位|频数",
    ),
    (
        ("queue", "stack", "堆栈", "栈", "队列"),
        r"last|first|rear|push|pop|fifo|lifo|最近|先进|后进|插入|删除|出栈|入队",
    ),
)


def _prepare(pair, knowledge, language, peers):
    left, right = _get(pair, "left", ""), _get(pair, "right", "")
    lang = language or ("zh" if re.search(r"[\u3400-\u9fff]", left + right) else "en")
    en = lang == "en"

    authored = _get(pair, "distractors")
    if authored:
        alternatives = _distinct(right, authored)
        if len(alternatives) >= 2 and all(accepts(v, lang) for v in (left, right, *alternatives)):
            return left, right, alternatives
        raise CourtChoicesUnavailable("球场选项有重复，或与本题语言不同。")

    exam = _get(knowledge, "exam_question")
    if exam:
        from .basketball_questions import option_issue, text_problem

        wording = _get(exam, lang)
        options, index = _get(wording, "options", []), _get(exam, "correct_index")
        if isinstance(index, int) and 0 <= index < len(options):
            answer, prompt = options[index], _get(wording, "prompt", "")
            # Keep the original language and correct-index binding. An old worksheet can
            # supply usable wrong values alongside an incompatible unit or explanatory prose.
            supplied = [v for i, v in enumerate(options) if i != index]
            candidates = []
            for v in (*supplied, *_numeric_alternatives(prompt, answer)):
                if len(v) > 200 or text_problem(v) or not accepts(v, lang):
                    continue
                if not option_issue([answer, *candidates, v], prompt):
                    candidates = _distinct(answer, [*candidates, v])
                if len(candidates) == 3:
                    break
            if len(candidates) >= 2 and len(answer) <= 200 and not text_problem(answer):
                return prompt, answer, candidates
        raise CourtChoicesUnavailable("试题需要至少两个独立的错误选项。")

    if all(accepts(v, lang) for v in (left, right)):
        wrong = _distinct(right, _numeric_alternatives(left, right))
        if len(wrong) >= 2:
            return left, right, wrong

    term = _get(pair, "study_term") or _get(knowledge, "term", "") or left
    if not accepts(term, lang):
        term = left if len(left) < 70 and accepts(left, lang) else right
    definition = _get(knowledge, "definition", "")
    old_glossary = _key(left) == _key(term)
    if old_glossary:
        description = right
    elif _key(right) == _key(term):
        description = left
    else:
        description = definition
    if not description or not accepts(description, lang):
        raise CourtChoicesUnavailable("需要同一语言的题干、术语和定义。")
    math = _math_card(term, description, en)
    if math:
        return math
    canonical = _key(term)
    if canonical in {"stack", "栈", "堆栈", "queue", "队列"}:
        stack = canonical in {"stack", "栈", "堆栈"}
        proof = (
            r"lifo|last.in|most recent|后进先出|最近.{0,12}先|栈顶"
            if stack
            else r"fifo|first.in|arrival order|先进先出|队首.{0,12}队尾"
        )
        if re.search(proof, description + " " + definition, re.I):
            if stack:
                q = (
                    "Push 2, 7, 4 onto an empty stack in that order. Pop once and push 9. What are the next three pops in order?"
                    if en
                    else "把 2、7、4 依次压入空栈。弹出一次，再压入 9，接下来三次出栈依次得到什么？"
                )
                return q, "[9, 7, 2]", ["[7, 4, 9]", "[9, 4, 7]", "[2, 7, 9]"]
            q = (
                "Enqueue 2, 7, 4 in that order in an empty queue. Remove one item and enqueue 9. What are the next three removals in order?"
                if en
                else "把 2、7、4 依次放入空队列。出队一次，再让 9 入队，接下来三个数按什么顺序出队？"
            )
            return q, "[7, 4, 9]", ["[9, 7, 2]", "[2, 4, 9]", "[9, 4, 7]"]
    record = _INDEX.get(_key(term))
    for names, signature in _AMBIGUOUS_NAMES:
        if canonical in names and not re.search(signature, description + " " + definition, re.I):
            record = None
            break
    if record:
        family, entry = record
        actual = [p for p in peers if _INDEX.get(_key(_get(p, "term", "")), (None,))[0] is family]
        labels = [_get(p, "term", "") for p in actual] + [other[en] for other in family]
        candidates = [
            name
            for name in labels
            if _INDEX.get(_key(name), (None, None))[1] is not entry
            and accepts(name, lang)
            and not _contains_term(description, name)
        ]
        # Distinct aliases cannot occupy two backboards in the same question.
        deduped = {}
        for name in candidates:
            deduped.setdefault(tuple(_INDEX[_key(name)][1]), name)
        if len(deduped) >= 2:
            if (
                _contains_term(description, term)
                and definition
                and accepts(definition, lang)
                and not _contains_term(definition, term)
            ):
                description = definition
            if _contains_term(description, term):
                raise CourtChoicesUnavailable("术语已写在定义里，请提供可独立作答的例子。")
            return _term_prompt(description, en), term, list(deduped.values())[:3]
    if not _contains_term(description, term) and 2 <= len(term) <= 65 and len(description) <= 230:
        neighbors = _nearby_terms(term, description, peers, lang)
        if len(neighbors) >= 2:
            return _term_prompt(description, en), term, [name for _, name, _ in neighbors[:3]]
    raise CourtChoicesUnavailable(
        "这组资料缺少同类选项。请补充相近概念、带选项的练习题，或使用云端模型出题。"
    )


def prepare_choices(pair, knowledge=None, language=None, peers=()):
    """Return (ball text, answer, 2–3 wrong hoops). Peers are items from this material only."""
    from .basketball_questions import text_problem

    prompt, correct, wrong = _prepare(pair, knowledge, language, peers)
    values = [correct, *wrong]
    if any(
        not value.strip() or text_problem(value) or not accepts(value, language)
        for value in [prompt, *values]
    ):
        raise CourtChoicesUnavailable("需要内容完整、语言一致、无需看图的题干和选项。")
    if all(re.fullmatch(r"[A-E][.)]?", v.strip(), re.I) for v in values) and not re.search(
        r"\b[A-E]\b", prompt
    ):
        raise CourtChoicesUnavailable("请提供每个选项的具体内容。")
    return prompt, correct, wrong
