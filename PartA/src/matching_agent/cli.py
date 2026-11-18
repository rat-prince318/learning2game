from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
from uuid import uuid4

from dotenv import load_dotenv
from pydantic import ValidationError

from .agent import MatchingAgent
from .errors import AgentError
from .llm import DeepSeekClient
from .models import (
    GameConfigInternal, KnowledgeBundle, LearningFeedback, LearningStatistics,
    MatchingPlan, UserPreferences,
)
from .offline import OfflineClient

ROOT = Path(__file__).resolve().parents[2]


def read(path: Path, model):
    return model.model_validate_json(path.read_text(encoding="utf-8-sig"))


def write(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    if hasattr(value, "model_dump"):
        value = value.model_dump(mode="json")
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def show_plan(plan: MatchingPlan, bundle: KnowledgeBundle):
    names = {k.knowledge_id: k.concept for k in bundle.knowledge}
    print(f"\n推荐方案：{plan.actual_pair_count} 对 / {plan.difficulty} / {plan.language}")
    print("知识点：" + "、".join(names[k] for k in plan.selected_knowledge_ids))
    print(plan.rationale)
    for warning in plan.warnings:
        print("提示：" + warning)


def confirmation(args) -> str:
    if args.yes:
        if args.mode != "offline":
            raise AgentError("interactive_confirmation_required", "真实模式请在终端明确确认；--yes 仅用于离线测试。")
        return "confirm"
    try:
        return input("输入 CONFIRM 确认，EDIT 修改参数，其他输入取消：").strip().lower()
    except EOFError:
        return "cancel"


def edited_preferences(prefs: UserPreferences) -> UserPreferences:
    try:
        level = input(f"学习水平 beginner/familiar [{prefs.level}]：").strip() or prefs.level
        goal = input(f"练习目标 recognize/distinguish [{prefs.learning_goal}]：").strip() or prefs.learning_goal
        count = input(f"题量 4–8 [{prefs.pair_count}]：").strip()
        selected = input("限定知识点 ID，逗号分隔；留空保留原设置：").strip()
        excluded = input("排除知识点 ID，逗号分隔；留空保留原设置：").strip()
        data = prefs.model_dump()
        data.update(level=level, learning_goal=goal, pair_count=int(count) if count else prefs.pair_count)
        if selected:
            data["selected_knowledge_ids"] = [s.strip() for s in selected.split(",") if s.strip()]
        if excluded:
            data["excluded_knowledge_ids"] = [s.strip() for s in excluded.split(",") if s.strip()]
        return UserPreferences.model_validate(data)
    except (ValueError, EOFError):
        raise AgentError("invalid_preferences", "参数无效，未开始生成；请重新运行。") from None


def demo_statistics(game: GameConfigInternal) -> LearningStatistics:
    """Explicit synthetic D stub for the demo, not production statistics logic."""
    n = len(game.pairs)
    return LearningStatistics.model_validate({
        "session_id": "demo_fixture_" + uuid4().hex, "game_id": game.game_id,
        "status": "completed", "metrics": {"first_attempt_accuracy": (n - 1) / n,
            "total_attempt_accuracy": n / (n + 1), "completion_rate": 1.0,
            "total_attempts": n + 1, "total_errors": 1, "hints_used": 1},
        "by_knowledge": [{"knowledge_id": p.knowledge_id, "first_attempt_correct": i != 0,
                          "attempts": 2 if i == 0 else 1, "errors": 1 if i == 0 else 0,
                          "hints": 1 if i == 1 else 0, "completed": True} for i, p in enumerate(game.pairs)],
        "weak_knowledge_ids": [p.knowledge_id for p in game.pairs[:2]],
    })


async def run(args):
    if args.yes and args.mode != "offline":
        raise AgentError("interactive_confirmation_required", "--yes 只能用于离线测试。")
    if args.inject and args.mode != "offline":
        raise AgentError("offline_only", "故障注入只能用于离线测试。")
    if args.command == "practice" and not args.game:
        raise AgentError("missing_game", "再练习需要 --game 指定上一轮配置。")
    bundle = read(args.knowledge, KnowledgeBundle)
    prefs = read(args.preferences, UserPreferences) if args.preferences else UserPreferences(
        level=args.level, learning_goal=args.goal, pair_count=args.count)
    if args.mode == "live":
        client = DeepSeekClient()
        print("真实模型模式：将知识和证据发送到配置的 DeepSeek API；不会自动使用离线结果。")
    else:
        variant_file = ROOT / "examples" / "offline_variants.json"
        variants = json.loads(variant_file.read_text(encoding="utf-8")) if variant_file.exists() else {}
        client = OfflineClient(variants, inject=args.inject)
        print("离线测试模式：工具调用、语义判定和内容均由测试替身提供，不代表真实 LLM 能力。")
    output = args.output or Path("runs") / (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "_" + uuid4().hex[:6])
    # Avoid accidentally overwriting a previously successful run, or colliding with source files.
    if output.exists() and any(output.iterdir()):
        if hasattr(client, "close"):
            await client.close()
        raise AgentError("output_exists", "输出目录非空，请指定新目录，避免覆盖已有运行结果。")
    output.mkdir(parents=True, exist_ok=True)
    manifest = {"mode": args.mode, "material_provenance": bundle.provenance,
                "command": args.command, "status": "running", "statistics_provenance": None,
                "started_at_utc": datetime.now(timezone.utc).isoformat()}
    if args.mode == "live":
        manifest["model"] = client.model
    write(output / "manifest.json", manifest)

    def event(record):
        with (output / "events.jsonl").open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(record, ensure_ascii=False) + "\n")
        if record["event"] in {"stage_started", "validating", "repairing", "stage_failed"}:
            print(f"[{record['stage']}] {record['event']}")

    agent = MatchingAgent(client, on_event=event)
    try:
        previous = read(args.game, GameConfigInternal) if args.game else None
        if args.command == "feedback":
            if not previous or not args.statistics:
                raise AgentError("missing_feedback_input", "feedback 需要 --game 和 --statistics。")
            stats = read(args.statistics, LearningStatistics)
            feedback = await agent.generate_feedback(stats, bundle, previous, prefs)
            write(output / "feedback.json", feedback)
            manifest["statistics_provenance"] = "provided_by_caller"
        else:
            if args.command == "practice":
                if not args.feedback:
                    raise AgentError("missing_feedback", "practice 需要 --feedback。")
                feedback = read(args.feedback, LearningFeedback)
                if feedback.practice.material_id != bundle.material_id or feedback.practice.previous_game_id != previous.game_id:
                    raise AgentError("practice_mismatch", "反馈中的再练习参数与材料或上一轮游戏不一致。")
                prefs = feedback.practice.preferences
            if args.command == "generate":
                if not args.plan:
                    raise AgentError("missing_plan", "generate 需要 --plan。")
                plan = read(args.plan, MatchingPlan)
            else:
                plan = await agent.prepare_plan(bundle, prefs)
            while True:
                show_plan(plan, bundle)
                write(output / "plan.json", plan)
                if args.command == "plan":
                    manifest["status"] = "awaiting_confirmation"
                    return 0
                action = confirmation(args)
                if action == "edit":
                    prefs = edited_preferences(plan.preferences)
                    plan = await agent.prepare_plan(bundle, prefs)
                    continue
                if action != "confirm":
                    manifest["status"] = "cancelled"
                    print("已取消，未调用游戏生成工具。")
                    return 0
                break
            confirmed = agent.confirm_plan(plan, bundle)
            write(output / "confirmation.json", confirmed)
            result = await agent.generate_game(bundle, confirmed, previous_game=previous)
            write(output / "generation.json", result)
            if result.game is None:
                manifest["status"] = result.status
                print("验证未通过。问题报告已保存，没有导出可交付游戏。")
                return 1
            write(output / "game.internal.json", result.game)
            print("已生成并验证内部配置；此文件包含答案，交给 D，不直接发送前端。")
            if args.command == "demo" and (args.mode == "offline" or args.demo_feedback):
                stats = demo_statistics(result.game)
                write(output / "statistics.fixture.json", stats)
                manifest["statistics_provenance"] = "synthetic_D_fixture"
                print("反馈演示使用明确标注的模拟 D 统计，不是用户真实答题记录。")
                feedback = await agent.generate_feedback(stats, bundle, result.game, plan.preferences)
                write(output / "feedback.json", feedback)
                if args.practice:
                    next_plan = await agent.prepare_plan(bundle, feedback.practice.preferences)
                    show_plan(next_plan, bundle)
                    write(output / "practice.plan.json", next_plan)
                    if confirmation(args) == "confirm":
                        next_result = await agent.generate_game(bundle, agent.confirm_plan(next_plan, bundle), previous_game=result.game)
                        write(output / "practice.generation.json", next_result)
                        if next_result.game is None:
                            manifest["status"] = "practice_failed"
                            return 1
                    else:
                        manifest["status"] = "practice_awaiting_confirmation"
                        return 0
        manifest["status"] = "completed"
        return 0
    except AgentError as exc:
        manifest["status"] = "failed"
        write(output / "error.json", exc.as_dict())
        raise
    except (ValidationError, ValueError, OSError):
        manifest["status"] = "failed"
        write(output / "error.json", {"code": "invalid_input", "message": "输入文件或格式无效。"})
        raise
    finally:
        if args.mode == "live":
            manifest["http_requests"] = client.request_count
            manifest["usage"] = client.usage
            await client.close()
        write(output / "manifest.json", manifest)
        print(f"结果目录：{output.resolve()}")


def parser():
    p = argparse.ArgumentParser(description="AIE1903 A 模块：配对游戏 Agent")
    p.add_argument("command", choices=["demo", "plan", "generate", "feedback", "practice"])
    p.add_argument("--mode", required=True, choices=["offline", "live"], help="必须明确选择；无自动回退")
    p.add_argument("--knowledge", type=Path, default=ROOT / "examples" / "knowledge" / "computing.json")
    p.add_argument("--preferences", type=Path)
    p.add_argument("--level", choices=["beginner", "familiar"], default="beginner")
    p.add_argument("--goal", choices=["recognize", "distinguish"], default="recognize")
    p.add_argument("--count", type=int, choices=range(4, 9), default=6)
    p.add_argument("--plan", type=Path)
    p.add_argument("--game", type=Path)
    p.add_argument("--statistics", type=Path)
    p.add_argument("--feedback", type=Path)
    p.add_argument("--output", type=Path)
    p.add_argument("--yes", action="store_true", help="只允许离线测试跳过交互确认")
    p.add_argument("--practice", action="store_true", help="demo 包含下一轮方案与确认")
    p.add_argument("--demo-feedback", action="store_true", help="真实模型 demo 也使用模拟 D 统计演示反馈")
    p.add_argument("--inject", choices=["duplicate", "persistent_duplicate", "unsupported", "no_source", "invalid_json"])
    return p


def main():
    load_dotenv(override=False)
    args = parser().parse_args()
    try:
        code = asyncio.run(run(args))
    except AgentError as exc:
        print(f"错误 [{exc.code}]：{exc.message}", file=sys.stderr)
        code = 1
    except (ValidationError, ValueError, OSError):
        print("输入文件不存在、不可读或不符合契约，请检查路径和字段。", file=sys.stderr)
        code = 2
    except KeyboardInterrupt:
        print("已中断。", file=sys.stderr)
        code = 130
    raise SystemExit(code)

