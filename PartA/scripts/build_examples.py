"""Build clearly labeled, authored fixtures and contracts. No API calls."""
from pathlib import Path
import asyncio
import json

from matching_agent import MatchingAgent, UserPreferences
from matching_agent.models import KnowledgeBundle, KnowledgeItem, Source, LearningStatistics
from matching_agent.offline import OfflineClient

ROOT = Path(__file__).resolve().parents[1]

DATA = {
    "computing": ("zh", "component_function", [
        ("CPU", "执行程序指令并完成算术和逻辑运算。", "承担程序指令的运算与执行工作。", "按程序要求进行算术、逻辑处理的核心部件。"),
        ("RAM", "临时保存正在使用的数据和程序，断电后内容通常丢失。", "为正在运行的程序提供易失性工作存储空间。", "供运行中的程序暂存数据，通常不能在断电后保留内容。"),
        ("固态硬盘", "使用闪存保存数据，断电后仍能保留内容。", "通过非易失性闪存实现持久数据存储。", "利用闪存长期保存文件，停止供电后内容仍可保留。"),
        ("操作系统", "管理计算机硬件资源，并为应用程序提供运行服务。", "协调硬件资源的分配并支持应用程序运行。", "为应用程序提供运行环境，统一管理硬件资源。"),
        ("路由器", "根据网络地址在不同网络之间转发数据包。", "依据网络地址选择跨网络的数据包转发路径。", "使数据包能够按网络地址从一个网络转发到另一个网络。"),
        ("交换机", "依据设备的 MAC 地址在局域网内转发数据帧。", "在局域网内部按 MAC 地址转发数据帧。", "将局域网的数据帧按目标 MAC 地址送向相应设备。"),
        ("编译器", "将源程序翻译成目标程序。", "把源语言编写的程序转换为目标语言程序。", "完成从源代码到目标程序的翻译工作。"),
        ("递归", "函数直接或间接调用自身，并通过终止条件结束调用。", "利用自身调用分解问题，并依靠终止条件停止。", "通过直接或间接的自身调用处理问题，必须有停止条件。"),
    ]),
    "biology": ("en", "organ_function", [
        ("Heart", "Pumps blood through the circulatory system.", "Drives blood circulation by pumping.", "Propels blood around the body's circulatory system."),
        ("Lungs", "Exchange oxygen and carbon dioxide between air and blood.", "Provide the site of gas exchange between air and blood.", "Transfer oxygen and carbon dioxide between inhaled air and the bloodstream."),
        ("Stomach", "Mixes food with acid and enzymes to begin substantial protein digestion.", "Uses acid and enzymes while mixing food during early protein digestion.", "Churns food and begins substantial protein breakdown with acid and enzymes."),
        ("Kidneys", "Filter blood and regulate water and salts by producing urine.", "Form urine to remove wastes and regulate water and salt balance.", "Regulate water and salts and remove blood-borne wastes through urine formation."),
        ("Liver", "Produces bile, which helps disperse fats during digestion.", "Supplies the bile used to disperse dietary fats.", "Makes a digestive fluid that helps break fats into smaller droplets."),
        ("Pancreas", "Secretes digestive enzymes into the small intestine and releases insulin into blood.", "Provides intestinal digestive enzymes and the blood glucose hormone insulin.", "Supplies enzymes for intestinal digestion and secretes insulin into the bloodstream."),
        ("Red blood cells", "Carry oxygen using the protein hemoglobin.", "Transport oxygen bound to hemoglobin.", "Use hemoglobin to deliver oxygen through the circulation."),
        ("Small intestine", "Absorbs most digested nutrients through its lining.", "Provides the main surface for absorbing digested nutrients.", "Transfers most nutrients from digested food across its inner lining."),
    ]),
    "geography": ("zh", "concept_definition", [
        ("经线", "连接南北两极、与赤道垂直的半圆弧。", "通过南北两极并垂直于赤道的半圆线。", "从北极延伸到南极且垂直于赤道的半圆弧线。"),
        ("纬线", "地球表面上与赤道平行的圆圈。", "在地球表面平行于赤道分布的圆。", "沿东西方向环绕地球、与赤道保持平行的圆圈。"),
        ("等高线", "地图上连接海拔高度相同各点的曲线。", "由地图中相同海拔的点连接形成的线。", "把地图上高程相等的位置连成的曲线。"),
        ("海拔", "地面某点相对于平均海平面的垂直高度。", "以平均海平面为基准测得的地面点垂直高度。", "从平均海平面计算到地面某一点的垂直距离。"),
        ("海陆风", "由海陆昼夜受热差异引起、风向昼夜转换的局地风。", "海陆受热差异造成的昼夜换向局地风。", "沿海地区因陆地和海洋昼夜温度变化不同而形成的换向风。"),
        ("板块边界", "相邻岩石圈板块相互接触的地带。", "两个相邻岩石圈板块的接触区域。", "岩石圈中不同板块彼此相接的位置。"),
        ("流水侵蚀", "流动的水对地表岩石和土壤进行剥蚀、搬离的作用。", "地表水流剥蚀并带走岩石和土壤的过程。", "流动水体不断剥离并移走地表物质的作用。"),
        ("温室效应", "大气中的某些气体吸收并再辐射地表发出的红外辐射，使地表增暖。", "某些大气气体通过吸收和再辐射地表红外辐射产生的增暖作用。", "地表红外辐射被大气中的特定气体吸收并再辐射而导致的增暖现象。"),
    ]),
}


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    if hasattr(data, "model_dump"):
        data = data.model_dump(mode="json")
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def fixture_stats(game):
    """Author-specified D fixture: 6 pairs, first wrong then correct; second hinted."""
    return LearningStatistics.model_validate({
        "session_id": "fixture_session_" + game.material_id, "game_id": game.game_id,
        "status": "completed", "metrics": {"first_attempt_accuracy": 5 / 6,
            "total_attempt_accuracy": 6 / 7, "completion_rate": 1.0,
            "total_attempts": 7, "total_errors": 1, "hints_used": 1},
        "by_knowledge": [{"knowledge_id": p.knowledge_id, "first_attempt_correct": i != 0,
                          "attempts": 2 if i == 0 else 1, "errors": 1 if i == 0 else 0,
                          "hints": 1 if i == 1 else 0, "completed": True} for i, p in enumerate(game.pairs)],
        "weak_knowledge_ids": [p.knowledge_id for p in game.pairs[:2]],
    })


async def main():
    variants = {}
    bundles = {}
    for subject, (language, relation, rows) in DATA.items():
        sources, knowledge, lines = [], [], [f"# {subject} authored fixture", "", "This is an authored educational test material, not an extraction result.", ""]
        for idx, (concept, definition, familiar, practice) in enumerate(rows, 1):
            kid, sid = f"{subject}_{idx:02}", f"source_{subject}_{idx:02}"
            evidence = f"{concept}: {definition}"
            sources.append(Source(source_id=sid, material_id=subject, locator=f"materials/{subject}.md — item {idx}", evidence=evidence))
            knowledge.append(KnowledgeItem(knowledge_id=kid, concept=concept, definition=definition,
                relation_type=relation, difficulty="basic" if idx <= 4 else "advanced",
                learning_objective="Match the concept to its evidenced description.",
                source_refs=[sid], evidence=evidence))
            variants[kid] = {"familiar": familiar, "practice": practice}
            lines.extend([f"## Item {idx}", "", evidence, ""])
        bundle = KnowledgeBundle(material_id=subject, language=language, provenance="fixture",
                                 knowledge=knowledge, sources=sources,
                                 warnings=["人工编写的接口测试样例；未运行 B 的真实资料提取。"])
        bundles[subject] = bundle
        save(ROOT / "examples" / "knowledge" / f"{subject}.json", bundle)
        (ROOT / "examples" / "materials").mkdir(parents=True, exist_ok=True)
        (ROOT / "examples" / "materials" / f"{subject}.md").write_text("\n".join(lines), encoding="utf-8")
    save(ROOT / "examples" / "offline_variants.json", variants)
    agent = MatchingAgent(OfflineClient(variants))
    for subject, bundle in bundles.items():
        plan = await agent.prepare_plan(bundle, UserPreferences())
        # Stable fixture identities; never presented as live model output.
        plan.plan_id = "fixture_plan_" + subject
        result = await agent.generate_game(bundle, agent.confirm_plan(plan, bundle))
        assert result.game, result
        game = result.game
        game.game_id = "fixture_game_" + subject
        save(ROOT / "examples" / "plans" / f"{subject}.json", plan)
        save(ROOT / "examples" / "games" / f"{subject}.json", game)
        stats = fixture_stats(game)
        save(ROOT / "examples" / "statistics" / f"{subject}.json", stats)
        feedback = await agent.generate_feedback(stats, bundle, game, plan.preferences)
        save(ROOT / "examples" / "feedback" / f"{subject}.json", feedback)
    from matching_agent import models
    for name in ["KnowledgeBundle", "UserPreferences", "MatchingPlan", "ConfirmedPlan", "GameConfigInternal",
                 "ValidationReport", "GenerationResult", "LearningStatistics", "LearningFeedback"]:
        save(ROOT / "schemas" / f"{name}.schema.json", getattr(models, name).model_json_schema())


if __name__ == "__main__":
    asyncio.run(main())

