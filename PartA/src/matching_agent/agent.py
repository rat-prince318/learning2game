from __future__ import annotations

import copy
import json
import re
from typing import Callable, Protocol

from pydantic import ValidationError

from . import prompts
from .errors import AgentError
from .llm import ModelClient
from .models import (
    ConfirmedPlan, FeedbackDraft, GameConfigInternal, GameDraft, GenerationResult,
    KnowledgeBundle, LearningFeedback, LearningStatistics, MatchingPlan, PlanDraft,
    PracticeRequest, RepairDraft, SemanticDraft, UserPreferences, ValidationReport,
    digest, new_id,
)
from .tools import EmptyArgs, ImageArgs, MaterialArgs, PlanArgs, RunContext, SessionArgs, ToolSpec
from .validation import check_plan, deterministic_validate, issue, prepare_candidates, repair_slots


class MaterialTools(Protocol):
    """B implements these. Storage authorization belongs to D, not the model."""
    async def read_material(self, material_id: str) -> dict: ...
    async def analyze_image(self, material_id: str, image_id: str) -> dict: ...
    async def extract_knowledge(self, material_id: str, material: dict,
                                image_analyses: dict[str, dict]) -> KnowledgeBundle: ...


class MatchingAgent:
    def __init__(self, client: ModelClient, *, on_event: Callable | None = None,
                 trace_tool: Callable | None = None):
        self.client = client
        self.on_event = on_event
        self.trace_tool = trace_tool

    async def _run(self, context: RunContext, tools: Callable, finished: Callable,
                   result: Callable, brief: dict):
        messages = [
            {"role": "system", "content": prompts.ORCHESTRATE},
            {"role": "user", "content": json.dumps(
                {"stage": context.stage, "context": brief}, ensure_ascii=False)},
        ]
        early_end_corrected = False
        await context.emit("stage_started")
        try:
            while not finished():
                context.reserve_model_call()
                offered = tools()
                message = await self.client.choose(messages, [s.schema() for s in offered.values()])
                messages.append(message.as_message())
                if not message.tool_calls:
                    if early_end_corrected:
                        raise AgentError("missing_tool_call", "模型未完成必需的工具调用。")
                    early_end_corrected = True
                    messages.append({"role": "user", "content":
                                     "The stage has no valid result. Call the available tool; do not claim completion."})
                    continue
                for call in message.tool_calls:
                    value = await context.dispatch(call, tools() if not finished() else {})
                    messages.append({"role": "tool", "tool_call_id": call.id,
                                     "content": json.dumps(value, ensure_ascii=False)})
            output = result()
            state = getattr(output, "status", "completed")
            await context.emit("stage_finished", status=state,
                               model_calls=context.model_calls, tool_calls=context.tool_calls)
            return output
        except AgentError as exc:
            await context.emit("stage_failed", error_code=exc.code,
                               model_calls=context.model_calls, tool_calls=context.tool_calls)
            raise

    async def prepare_plan(self, bundle: KnowledgeBundle,
                           preferences: UserPreferences | None = None) -> MatchingPlan:
        bundle = bundle.model_copy(deep=True)
        prefs = (preferences or UserPreferences()).model_copy(deep=True)
        selection = prepare_candidates(bundle, prefs)
        context = RunContext("planning", self.client, self.on_event, self.trace_tool)
        state = {"plan": None}

        async def design(_):
            payload = {"eligible": [k.model_dump() for k in selection["eligible"]],
                       "sources": [s.model_dump() for s in bundle.sources],
                       "preferences": prefs.model_dump(),
                       **{k: v for k, v in selection.items() if k != "eligible"}}
            raw = await context.structured("design_matching_plan", prompts.PLAN, payload, PlanDraft)
            draft = PlanDraft.model_validate(raw)
            plan = MatchingPlan(**draft.model_dump(), plan_id=new_id("plan"),
                                material_id=bundle.material_id, knowledge_digest=digest(bundle),
                                actual_pair_count=selection["target_count"], preferences=prefs,
                                warnings=selection["warnings"])
            check_plan(plan, bundle)
            state["plan"] = plan
            await context.emit("awaiting_confirmation", pair_count=plan.actual_pair_count)
            return plan

        spec = ToolSpec("design_matching_plan", "Design a sourced personalized plan, then wait for user confirmation.", EmptyArgs, design)
        return await self._run(context, lambda: {spec.name: spec},
                               lambda: state["plan"] is not None, lambda: state["plan"],
                               {"material_id": bundle.material_id, "provenance": bundle.provenance})

    @staticmethod
    def confirm_plan(plan: MatchingPlan, bundle: KnowledgeBundle) -> ConfirmedPlan:
        """Trusted CLI/D call only, after a real user confirmation. Not a tool."""
        check_plan(plan, bundle)
        return ConfirmedPlan(confirmation_id=new_id("confirmation"),
                             plan_digest=digest(plan), plan=plan.model_copy(deep=True))

    async def generate_game(self, bundle: KnowledgeBundle, confirmed: ConfirmedPlan,
                            *, previous_game: GameConfigInternal | None = None,
                            previous_rights: dict[str, str] | None = None) -> GenerationResult:
        if not isinstance(confirmed, ConfirmedPlan) or confirmed.confirmed is not True:
            raise AgentError("confirmation_required", "生成前需要用户明确确认方案。")
        bundle = bundle.model_copy(deep=True)
        confirmed = confirmed.model_copy(deep=True)
        if confirmed.plan_digest != digest(confirmed.plan):
            raise AgentError("confirmation_changed", "确认后的方案已修改，请重新确认。")
        plan = confirmed.plan
        check_plan(plan, bundle)
        if previous_game and previous_game.material_id != bundle.material_id:
            raise AgentError("previous_game_mismatch", "上一轮游戏与当前材料不一致。")
        selected = [k for k in bundle.knowledge if k.knowledge_id in plan.selected_knowledge_ids]
        prior = ({p.knowledge_id: p.right for p in previous_game.pairs} if previous_game
                 else (previous_rights or {}))
        source_ids = {r for k in selected for r in k.source_refs}
        evidence = {"selected_knowledge": [k.model_dump() for k in selected],
                    "sources": [s.model_dump() for s in bundle.sources if s.source_id in source_ids],
                    "confirmed_plan": plan.model_dump(), "output_language": plan.language,
                    "previous_pairs": [{"knowledge_id": k.knowledge_id, "right": prior[k.knowledge_id]}
                                       for k in selected if k.knowledge_id in prior]}
        context = RunContext("generation", self.client, self.on_event, self.trace_tool)
        identity = {"schema_version": "1.0", "game_id": new_id("game"),
                    "plan_id": plan.plan_id, "material_id": bundle.material_id,
                    "language": plan.language, "relation_type": plan.relation_type, "warnings": []}
        state = {"candidate": None, "report": None, "repairs": 0, "result": None}

        def check_args(args):
            if args.plan_id != plan.plan_id:
                raise AgentError("wrong_plan", "工具必须使用当前已确认方案。")

        async def generate(args):
            check_args(args)
            try:
                raw = await context.structured("generate_matching_config", prompts.GENERATE, evidence, GameDraft)
            except AgentError as exc:
                if exc.code != "invalid_json":
                    raise
                raw = {"title": "", "instructions": "", "pairs": []}
            # Host owns identity; model cannot redirect the result to another plan/game.
            state["candidate"] = {**raw, **identity}
            await context.emit("generating", candidate_ready=True)
            return {"candidate": state["candidate"], "next_action": "validate_matching_config"}

        async def validate(args):
            check_args(args)
            candidate = state["candidate"]
            report = deterministic_validate(candidate, plan, bundle)
            await context.emit("validating", deterministic_issues=len(report.issues))
            if report.passed:
                raw = await context.structured("validate_matching_config", prompts.SEMANTIC,
                                               {"selected_knowledge": evidence["selected_knowledge"],
                                                "sources": evidence["sources"], "game": candidate}, SemanticDraft)
                semantic = SemanticDraft.model_validate(raw)
                valid_pairs = {p["pair_id"]: p["knowledge_id"] for p in candidate["pairs"]}
                for finding in semantic.issues:
                    if finding.pair_id is not None and finding.pair_id not in valid_pairs:
                        raise AgentError("invalid_validation_reference", "语义检查引用了不存在的配对。")
                    if finding.knowledge_id is not None and finding.knowledge_id not in plan.selected_knowledge_ids:
                        raise AgentError("invalid_validation_reference", "语义检查引用了不存在的知识。")
                    if finding.pair_id and finding.knowledge_id and valid_pairs[finding.pair_id] != finding.knowledge_id:
                        raise AgentError("invalid_validation_reference", "语义检查的配对与知识引用不一致。")
                report = ValidationReport(passed=not semantic.issues, issues=semantic.issues,
                                          semantic_checked=self.client.mode != "local")
            state["report"] = report
            await context.emit("validation_result", passed=report.passed,
                               semantic_checked=report.semantic_checked,
                               issue_codes=[i.code for i in report.issues])
            if report.passed:
                game = GameConfigInternal.model_validate(candidate)
                if prior:
                    repeated = [p.knowledge_id for p in game.pairs if p.right == prior.get(p.knowledge_id)]
                    if repeated:
                        game.warnings.append("这些知识未获得安全的新表述，保留原文：" + ", ".join(repeated))
                state["result"] = GenerationResult(status="completed", game=game, validation=report,
                                                    repair_count=state["repairs"], warnings=game.warnings)
            elif state["repairs"] >= 2:
                state["result"] = GenerationResult(status="failed", validation=report,
                                                    repair_count=state["repairs"],
                                                    warnings=["已达到修复上限，未交付游戏。调整范围需重新生成并确认方案。"])
            return {"validation": report.model_dump(), "repair_count": state["repairs"],
                    "next_action": "complete" if state["result"] else "repair_matching_config"}

        async def repair(args):
            check_args(args)
            if state["repairs"] >= 2:
                raise AgentError("repair_limit", "最多修复两次。")
            state["repairs"] += 1  # Failed repair output also consumes a repair attempt.
            normalized, targets, allow_header = repair_slots(state["candidate"], state["report"], plan)
            await context.emit("repairing", repair_number=state["repairs"], affected_pair_count=len(targets))
            payload = {**evidence, "candidate": normalized, "issues": state["report"].model_dump(),
                       "repairable_pairs": [p for p in normalized["pairs"] if p["pair_id"] in targets],
                       "allow_header_repair": allow_header}
            try:
                raw = await context.structured("repair_matching_config", prompts.REPAIR, payload, RepairDraft)
                patch = RepairDraft.model_validate(raw)
                replacements = {p.pair_id: p for p in patch.replacements}
                if len(replacements) != len(patch.replacements) or set(replacements) != set(targets):
                    raise AgentError("invalid_repair_scope", "修复必须仅覆盖存在问题的配对。")
                for pair in patch.replacements:
                    if pair.pair_id != "pair_" + pair.knowledge_id:
                        raise AgentError("invalid_repair_scope", "修复不能更换知识点。")
                if not allow_header and (patch.title is not None or patch.instructions is not None):
                    raise AgentError("invalid_repair_scope", "修复不能改动已通过的标题或规则。")
                candidate = copy.deepcopy(normalized)
                candidate["pairs"] = [replacements[p["pair_id"]].model_dump() if p["pair_id"] in replacements else p
                                      for p in normalized["pairs"]]
                if allow_header:
                    for field in ("title", "instructions"):
                        if getattr(patch, field) is not None:
                            candidate[field] = getattr(patch, field)
                candidate["warnings"] = list(candidate.get("warnings", [])) + patch.warnings
                state["candidate"] = candidate
                state["report"] = None  # A patch must be validated before anything else.
            except (AgentError, ValidationError) as exc:
                if isinstance(exc, AgentError) and exc.code in {"model_call_limit", "model_timeout", "model_unavailable", "model_request_rejected"}:
                    raise
                # Preserve original invalid candidate and revalidate; never accept partial patches.
                state["report"] = None
                return {"repair_applied": False, "next_action": "validate_matching_config",
                        "error_code": exc.code if isinstance(exc, AgentError) else "invalid_repair_structure"}
            return {"repair_applied": True, "next_action": "validate_matching_config"}

        def available():
            if state["candidate"] is None:
                spec = ToolSpec("generate_matching_config", "Generate a candidate for the confirmed plan.", PlanArgs, generate)
            elif state["report"] is None:
                spec = ToolSpec("validate_matching_config", "Validate structure, sources and every possible matching ambiguity.", PlanArgs, validate)
            else:
                spec = ToolSpec("repair_matching_config", "Repair only failed pairs, at most twice; revalidate afterwards.", PlanArgs, repair)
            return {spec.name: spec}

        try:
            return await self._run(context, available, lambda: state["result"] is not None,
                                   lambda: state["result"], {"plan_id": plan.plan_id})
        except AgentError as exc:
            if exc.code in {"model_call_limit", "tool_call_limit"} and state["report"] is not None:
                return GenerationResult(status="failed", validation=state["report"],
                    repair_count=state["repairs"], warnings=[exc.message, "未交付游戏；保留最后一次验证结果供检查。"])
            raise

    async def generate_feedback(self, statistics: LearningStatistics, bundle: KnowledgeBundle,
                                game: GameConfigInternal,
                                preferences: UserPreferences | None = None) -> LearningFeedback:
        if game.material_id != bundle.material_id:
            raise AgentError("statistics_mismatch", "请选择本轮游戏对应的资料。")
        return await self.feedback_for_round(statistics, bundle, game_id=game.game_id,
                                             knowledge_ids={p.knowledge_id for p in game.pairs},
                                             language=game.language, preferences=preferences)

    async def feedback_for_round(self, statistics: LearningStatistics, bundle: KnowledgeBundle,
                                 *, game_id: str, knowledge_ids: set[str], language: str,
                                 preferences: UserPreferences | None = None) -> LearningFeedback:
        """Use a verified round roster when the host stores its own game representation."""
        statistics = statistics.model_copy(deep=True)
        bundle = bundle.model_copy(deep=True)
        prefs = (preferences or UserPreferences()).model_copy(deep=True)
        if statistics.status == "active":
            raise AgentError("session_not_finished", "会话结束后才能生成最终反馈。")
        if statistics.game_id != game_id:
            raise AgentError("statistics_mismatch", "统计、游戏和材料标识不一致。")
        game_ids = set(knowledge_ids)
        knowledge = {k.knowledge_id: k for k in bundle.knowledge}
        if (not game_ids <= knowledge.keys()
                or {p.knowledge_id for p in statistics.by_knowledge} != game_ids
                or not set(statistics.weak_knowledge_ids) <= game_ids):
            raise AgentError("statistics_mismatch", "统计必须覆盖本轮全部知识，薄弱点只能来自本轮。")
        prepare_candidates(bundle, prefs)
        weak = statistics.weak_knowledge_ids
        context = RunContext("feedback", self.client, self.on_event, self.trace_tool)
        state = {"feedback": None}

        async def feedback(args):
            if args.session_id != statistics.session_id:
                raise AgentError("wrong_session", "工具必须使用当前结束的会话。")
            # No numeric metrics enter the model prompt; attach the original D object afterwards.
            qualitative = [{"knowledge_id": p.knowledge_id, "first_attempt_correct": p.first_attempt_correct,
                            "had_errors": p.errors > 0, "used_hint": p.hints > 0, "completed": p.completed}
                           for p in statistics.by_knowledge]
            raw = await context.structured("generate_learning_feedback", prompts.FEEDBACK,
                {"status": statistics.status, "qualitative_performance": qualitative,
                 "weak_knowledge_ids": weak, "knowledge": [knowledge[k].model_dump() for k in weak],
                 "sources": [s.model_dump() for s in bundle.sources], "output_language": language}, FeedbackDraft)
            draft = FeedbackDraft.model_validate(raw)
            if len(draft.reviews) != len(weak) or {r.knowledge_id for r in draft.reviews} != set(weak):
                raise AgentError("invalid_feedback", "反馈必须覆盖 D 标记的全部薄弱点。")
            for review in draft.reviews:
                if not set(review.source_refs) <= set(knowledge[review.knowledge_id].source_refs):
                    raise AgentError("invalid_feedback_source", "反馈引用了无效来源。")
                if re.search(r"\d+(?:\.\d+)?\s*(?:%|percent|errors?\b|attempts?\b|mistakes?\b|points?\b|次|分)|百分之",
                             review.explanation, re.IGNORECASE):
                    raise AgentError("numeric_feedback", "复习解释不得引入数值表现评价。")
            # Summary is qualitative; numbers belong exclusively to statistics.
            if re.search(r"\d|%|百分之|[零一二三四五六七八九十百]+(?:次|个|对|成)|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|hundred|percent)\b", draft.summary, re.IGNORECASE):
                raise AgentError("numeric_feedback", "反馈总结不得重新编造数值，请使用定性描述。")
            next_prefs = prefs.model_copy(update={"weak_knowledge_ids": list(weak)}, deep=True)
            completion_note = ("本轮中途退出，仍有未完成内容。" if statistics.status == "exited"
                               else "本轮已完成，可结合下一次练习观察学习进展。") if language == "zh" else (
                               "This session ended early and is incomplete." if statistics.status == "exited"
                               else "This session is complete. Compare your progress in the next round.")
            state["feedback"] = LearningFeedback(**draft.model_dump(), statistics=statistics,
                completion_note=completion_note,
                practice=PracticeRequest(material_id=bundle.material_id, preferences=next_prefs,
                                         previous_game_id=game_id))
            return state["feedback"]

        spec = ToolSpec("generate_learning_feedback", "Explain authoritative completed-session statistics and propose practice.", SessionArgs, feedback)
        return await self._run(context, lambda: {spec.name: spec}, lambda: state["feedback"] is not None,
                               lambda: state["feedback"], {"session_id": statistics.session_id})

    async def prepare_from_material(self, material_id: str, preferences: UserPreferences,
                                     material_tools: MaterialTools) -> tuple[KnowledgeBundle, MatchingPlan]:
        """Optional B adapter: actual image work lives in B, never silently simulated."""
        context = RunContext("material", self.client, self.on_event, self.trace_tool)
        state = {"material": None, "analyses": {}, "bundle": None}

        def same_material(args):
            if args.material_id != material_id:
                raise AgentError("wrong_material", "不能读取当前授权资料以外的材料。")

        async def read(args):
            same_material(args)
            result = await material_tools.read_material(material_id)
            if not isinstance(result, dict) or not isinstance(result.get("images", []), list):
                raise AgentError("invalid_material_result", "B 的材料结果必须包含 images 列表。")
            for img in result.get("images", []):
                if not isinstance(img, dict) or not isinstance(img.get("image_id"), str):
                    raise AgentError("invalid_material_result", "图片必须提供 image_id。")
            if len({i["image_id"] for i in result.get("images", [])}) != len(result.get("images", [])):
                raise AgentError("invalid_material_result", "图片 ID 不得重复。")
            state["material"] = result
            return result

        async def image(args):
            allowed = {i["image_id"] for i in state["material"].get("images", [])}
            if args.image_id not in allowed:
                raise AgentError("unknown_image", "该图片不属于当前材料。")
            result = await material_tools.analyze_image(material_id, args.image_id)
            state["analyses"][args.image_id] = result
            return result

        async def extract(args):
            same_material(args)
            missing = {i["image_id"] for i in state["material"].get("images", []) if i.get("needs_analysis", True)} - state["analyses"].keys()
            if missing:
                raise AgentError("image_analysis_required", "请先分析材料中需要理解的图像。")
            result = await material_tools.extract_knowledge(material_id, state["material"], state["analyses"])
            bundle = KnowledgeBundle.model_validate(result)
            if bundle.material_id != material_id:
                raise AgentError("wrong_material", "提取结果的材料 ID 不一致。")
            state["bundle"] = bundle
            return bundle

        def available():
            if state["material"] is None:
                spec = ToolSpec("read_material", "Read authorized material and its available image IDs.", MaterialArgs, read)
                return {spec.name: spec}
            result = {"extract_knowledge": ToolSpec("extract_knowledge", "Extract after all required images have been analyzed.", MaterialArgs, extract)}
            if state["material"].get("images"):
                result["analyze_image"] = ToolSpec("analyze_image", "Analyze a supplied image ID before knowledge extraction.", ImageArgs, image)
            return result

        bundle = await self._run(context, available, lambda: state["bundle"] is not None,
                                 lambda: state["bundle"], {"material_id": material_id})
        plan = await self.prepare_plan(bundle, preferences)
        return bundle, plan
