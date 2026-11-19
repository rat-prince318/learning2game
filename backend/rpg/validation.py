"""Content gates shared by the local generator, live tools and publication."""

import re
import unicodedata
from collections import Counter
from math import ceil

from matching_agent.wording import has_unwanted_wording

from ..models import KnowledgeItem
from .models import RPGGameInternal, RPGIssue, RPGPlan, RPGPreferences, RPGValidationReport


class RPGContentError(ValueError):
    """Only static, learner-safe messages from this module may reach job polling."""


class DraftError(RPGContentError):
    """A draft can be regenerated within the same confirmed scope."""


def key(text: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", text).casefold().split()).strip("。.!！ ")


def _deictic_subject(item):
    # Re-opened older uploads can contain "This is an authored handout" as
    # a glossary entry. Explicit glossary terms such as JavaScript's "this:"
    # are still valid.
    term = key(item.term)
    return (term in {"this", "that", "it", "these", "those", "they", "we", "i", "he", "she", "you"}
            and re.match(rf"^\s*{re.escape(term)}\s+(?:is|are|was|were|am)\b", item.evidence or "", re.I))


def eligible(knowledge: list[KnowledgeItem]) -> list[KnowledgeItem]:
    # B owns source verification and deduplication. Recheck the stored roster
    # because older/custom factories can return missing or conflicting evidence.
    terms = Counter(key(k.term) for k in knowledge)
    definitions = Counter(key(k.definition) for k in knowledge)
    ids = Counter(k.knowledge_id for k in knowledge)
    return [k for k in knowledge if k.evidence and key(k.evidence)
            and key(k.source_ref) not in {"unknown", "n/a", "未知", "无"}
            and key(k.definition) != key(k.term) and not _deictic_subject(k)
            and ids[k.knowledge_id] == terms[key(k.term)] == definitions[key(k.definition)] == 1
            and not any(has_unwanted_wording(s) for s in (k.term, k.definition, k.source_ref))
            and not any(re.search(r"<\s*/?\s*[a-zA-Z]|(?:javascript|data):|https?://", s, re.I)
                        for s in (k.term, k.definition, k.source_ref))]


def select(knowledge, preferences: RPGPreferences, previous_report=None):
    pool = eligible(knowledge)
    allowed = {k.knowledge_id for k in pool}
    if previous_report is not None:
        allowed.intersection_update(previous_report.weak_knowledge_ids)
    requested = preferences.selected_knowledge_ids
    if requested is not None:
        if set(requested) - allowed:
            raise RPGContentError("所选知识点超出本轮可用范围，请刷新方案并重新选择。")
        if len(requested) > preferences.challenge_count:
            raise RPGContentError("请将题量调至至少与选中知识点数相同，或缩小选中范围。")
        by_id = {k.knowledge_id: k for k in pool}
        selected = [by_id[kid] for kid in requested]
    else:
        selected = [k for k in pool if k.knowledge_id in allowed][:preferences.challenge_count]
    minimum = 1 if previous_report is not None else 3
    if len(selected) < minimum:
        raise RPGContentError("普通冒险需要三个有出处的知识点。请扩展范围、补充资料，或尝试配对练习。"
                              if minimum == 3 else "本轮复习范围缺少带证据的知识点，请重新选择资料。")
    warnings = []
    if len(selected) < preferences.challenge_count:
        warnings.append(f"本轮按可用范围生成 {len(selected)} 道挑战。")
    if preferences.scene_count > len(selected):
        warnings.append(f"场景数已随题量调整为 {len(selected)}。")
    if not any(k.example or (k.source_type in {"image", "mixed", "diagram", "visual"}) for k in selected):
        warnings.append("资料主要提供定义，本轮以辨认和比较资料中的描述为主。")
    if len(pool) < len(knowledge):
        warnings.append("部分条目缺少清楚、可区分的来源，本轮已采用其余条目。")
    return selected, warnings


def groups(selected, scene_count):
    """Keep source order and place at least one challenge in every scene."""
    remaining = list(selected)
    result = []
    for n in range(min(len(remaining), scene_count), 0, -1):
        size = ceil(len(remaining) / n)
        result.append(remaining[:size])
        remaining = remaining[size:]
    return result


def source_pack(items):
    return [k.model_dump(exclude_none=True) for k in items]


def reference_pool(pool, plan):
    # Keep prompts within a practical context even when a lecture has hundreds
    # of concepts. Include every confirmed item before adding nearby distractors.
    target = set(plan.knowledge_ids)
    return ([k for k in pool if k.knowledge_id in target]
            + [k for k in pool if k.knowledge_id not in target][:16])


_COMBINATION = re.compile(r"(?:all|none|both) (?:of )?(?:the )?(?:above|other|following)|"
                          r"以上(?:各项|选项|答案)?(?:均|全|都)|(?:两项|两者)均", re.I)


_ZH_SUBJECT = re.compile(r"^([\u4e00-\u9fffA-Za-z]{2,18}?)(?:在|的|主要|具有什么|有什么|起什么|用于)")
_BARE_RECALL = re.compile(
    r"^(?:[\w -]{1,40}(?:的)?(?:主要|基本|核心)?(?:功能|作用|用途|含义|定义)(?:是|为)?(?:什么|哪项)|"
    r"[^，。！？；：,:;!?]{1,40}(?:有什么作用|起什么作用|主要过滤什么|用于什么)|"
    r"(?:what(?:'s| is| does)|define|name the) (?:the (?:main |primary )?(?:function|role|purpose) of )?"
    r"[a-z][a-z -]{1,40}\??$)", re.I)


def _visible_pairs(scene, plan):
    # Keep phrases separate: clues listed in different tasks need not be associated.
    return [plan.title, plan.rationale, *plan.learning_objectives, scene.name, scene.description,
            scene.quest.title, scene.quest.objective, scene.quest.reward.item.name, *scene.npc.dialogue]


def _gives_mapping(paragraph, prompt, item, answer, alternatives):
    """Catch literal mappings, including Chinese predicate synonyms that retain a distinctive noun."""
    passage = key(paragraph)
    subjects = [key(item.term)]
    match = _ZH_SUBJECT.match(prompt)
    if match:
        subjects.append(key(match[1]))
    if not any(s in passage and s != key(answer) for s in subjects):
        return False
    response = key(answer)
    if response in passage and len(response) >= 2:
        return True
    # A shared distinctive noun (e.g. 气味 in 减少气味 / 减轻水中的气味)
    # counts only in a clause that also names the tested device.
    chunks = re.findall(r"[\u4e00-\u9fff]+", response)
    endings = {s[-2:] for s in chunks if len(s) >= 3}
    return any(word not in {"功能", "作用", "系统", "部分", "能力", "问题", "效果", "物质"}
               and word in passage and not any(word in subj for subj in subjects)
               and not any(word in text for text in alternatives) for word in endings)


def check_game(game: RPGGameInternal, plan: RPGPlan, knowledge) -> RPGValidationReport:
    issues = []

    def issue(code, message, challenge=None):
        issues.append(RPGIssue(code=code, message=message, challenge_id=challenge))

    by_id = {k.knowledge_id: k for k in eligible(knowledge)}
    if (game.title, game.theme) != (plan.title, plan.theme) or len(game.scenes) != plan.scene_count:
        issue("plan_mismatch", "关卡标题、主题或场景数与确认方案有出入。")
    term_keys = {key(k.term) for k in by_id.values()}
    definition_keys = {key(k.definition) for k in by_id.values()}
    for scene, outline in zip(game.scenes, plan.scene_outlines):
        if (scene.name != outline.name or scene.quest.objective != outline.objective
                or [q.knowledge_id for q in scene.challenges] != outline.knowledge_ids):
            issue("scene_scope", "场景任务或知识范围与已确认的大纲有出入。")
        for q in scene.challenges:
            item = by_id.get(q.knowledge_id)
            if item is None or (q.evidence, q.source_ref) != (item.evidence, item.source_ref):
                issue("source_mismatch", "请核对题目与资料证据的关联。", q.challenge_id)
            if any(_COMBINATION.search(o.text) for o in q.options):
                issue("combined_choice", "请使用各自独立的选项。", q.challenge_id)
            answer = next(o.text for o in q.options if o.id == q.correct_option_id)
            options = {key(o.text) for o in q.options}
            if item is not None:
                # The rule generator uses verbatim descriptions or terms. When
                # an entire option set belongs to one such roster, detect a
                # swapped answer even without a second model reading the draft.
                asks_for_term = options <= term_keys and key(item.definition) in key(q.prompt)
                asks_for_definition = options <= definition_keys and f"「{item.term}」" in q.prompt
                if ((asks_for_term and key(answer) != key(item.term))
                        or (asks_for_definition and key(answer) != key(item.definition))):
                    issue("answer_contradicts_source", "请按讲义中的术语和描述修正答案。", q.challenge_id)
            if item:
                other_options = [key(o.text) for o in q.options if o.id != q.correct_option_id]
                before_answer = _visible_pairs(scene, plan) + [
                    other.prompt for other_scene in game.scenes for other in other_scene.challenges
                    if other.challenge_id != q.challenge_id]
                if any(_gives_mapping(text, q.prompt, item, answer, other_options) for text in before_answer):
                    issue("public_answer_mapping", "开场文字或其他题干给出了本题的对应关系，请保留待判断的线索。",
                          q.challenge_id)
                if (plan.difficulty == "hard" and (item.example or item.source_type in {"image", "mixed", "visual", "diagram"})
                        and _BARE_RECALL.search(q.prompt.strip("？?。. "))):
                    issue("difficulty_mismatch", "请将功能回忆改写为依据资料作出决定的情境。", q.challenge_id)
            if ((len(key(answer)) >= 2 and key(answer) in key(q.hint))
                    or key(q.hint) == key(answer)):
                issue("hint_reveals_answer", "请将提示改为解题方向，保留选项判断过程。", q.challenge_id)
    return RPGValidationReport(valid=not issues, issues=issues)
