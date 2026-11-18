"""Integration point for B's material extractor and A's agent.

DemoServices is an offline fixture for the named sample handout. Its responses
come from the examples below. Production adapters implement the same Protocol.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from .models import (
    GameConfigInternal,
    KnowledgeItem,
    LearningReport,
    MatchingPair,
    MatchingPlan,
    MaterialResult,
    UserPreferences,
)


class Services(Protocol):
    def extract(self, path: Path) -> MaterialResult:
        """B returns the material's concepts and their source references."""
        ...

    def plan(self, knowledge: list[KnowledgeItem], preferences: UserPreferences) -> MatchingPlan:
        """A proposes a plan within the given concepts for user confirmation."""
        ...

    def generate(
        self, knowledge: list[KnowledgeItem], plan: MatchingPlan,
        previous: GameConfigInternal | None = None,
    ) -> GameConfigInternal:
        """Generate and check the confirmed pairs; vary the wording for a practice round."""
        ...

    def feedback(self, report: LearningReport, knowledge: list[KnowledgeItem]) -> str:
        """A writes suggestions from D's statistics and the round's sourced concepts."""
        ...


@dataclass(frozen=True)
class _Example:
    knowledge_id: str
    term: str
    definition: str
    case: str
    hint: str
    alternate_definition: str
    alternate_case: str


_EXAMPLES = (
    _Example("supervised", "监督学习", "用带有目标标签的样本训练模型。",
             "判断学习方式：用附有人工评分的作文训练自动评分系统。", "留意训练数据中是否给出了标准答案。",
             "每个训练输入都配有用作学习目标的参考输出。", "作文和老师已经给出的分数一起送入系统训练。这里用了哪种学习方式？"),
    _Example("unsupervised", "无监督学习", "从没有目标标签的样本中寻找结构。",
             "判断学习方式：学生没有分组标签，系统按选课记录自动将他们分组。", "观察任务是否只依赖输入数据之间的相似性。",
             "没有预先提供的目标输出，模型自行发现输入之间的模式。", "从未提供学生组别，模型仅从选课记录找到相似群体。这里用了哪种学习方式？"),
    _Example("classification", "分类", "预测一个离散类别。",
             "判断预测任务：系统给每封新邮件标为“正常”或“垃圾邮件”。", "考虑输出是否来自有限的类别集合。",
             "模型需要从若干个类别中选出一个作为输出。", "收到一封邮件时，模型只在两个类别中选择一个标签。它在做哪类预测？"),
    _Example("regression", "回归", "预测一个连续数值。",
             "判断预测任务：系统预测图书馆明天的每小时用电量，单位为千瓦时。", "关注结果是否可以用带单位的连续量表示。",
             "模型需要给出一个可以连续变化的量作为输出。", "输出是图书馆某时段预计消耗的电量，可以精确到小数。它在做哪类预测？"),
    _Example("overfitting", "过拟合", "模型学到了训练集的偶然细节，在新样本上的表现变差。",
             "解释测试表现：模型在练习题上几乎全对，换一批同类的新题却频繁出错。", "对比模型在训练样本和新样本上的表现。",
             "训练样本的特殊细节被当成规律，因而旧题表现好而新题表现差。", "练过的题几乎全对，同样难度的新题却常错。哪个现象能解释这种落差？"),
    _Example("generalization", "泛化", "模型将在训练中学到的规律用于未见过的样本。",
             "解释测试表现：模型能正确处理从未出现在训练集中的路牌照片。", "关注学过的规律在新样本中能否继续适用。",
             "即便换成训练阶段没有见过的输入，学到的规律依然适用。", "训练结束后，系统也认出了全新照片里的路牌。这里体现了模型的哪种能力？"),
)
_BY_ID = {example.knowledge_id: example for example in _EXAMPLES}
_HANDOUT = "机器学习入门示例讲义"
DEMO_MATERIAL_TEXT = (
    f"{_HANDOUT}\n"
    + "\n".join(
        f"{index}. {item.term}：{item.definition} 例：{item.case}"
        for index, item in enumerate(_EXAMPLES, 1)
    )
    + "\n"
)


def _demo_material() -> MaterialResult:
    return MaterialResult(knowledge=[
        KnowledgeItem(
            knowledge_id=item.knowledge_id,
            term=item.term,
            definition=item.definition,
            source_ref=f"《{_HANDOUT}》第 {index} 条",
            example=item.case,
            knowledge_type="concept",
            source_type="text",
        )
        for index, item in enumerate(_EXAMPLES, 1)
    ])


class DemoServices:
    def extract(self, path: Path) -> MaterialResult:
        message = "演示模式只支持随附的机器学习示例讲义。"
        try:
            with path.open(encoding="utf-8-sig") as source:
                content = source.read(len(DEMO_MATERIAL_TEXT) + 1)
        except UnicodeDecodeError as exc:
            raise ValueError(message) from exc
        if content != DEMO_MATERIAL_TEXT:
            raise ValueError(message)
        return _demo_material()

    def plan(self, knowledge: list[KnowledgeItem], preferences: UserPreferences) -> MatchingPlan:
        purpose = {
            "preview": "课前预习", "review": "课后复习", "classroom": "课堂练习",
            "recognize": "认识概念", "distinguish": "辨别易混概念",
        }
        use_scenario = preferences.difficulty == "hard" or preferences.goal == "distinguish"
        if use_scenario:
            relation = "term_scenario"
            rationale = "用不同情境检验能否区分概念。"
        elif preferences.learner_level == "beginner" and preferences.difficulty == "easy":
            relation = "term_illustrated_definition"
            rationale = "把定义和例子放在一起，帮助初学者识别概念。"
        else:
            relation = "term_definition"
            rationale = "把术语和定义配对，检查对概念含义的理解。"
        warnings = []
        if len(knowledge) < preferences.pair_count:
            warnings.append(f"本轮可选知识点只有 {len(knowledge)} 个，已相应减少卡片数量。")
        return MatchingPlan(
            title=f"机器学习入门 · {purpose[preferences.goal]}（示例）",
            goal=preferences.goal,
            learner_level=preferences.learner_level,
            difficulty=preferences.difficulty,
            knowledge_ids=[item.knowledge_id for item in knowledge[:preferences.pair_count]],
            relationship_type=relation,
            rationale=rationale,
            warnings=warnings,
        )

    def generate(
        self, knowledge: list[KnowledgeItem], plan: MatchingPlan,
        previous: GameConfigInternal | None = None,
    ) -> GameConfigInternal:
        selected = {item.knowledge_id: item for item in knowledge}
        old_cards = {pair.knowledge_id: pair.right for pair in previous.pairs} if previous else {}
        pairs = []
        for knowledge_id in plan.knowledge_ids:
            item = selected.get(knowledge_id)
            example = _BY_ID.get(knowledge_id)
            if item is None or example is None:
                raise ValueError("Unknown concept in demo plan")
            relation = plan.relationship_type
            if relation == "auto":
                relation = {"easy": "term_illustrated_definition", "medium": "term_definition",
                            "hard": "term_scenario"}[plan.difficulty]
            card_text = {
                "term_illustrated_definition": (
                    f"{item.definition} 例：{example.case}",
                    f"{example.alternate_definition} 例：{example.alternate_case}",
                ),
                "term_definition": (item.definition, example.alternate_definition),
                "term_scenario": (example.case, example.alternate_case),
            }
            if relation not in card_text:
                raise ValueError("Unsupported relationship type in demo plan")
            original, alternate = card_text[relation]
            pairs.append(MatchingPair(
                pair_id=f"sample-{knowledge_id}",
                knowledge_id=knowledge_id,
                left=item.term,
                right=alternate if old_cards.get(knowledge_id) == original else original,
                explanation=f"{item.definition}例如：{example.case}",
                source_ref=item.source_ref,
                hint=example.hint,
            ))
        return GameConfigInternal(title=plan.title, pairs=pairs)

    def feedback(self, report: LearningReport, knowledge: list[KnowledgeItem]) -> str:
        if not report.weak_knowledge_ids:
            return "示例反馈：本轮没有标记待复习知识点。可以从讲义中选择情境例子，再配对一次。"
        by_id = {item.knowledge_id: item for item in knowledge}
        targets = [by_id[concept] for concept in report.weak_knowledge_ids]
        refs = "、".join(f"{item.term}（{item.source_ref}）" for item in targets)
        return f"示例反馈：请重读以下知识点，比较每个定义与讲义中的例子后再练习。{refs}。"


def demo_game() -> GameConfigInternal:
    """Provide the same six concepts for C's first standalone game session."""
    services = DemoServices()
    knowledge = _demo_material().knowledge
    return services.generate(knowledge, services.plan(knowledge, UserPreferences()))
