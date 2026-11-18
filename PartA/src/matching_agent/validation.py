"""Deterministic gates. Semantic correctness remains a separate evidence audit."""
from __future__ import annotations

import re
import unicodedata
from collections import Counter, defaultdict

from pydantic import ValidationError

from .errors import AgentError
from .models import (
    GameConfigInternal, KnowledgeBundle, MatchingPlan, UserPreferences,
    ValidationIssue, ValidationReport, digest,
)


def normalized(text: str) -> str:
    return re.sub(r"[\W_]+", "", unicodedata.normalize("NFKC", text).casefold())


def prepare_candidates(bundle: KnowledgeBundle, prefs: UserPreferences) -> dict:
    knowledge = {k.knowledge_id: k for k in bundle.knowledge}
    sources = {s.source_id: s for s in bundle.sources}
    requested = set(prefs.selected_knowledge_ids or []) | set(prefs.excluded_knowledge_ids) | set(prefs.weak_knowledge_ids)
    if requested - knowledge.keys():
        raise AgentError("unknown_knowledge", "参数引用了不存在的知识点。")
    allowed = set(knowledge) if prefs.selected_knowledge_ids is None else set(prefs.selected_knowledge_ids)
    allowed -= set(prefs.excluded_knowledge_ids)
    eligible = []
    omitted = []
    for kid in sorted(allowed):
        item = knowledge[kid]
        if (item.quality != "reliable" or not item.evidence.strip()
                or not item.source_refs or any(ref not in sources for ref in item.source_refs)):
            omitted.append(kid)
            continue
        if len(item.concept) > 160:
            omitted.append(kid)
            continue
        eligible.append(item)
    # Exact duplicate concepts/definitions cannot become two different answers.
    seen_concepts, seen_definitions = set(), set()
    unique = []
    # Keep the requested weak item first when duplicate records describe the same fact.
    for item in sorted(eligible, key=lambda k: (k.knowledge_id not in prefs.weak_knowledge_ids, k.knowledge_id)):
        concept, definition = normalized(item.concept), normalized(item.definition)
        if concept in seen_concepts or definition in seen_definitions:
            omitted.append(item.knowledge_id)
            continue
        seen_concepts.add(concept)
        seen_definitions.add(definition)
        unique.append(item)
    groups = defaultdict(list)
    for item in unique:
        groups[item.relation_type].append(item)
    minimum = min(4, prefs.pair_count)
    usable = {relation: items for relation, items in groups.items() if len(items) >= minimum}
    if not usable:
        raise AgentError("insufficient_knowledge", f"同类知识数量不足 {minimum}，请补充资料或调整题量。",
                         details={"eligible_count": len(unique), "excluded_count": len(omitted)})
    weak_set = set(prefs.weak_knowledge_ids)
    relation = sorted(usable, key=lambda r: (
        -sum(k.knowledge_id in weak_set for k in usable[r]), -len(usable[r]), r))[0]
    pool = usable[relation]
    target = min(prefs.pair_count, len(pool))
    pool_ids = {k.knowledge_id for k in pool}
    required_weak = [kid for kid in prefs.weak_knowledge_ids if kid in pool_ids][:target]
    warnings = list(bundle.warnings)
    if omitted:
        warnings.append(f"已排除 {len(omitted)} 条缺乏可靠证据、重复或无法显示的知识。")
    if target < prefs.pair_count:
        warnings.append(f"本轮资料支持 {target} 对，已从请求的 {prefs.pair_count} 对减少；请确认。")
    skipped_weak = weak_set - set(required_weak)
    if skipped_weak:
        warnings.append("部分薄弱知识不在本轮可靠范围或同一关系内，未纳入本轮：" + ", ".join(sorted(skipped_weak)))
    if bundle.language == "mixed":
        text = " ".join(k.concept + k.definition for k in pool)
        chinese = len(re.findall(r"[\u4e00-\u9fff]", text))
        english = len(re.findall(r"[A-Za-z]+", text))
        language = "zh" if chinese >= english else "en"
    else:
        language = bundle.language
    return {"eligible": pool, "relation_type": relation, "target_count": target,
            "required_weak_ids": required_weak, "output_language": language,
            "warnings": warnings}


def check_plan(plan: MatchingPlan, bundle: KnowledgeBundle):
    if plan.material_id != bundle.material_id or plan.knowledge_digest != digest(bundle):
        raise AgentError("stale_plan", "资料已变化，请重新生成并确认方案。")
    context = prepare_candidates(bundle, plan.preferences)
    chosen = set(plan.selected_knowledge_ids)
    if (not chosen <= {k.knowledge_id for k in context["eligible"]}
            or len(chosen) != context["target_count"]
            or plan.relation_type != context["relation_type"]
            or not set(context["required_weak_ids"]) <= chosen
            or plan.language != context["output_language"]
            or plan.difficulty != (plan.preferences.difficulty or
                                   ("easy" if plan.preferences.level == "beginner" else "medium"))):
        raise AgentError("invalid_plan", "方案未遵循已选范围、题量、难度、语言或薄弱点优先规则。")


def issue(code: str, reason: str, suggestion: str, pair=None, knowledge_id=None):
    return ValidationIssue(code=code, reason=reason, suggestion=suggestion,
                           pair_id=pair if isinstance(pair, str) else None,
                           knowledge_id=knowledge_id if isinstance(knowledge_id, str) else None)


def deterministic_validate(raw: dict, plan: MatchingPlan,
                           bundle: KnowledgeBundle) -> ValidationReport:
    issues = []
    pairs = raw.get("pairs", [])
    if not isinstance(pairs, list):
        pairs = []
    try:
        game = GameConfigInternal.model_validate(raw)
    except ValidationError as exc:
        for err in exc.errors(include_input=False, include_url=False):
            loc = err["loc"]
            pair = pairs[loc[1]] if len(loc) > 1 and loc[0] == "pairs" and isinstance(loc[1], int) and loc[1] < len(pairs) else None
            pair = pair if isinstance(pair, dict) else {}
            issues.append(issue("structure", "字段未满足约定：" + ".".join(map(str, loc)),
                                "补齐字段并遵守卡片长度和数据类型约束。",
                                pair.get("pair_id"), pair.get("knowledge_id")))
        game = None
    usable_pairs = [p for p in pairs if isinstance(p, dict)]
    expected = set(plan.selected_knowledge_ids)
    ids = [p.get("knowledge_id") for p in usable_pairs if isinstance(p.get("knowledge_id"), str)]
    if len(pairs) != plan.actual_pair_count or Counter(ids) != Counter(expected):
        issues.append(issue("knowledge_set", "配对数量或知识集合与已确认方案不一致。",
                            "恢复已确认的全部知识点，每条出现一次，不改变范围。"))
    pair_ids = [p.get("pair_id") for p in usable_pairs]
    if len(set(str(p) for p in pair_ids)) != len(pair_ids):
        issues.append(issue("duplicate_id", "配对 ID 重复。", "每对使用 pair_ 加知识点 ID。"))
    knowledge = {k.knowledge_id: k for k in bundle.knowledge}
    sources = {s.source_id: s for s in bundle.sources}
    for pair in usable_pairs:
        pid, kid = pair.get("pair_id"), pair.get("knowledge_id")
        pid = pid if isinstance(pid, str) else None
        if not isinstance(kid, str) or kid not in expected:
            issues.append(issue("unknown_knowledge", "配置使用了未确认知识。", "恢复确认范围。", pid if isinstance(pid, str) else None))
            continue
        item = knowledge[kid]
        if pid != "pair_" + kid:
            issues.append(issue("pair_id", "配对 ID 不符合稳定 ID 约定。", "使用 pair_ 加知识点 ID。", pid if isinstance(pid, str) else None, kid))
        if pair.get("left") != item.concept:
            issues.append(issue("concept_changed", "左侧概念与来源不一致。", "保留原知识概念名称。", pid, kid))
        refs = pair.get("source_refs")
        if (not isinstance(refs, list) or not refs or any(not isinstance(r, str) or r not in item.source_refs or r not in sources for r in refs)):
            issues.append(issue("invalid_source", "来源不存在或不支持该知识点。", "使用该知识点的有效来源 ID。", pid, kid))
        left, right = pair.get("left"), pair.get("right")
        if isinstance(left, str) and isinstance(right, str) and normalized(left) and normalized(left) in normalized(right):
            issues.append(issue("answer_leakage", "右侧重复左侧概念，直接泄露答案。", "描述含义或功能，不重复概念名称。", pid, kid))
    for field in ("left", "right"):
        duplicates = defaultdict(list)
        for pair in usable_pairs:
            value = pair.get(field)
            if isinstance(value, str) and normalized(value):
                duplicates[normalized(value)].append(pair)
        for group in duplicates.values():
            if len(group) > 1:
                for pair in group:
                    issues.append(issue("duplicate_card", f"{field} 卡片内容重复。", "恢复来源支持且可区分的文字。", pair.get("pair_id"), pair.get("knowledge_id")))
    if game and (game.plan_id != plan.plan_id or game.material_id != plan.material_id
                 or game.relation_type != plan.relation_type or game.language != plan.language):
        issues.append(issue("plan_metadata", "配置元数据与确认方案不一致。", "恢复确认方案元数据。"))
    return ValidationReport(passed=not issues, issues=issues)


def repair_slots(raw: dict, report: ValidationReport, plan: MatchingPlan) -> tuple[dict, list[str], bool]:
    """Map invalid/missing slots to confirmed IDs; preserve valid rows exactly."""
    import copy
    result = copy.deepcopy(raw)
    pairs = raw.get("pairs", [])
    pairs = pairs if isinstance(pairs, list) else []
    by_kid = defaultdict(list)
    for pair in pairs:
        if isinstance(pair, dict) and isinstance(pair.get("knowledge_id"), str):
            by_kid[pair["knowledge_id"]].append(pair)
    bad_ids = {i.knowledge_id for i in report.issues if i.knowledge_id}
    bad_pairs = {i.pair_id for i in report.issues if i.pair_id}
    global_semantic = any(i.code in {"ambiguous", "unsupported", "contradiction", "image_mismatch"}
                          and not i.pair_id and not i.knowledge_id for i in report.issues)
    output, targets = [], []
    for kid in plan.selected_knowledge_ids:
        pid = "pair_" + kid
        candidates = by_kid[kid]
        pair = copy.deepcopy(candidates[0]) if len(candidates) == 1 else {"knowledge_id": kid}
        faulty = (len(candidates) != 1 or pair.get("pair_id") != pid
                  or kid in bad_ids or pid in bad_pairs or global_semantic)
        pair["pair_id"] = pid
        pair["knowledge_id"] = kid
        output.append(pair)
        if faulty:
            targets.append(pid)
    header_allowed = any(i.code == "structure" and i.pair_id is None and i.knowledge_id is None
                         for i in report.issues)
    result["pairs"] = output
    return result, targets, header_allowed
