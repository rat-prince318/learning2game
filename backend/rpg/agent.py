"""Tools for the RPG author. Every invocation is scoped to one backend stage."""

import json

from pydantic import ValidationError

from ..provider import trace_tool
from ..question_language import localized_items
from . import authoring, offline, prompts, reviewer
from .models import GameRecommendation, RPGGenerationResult, RPGIssue, RPGValidationReport
from .validation import DraftError, RPGContentError, check_game, eligible, groups, reference_pool, select, source_pack


class RPGAgent:
    def __init__(self, client=None):
        # A fresh instance and client per operation; no attempt, exam or model
        # context is shared between students or between the author and reviewer.
        self.client = client
        self.calls = 0

    async def _ask(self, name, payload, schema):
        instruction = prompts.TASKS[name]
        if name == "repair_rpg_config":
            instruction += "\n" + prompts.TASKS["generate_rpg_config"]
        descriptor = {"type": "function", "function": {
            "name": name, "description": f"Submit the {name} result for the current RPG stage.",
            "parameters": schema.model_json_schema()}}
        messages = [{"role": "system", "content": prompts.SYSTEM + "\n" + instruction},
                    {"role": "user", "content": json.dumps({"untrusted_data": payload}, ensure_ascii=False)}]
        for attempt in range(2):
            if self.calls >= 12:
                raise RPGContentError("本阶段工具调用已达上限，请重新启动本步。")
            self.calls += 1
            msg = await self.client.choose(messages, [descriptor])
            if not msg.tool_calls and attempt == 0:
                # A natural-language response never authorizes an action.
                messages.append({"role": "user", "content": f"Submit exactly one {name} function call now."})
                continue
            if len(msg.tool_calls) != 1 or msg.tool_calls[0].name != name:
                raise RPGContentError("模型未调用本阶段指定的工具，请重试本步。")
            return schema.model_validate_json(msg.tool_calls[0].arguments)
        raise AssertionError("unreachable")

    async def recommend(self, knowledge, preferences):
        pool = eligible(knowledge)
        supported = ["matching", "rpg_quest"]
        selected = getattr(preferences, "selected_knowledge_ids", None)
        count = getattr(preferences, "challenge_count", 6)
        if selected is not None:
            if set(selected) - {k.knowledge_id for k in pool}:
                raise RPGContentError("所选知识点超出本轮可用范围，请刷新方案并重新选择。")
            if len(selected) > count:
                raise RPGContentError("请将题量调至至少与选中知识点数相同，或缩小选中范围。")
            pool = [k for k in pool if k.knowledge_id in selected]
        meaningful = min(len(pool), count) >= 3
        warnings = [] if meaningful else ["普通 RPG 需要至少三个有明确出处的知识点，并选择至少三道题。"]
        if self.client:
            with trace_tool("recommend_game_type"):
                draft = await self._ask("recommend_game_type", {
                    "references": source_pack(pool[:16]), "preferences": preferences.model_dump(),
                    "supported_types": supported, "rpg_eligible": meaningful,
                }, prompts.RecommendationDraft if meaningful else prompts.MatchingOnlyDraft)
                return GameRecommendation(**draft.model_dump(), supported_types=supported, warnings=warnings, mode="live")
        with trace_tool("rule_recommend_game_type"):
            scenarios = [k for k in pool if k.example or k.source_type in {"image", "diagram", "mixed", "visual"}
                         or k.knowledge_type in {"component_function", "cause_effect", "process"}]
            prefer_rpg = meaningful and (bool(scenarios) or preferences.goal == "distinguish")
            item = (scenarios or pool)[0] if pool else None
            if prefer_rpg:
                reason = f"可以从「{item.term[:40]}」设计情境任务，让玩家根据讲义线索给 NPC 提供判断。"
            elif item:
                reason = f"讲义给出了「{item.term[:40]}」等条目的定义，配对便于逐一回忆术语与说明。"
            else:
                reason = "请先补充带有定义与出处的概念，再从术语配对开始练习。"
            return GameRecommendation(recommended_type="rpg_quest" if prefer_rpg else "matching",
                                      rationale=reason, supported_types=supported,
                                      warnings=["本地规则推荐。", *warnings], mode="offline")

    async def plan(self, knowledge, preferences, previous_report):
        selected, warnings = select(knowledge, preferences, previous_report)
        selected = await localized_items(selected, preferences.question_language, self.client)
        if self.client:
            with trace_tool("design_rpg_plan"):
                sections = groups(selected, preferences.scene_count)
                schema = authoring.plan_schema(len(sections))
                payload = {"preferences": preferences.model_dump(), "adaptations": warnings,
                           "scene_slots": {f"scene_{i}": source_pack(s) for i, s in enumerate(sections, 1)},
                           "review": previous_report is not None}
                for attempt in range(2):
                    try:
                        draft = await self._ask("design_rpg_plan", payload, schema)
                        break
                    except ValidationError:
                        if attempt == 1:
                            raise RPGContentError("方案工具返回的场景字段需要核对，请重新拟定方案。") from None
                        payload["required_format"] = "Use exactly arc, lens and each named scene_N field."
                return offline.assemble_plan(preferences, selected,
                    authoring.make_plan(preferences, selected, draft), warnings)
        with trace_tool("rule_design_rpg_plan"):
            return offline.assemble_plan(preferences, selected, offline.local_plan(preferences, selected),
                                         ["本地规则生成。", *warnings])

    async def generate(self, knowledge, plan, previous):
        pool = reference_pool(eligible(knowledge), plan)
        pool = await localized_items(pool, plan.question_language, self.client)
        if set(plan.knowledge_ids) - {k.knowledge_id for k in pool}:
            raise RPGContentError("请重新确认资料范围，当前方案含有缺少依据的知识点。")
        if len(pool) < 3:
            raise RPGContentError("单选挑战需要可区分的选项，请补充至少三个概念及对应证据。")
        if not self.client:
            with trace_tool("rule_generate_rpg_config"):
                draft = offline.local_game(pool, plan, previous)
                game = offline.assemble_game(draft, plan, pool, previous)
            with trace_tool("check_rpg_config"):
                validation = check_game(game, plan, pool)
            return RPGGenerationResult(status="completed" if validation.valid else "failed",
                                       config=game if validation.valid else None, validation=validation)

        context = authoring.context(pool, plan, previous)
        schema = authoring.recipe_schema(pool, plan)
        draft = None
        findings = []
        for repairs in range(3):
            tool = "generate_rpg_config" if repairs == 0 else "repair_rpg_config"
            game = None
            try:
                with trace_tool(tool):
                    payload = context if repairs == 0 else {
                        **context, "previous_draft": draft.model_dump() if draft else None, "findings": findings}
                    draft = await self._ask(tool, payload, schema)
                with trace_tool("check_rpg_config"):
                    game = authoring.make_game(draft, pool, plan, previous)
                    checks = check_game(game, plan, pool)
            except ValidationError as exc:
                # Return positions/types, never raw prompt/credentials in the job log.
                findings = [{"locations": [list(err["loc"]) for err in exc.errors(include_input=False)[:8]],
                             "instruction": "Correct invalid fields, use distinct choices and plain affirmative text."}]
                checks = RPGValidationReport(valid=False, issues=[RPGIssue(
                    code="invalid_structure", message="关卡字段或文字未通过格式检查。")])
            except DraftError as exc:
                checks = RPGValidationReport(valid=False, issues=[RPGIssue(code="invalid_scope", message=str(exc))])
                findings = [i.model_dump() for i in checks.issues]
            else:
                findings = [i.model_dump() for i in checks.issues]
                if checks.valid:
                    with trace_tool("validate_rpg_config"):
                        player_view, review_schema, private_key = reviewer.prepare(game, plan, pool)
                        for attempt in range(2):
                            try:
                                verdict = await self._ask("validate_rpg_config", player_view, review_schema)
                                break
                            except ValidationError:
                                if attempt == 1:
                                    raise RPGContentError("内容审核工具返回的作答字段需要核对，请重试生成。") from None
                                player_view["required_format"] = "For each decision_N return choice and issue."
                        checks, findings = reviewer.grade(verdict, private_key)
            checks.repair_attempts = repairs
            if checks.valid:
                return RPGGenerationResult(status="completed", config=game, validation=checks)
        return RPGGenerationResult(status="failed", config=None, validation=checks)

    async def feedback(self, report, knowledge):
        language = getattr(report, "question_language", None)
        by_id = {k.knowledge_id: k for k in knowledge}
        rows = {c.knowledge_id: c for c in report.concepts}
        targets = report.weak_knowledge_ids or list(rows)
        if not targets or any(k not in by_id or k not in rows for k in targets):
            raise RPGContentError("本轮报告与资料范围有出入，请重新打开报告。")
        if self.client:
            with trace_tool("write_rpg_feedback"):
                schema = prompts.feedback_schema([by_id[k] for k in targets])
                # The model handles short named slots. Only the backend maps
                # them to stored knowledge IDs, irrespective of response order.
                payload = {"question_language": language, "finish_reason": report.finish_reason, "targets": {
                    f"target_{i}": {"term": by_id[k].term, "evidence": by_id[k].evidence,
                                     "source_type": by_id[k].source_type, "attempts": rows[k].attempts,
                                     "mistakes": rows[k].mistakes, "hints": rows[k].hints,
                                     "remediated": rows[k].remediated, "resolved": rows[k].resolved}
                    for i, k in enumerate(targets, 1)}}
                for attempt in range(2):
                    try:
                        draft = await self._ask("write_rpg_feedback", payload, schema)
                        break
                    except ValidationError:
                        if attempt == 1:
                            raise RPGContentError("建议工具返回的字段需要核对，请重新生成建议。") from None
                        payload["required_format"] = "One enum value per target_N field at the top level."
                steps = [prompts.StudyStep(knowledge_id=k, strategy=getattr(draft, f"target_{i}"))
                         for i, k in enumerate(targets, 1)]

        else:
            with trace_tool("rule_write_rpg_feedback"):
                steps = [prompts.StudyStep(knowledge_id=k, strategy=(
                    "trace" if by_id[k].source_type in {"image", "diagram", "mixed", "visual"} else
                    "compare" if rows[k].mistakes else "recall" if k in report.weak_knowledge_ids else "apply"
                )) for k in targets]
        methods = {"trace": "沿原图指出涉及的标签、连接或方向，再用一句话说出关系。",
                   "compare": "选一个容易混淆的条目，写下区分它们的关键词，再对照来源核查。",
                   "recall": "先遮住讲义复述含义，再打开原文找回遗漏的线索。",
                   "apply": "给同伴写一道使用这个概念的小题，用原文核对答案。"}
        english = language == "en"
        if english:
            methods = {"trace": "Trace the connections or directions in the source figure.",
                       "compare": "Contrast the conditions of two similar cases, then check the source.",
                       "recall": "Close the handout, reconstruct the result and check the missing steps.",
                       "apply": "Write a new example and verify your reasoning against the source."}
        heading = ("Review this round" if report.weak_knowledge_ids else "Further practice") if english else (
                   "本轮复习建议" if report.weak_knowledge_ids else "下一轮拓展练习")
        lines = [heading]
        for step in steps:
            item = by_id[step.knowledge_id]
            term = getattr(rows[step.knowledge_id], "term", item.term)
            method = methods[step.strategy]
            if item.exam_question:
                wording = getattr(item.exam_question, language or "en")
                method = wording.hint
            lines.append(f"{term} ({item.source_ref}) — {method}" if english else f"{term}（{item.source_ref}）：{method}")
        return "\n".join(lines)
