"""Real local generation and scripted protocol tests; external evidence is recorded separately."""

import asyncio
import json
import re
from types import SimpleNamespace

import pytest
from matching_agent.llm import ModelMessage, ToolCall

from backend.models import KnowledgeItem
from backend.rpg import authoring, offline, reviewer
from backend.rpg.agent import RPGAgent
from backend.rpg.models import RPGPreferences
from backend.rpg.service import RPGService
from backend.rpg.validation import RPGContentError, check_game, reference_pool, select
from pydantic import ValidationError


def materials():
    data = [("细胞核", "储存遗传信息"), ("线粒体", "在有氧呼吸中提供能量"),
            ("核糖体", "合成蛋白质"), ("细胞膜", "控制物质进出细胞"),
            ("叶绿体", "进行光合作用"), ("液泡", "储存水和溶质")]
    return [KnowledgeItem(knowledge_id=f"k{i}", term=t, definition=d, source_ref=f"讲义第 {i} 页",
                          evidence=f"{t}：{d}", source_type="text", source_ids=[f"src{i}"], page=i)
            for i, (t, d) in enumerate(data, 1)]


def test_offline_personalized_content_and_safe_sources():
    svc = RPGService()
    rows = materials()
    easy = svc.plan_rpg(rows, RPGPreferences(difficulty="easy"))
    hard = svc.plan_rpg(rows, RPGPreferences(difficulty="hard", learner_level="familiar", theme="campus"))
    game_a, game_b = svc.generate_rpg(rows, easy), svc.generate_rpg(rows, hard)
    assert "本地规则" in easy.warnings[0]
    assert (len(game_a.scenes), sum(len(s.challenges) for s in game_a.scenes)) == (3, 6)
    question_a = game_a.scenes[0].challenges[0]
    question_b = game_b.scenes[0].challenges[0]
    assert question_a.prompt != question_b.prompt
    assert len(question_b.options) == 4
    assert game_b.scenes[0].visual_key == "campus"
    assert (question_b.evidence, question_b.source_ref) == (rows[0].evidence, rows[0].source_ref)
    assert check_game(game_b, hard, rows).valid
    different = [k.model_copy(update={"source_ref": "其他资料"}) for k in rows]
    assert check_game(game_b, hard, different).issues[0].code == "source_mismatch"


def test_figures_recommendations_and_one_concept_replay():
    svc = RPGService()
    rows = materials()
    assert svc.recommend_game_type(rows, RPGPreferences()).recommended_type == "matching"
    rows[0] = rows[0].model_copy(update={
        "term": "输出口", "definition": "图中位于右侧的接收端", "evidence": "箭头指向图右侧的接收端",
        "source_type": "image", "knowledge_type": "component_function"})
    assert svc.recommend_game_type(rows, RPGPreferences()).recommended_type == "rpg_quest"
    ordinary = svc.generate_rpg(rows, svc.plan_rpg(rows, RPGPreferences()))
    prior = SimpleNamespace(weak_knowledge_ids=["k1"])
    prefs = RPGPreferences(selected_knowledge_ids=["k1"])
    plan = svc.plan_rpg(rows, prefs, prior)
    assert plan.knowledge_ids == ["k1"] and plan.scene_count == 1
    game = svc.generate_rpg(rows, plan, ordinary)
    q = game.scenes[0].challenges[0]
    assert game.scenes[0].next_scene_id is None and len(q.options) >= 3
    assert q.prompt != ordinary.scenes[0].challenges[0].prompt
    assert q.evidence == "箭头指向图右侧的接收端"
    with pytest.raises(RPGContentError, match="超出本轮"):
        svc.plan_rpg(rows, RPGPreferences(selected_knowledge_ids=["k2"]), prior)


def test_low_quality_sources_and_selection_boundaries():
    rows = materials()[:3]
    rows[0] = rows[0].model_copy(update={"evidence": None})
    with pytest.raises(RPGContentError, match="三个有出处"):
        select(rows, RPGPreferences())
    conflict = rows[1].model_copy(update={"knowledge_id": "other", "definition": "另一种定义"})
    with pytest.raises(RPGContentError, match="三个有出处"):
        select([*materials()[:3], conflict], RPGPreferences())
    with pytest.raises(RPGContentError, match="超出本轮"):
        select(materials(), RPGPreferences(selected_knowledge_ids=["other"]))
    with pytest.raises(RPGContentError, match="选中知识点数"):
        select(materials(), RPGPreferences(challenge_count=3, selected_knowledge_ids=["k1","k2","k3","k4"]))
    with pytest.raises(RPGContentError, match="三个概念"):
        svc = RPGService()
        plan = svc.plan_rpg(materials()[:1], RPGPreferences(), SimpleNamespace(weak_knowledge_ids=["k1"]))
        svc.generate_rpg(materials()[:1], plan)


class ToolClient:
    def __init__(self, script):
        self.script = list(script)
        self.names = []

    async def choose(self, messages, tools):
        assert len(tools) == 1
        offered = tools[0]["function"]["name"]
        self.names.append(offered)
        expected, data = self.script.pop(0)
        assert expected == offered
        if callable(data):
            payload = json.loads(messages[1]["content"])["untrusted_data"]
            data = data(payload)
        return ModelMessage(tool_calls=[ToolCall("request", offered, json.dumps(data, ensure_ascii=False))])


def solve_blind(view):
    lookup = {row["definition"]: row["term"] for row in view["reference_sheet"]}
    reverse = {term: definition for definition, term in lookup.items()}
    answers = {}
    for scene in view["scenes"]:
        for slot, q in scene["challenges"].items():
            clues = re.findall(r"「([^」]+)」", q["prompt"])
            if len(clues) == 2:
                answer = " → ".join(lookup[x] for x in clues)
            else:
                answer = lookup.get(clues[0]) or reverse[clues[0]]
            letter = next(k for k, text in q["choices"].items() if text == answer)
            answers[slot] = {"choice": letter, "issue": "ok"}
    return answers


def inputs():
    rows = materials()
    plan = RPGService().plan_rpg(rows, RPGPreferences(challenge_count=3, scene_count=2))
    refs = authoring.context(reference_pool(rows, plan), plan, None)
    draft = {slot: {"event": "dispatch", "clue": "definition",
                    "contrasts": [r for r in refs["references"] if r != target][:2],
                    "hint_style": "contrast", "success_effect": "deliver"}
             for slot, target in refs["assigned"].items()}
    return rows, plan, draft


def test_live_shell_calls_tools_and_repairs_an_ambiguous_question():
    rows, plan, draft = inputs()
    def ambiguous(view):
        answers = solve_blind(view)
        answers["decision_1"]["issue"] = "ambiguous_choices"
        return answers
    script = [("generate_rpg_config", draft), ("validate_rpg_config", ambiguous),
              ("repair_rpg_config", draft), ("validate_rpg_config", solve_blind)]
    client = ToolClient(script)
    result = asyncio.run(RPGAgent(client).generate(rows, plan, None))
    assert result.status == "completed" and result.validation.repair_attempts == 1
    assert client.names == [name for name, _ in script]
    assert result.config.scenes[0].challenges[0].evidence == rows[0].evidence


def test_invalid_tool_or_third_bad_draft_never_publishes():
    rows, plan, draft = inputs()
    draft["decision_1"]["contrasts"] = ["r99", "r2"]
    client = ToolClient([("generate_rpg_config", draft), ("repair_rpg_config", draft),
                         ("repair_rpg_config", draft)])
    result = asyncio.run(RPGAgent(client).generate(rows, plan, None))
    assert result.status == "failed" and result.config is None
    assert result.validation.repair_attempts == 2
    assert result.validation.issues[0].code == "invalid_structure"

    class Invalid:
        async def choose(self, messages, tools):
            return ModelMessage(tool_calls=[ToolCall("another", "confirm_game", "{}")])

    with pytest.raises(RPGContentError, match="指定的工具"):
        asyncio.run(RPGAgent(Invalid()).generate(rows, plan, None))


def test_rejects_model_authored_answer_and_unknown_review_reference():
    rows, plan, draft = inputs()
    draft["decision_1"]["correct_index"] = 3
    _, _, game = inputs()
    client = ToolClient([("generate_rpg_config", draft), ("repair_rpg_config", game),
                         ("validate_rpg_config", {"alien": {"choice": "Z"}}),
                         ("validate_rpg_config", {"alien": {"choice": "Z"}})])
    with pytest.raises(RPGContentError, match="作答字段"):
        asyncio.run(RPGAgent(client).generate(rows, plan, None))


def test_legacy_projection_skips_sentence_subject_but_keeps_technical_term():
    rows = materials()[:3]
    old = KnowledgeItem(knowledge_id="intro", term="This", definition="an introductory handout.",
                        evidence="This is an introductory handout.", source_ref="line 1")
    legit = old.model_copy(update={"term": "this", "evidence": "this: current receiver",
                                 "definition": "current receiver"})
    selected, warnings = select([old, *rows], RPGPreferences())
    assert [k.knowledge_id for k in selected] == [k.knowledge_id for k in rows] and warnings
    assert select([legit, *rows], RPGPreferences())[0][0].term == "this"
    for prefs in (RPGPreferences(goal="distinguish", challenge_count=2),
                  RPGPreferences(goal="distinguish", selected_knowledge_ids=["k1", "k2"])):
        assert RPGService().recommend_game_type(rows, prefs).recommended_type == "matching"


def test_model_only_selects_narrative_structure_and_safe_facts():
    rows = materials()
    prefs = RPGPreferences(challenge_count=3, scene_count=2, difficulty="hard")
    recipe = {"arc": "handover", "lens": "compare", "scene_1": "route", "scene_2": "recover"}
    client = ToolClient([("design_rpg_plan", recipe)])
    plan = asyncio.run(RPGAgent(client).plan(rows, prefs, None))
    assert plan.scene_outlines[0].objective == authoring.BEATS["route"]
    assert all(k.definition not in plan.model_dump_json() for k in rows)
    with pytest.raises(ValidationError):
        authoring.plan_schema(2).model_validate({**recipe, "title": "某个站点可以保证安全"})
    _, _, draft = inputs()
    game = asyncio.run(RPGAgent(ToolClient([("generate_rpg_config", draft),
                       ("validate_rpg_config", solve_blind)])).generate(rows, plan, None)).config
    q = game.scenes[0].challenges[0]
    terms = [o.text.split(" → ") for o in q.options]
    answer = terms[0]
    assert any(pair[0] == answer[0] and pair[1] != answer[1] for pair in terms)
    assert any(pair[1] == answer[1] and pair[0] != answer[0] for pair in terms)
    assert rows[0].definition in q.prompt and rows[1].definition in q.prompt
    assert all(part in q.explanation for row in rows[:2] for part in (row.term, row.definition, row.source_ref))
    for scene in game.scenes:
        opening = scene.description + scene.quest.title + scene.quest.objective + "".join(scene.npc.dialogue)
        assert all(item.definition not in opening for item in rows)


def test_pre_answer_mapping_and_simple_hard_prompt_are_rejected():
    rows = materials()[:3]
    rows[0] = rows[0].model_copy(update={"term": "Carbon bed", "definition": "reduces odors",
                                         "source_type": "image", "evidence": "Carbon bed: reduces odors"})
    prefs = RPGPreferences(challenge_count=3, difficulty="hard", scene_count=1)
    plan = RPGService().plan_rpg(rows, prefs)
    game = RPGService().generate_rpg(rows, plan)
    scene = game.scenes[0]
    q = scene.challenges[0]
    q.prompt = "碳床在净水站中的主要功能是什么？"
    q.options[0].text = "减少气味"
    scene.description = "科学家正忙于调整碳床参数以减轻水中的气味。"
    issues = check_game(game, plan, rows).issues
    assert {"public_answer_mapping", "difficulty_mismatch"} <= {i.code for i in issues}
    scene.description = "值班室刚收到水样记录，请你选取处理方案。"
    assert "public_answer_mapping" not in {i.code for i in check_game(game, plan, rows).issues}


def test_feedback_actions_bind_to_server_slots_and_retry_malformed_tool_output():
    rows = materials()[:2]
    report = SimpleNamespace(weak_knowledge_ids=["k2", "k1"], finish_reason="exited",
                             concepts=[SimpleNamespace(knowledge_id=r.knowledge_id,
                                                       attempts=1, mistakes=1, hints=0, resolved=False,
                                                       remediated=False) for r in rows])
    client = ToolClient([("write_rpg_feedback", {"fake_id": "compare"}),
                         ("write_rpg_feedback", {"target_2": "recall", "target_1": "compare"})])
    text = asyncio.run(RPGAgent(client).feedback(report, rows))
    lines = text.splitlines()
    assert rows[1].term in lines[1] and rows[1].source_ref in lines[1] and "区分" in lines[1]
    assert rows[0].term in lines[2] and "复述" in lines[2]


def test_hard_replay_changes_the_comparison_case_and_warns_if_alternatives_are_unusable():
    rows = materials()[:3]
    plan = RPGService().plan_rpg(rows, RPGPreferences(challenge_count=3, difficulty="hard", scene_count=1))
    pool = reference_pool(rows, plan)
    refs = authoring.context(pool, plan, None)
    fields = {slot: {"event": "dispatch", "clue": "definition",
                     "contrasts": [r for r in refs["references"] if r != target],
                     "hint_style": "contrast", "success_effect": "stamp"}
              for slot, target in refs["assigned"].items()}
    recipe = authoring.recipe_schema(pool, plan).model_validate(fields)
    first = authoring.make_game(recipe, pool, plan, None)
    second = authoring.make_game(recipe, pool, plan, first)
    for old, new in zip(first.scenes[0].challenges, second.scenes[0].challenges):
        assert old.knowledge_id == new.knowledge_id
        assert authoring._decision_text(old.prompt) != authoring._decision_text(new.prompt)
        assert old.options[0].text != new.options[0].text

    rows[2] = rows[2].model_copy(update={"definition": "核糖体这一标签的例子提到了核糖体本身。"})
    pool = reference_pool(rows, plan)
    first = authoring.make_game(recipe, pool, plan, None)
    second = authoring.make_game(recipe, pool, plan, first)
    assert any("沿用上轮的判断线索" in message for message in second.warnings)


def test_reviewer_has_no_key_or_post_answer_text_and_must_solve_from_evidence():
    rows, plan, _ = inputs()
    game = offline.assemble_game(offline.local_game(rows, plan, None), plan, rows, None)
    q = game.scenes[0].challenges[0]
    q.explanation = "仅答后解锁的课程讲解"
    q.remediation_text = "仅答后解锁的引导"
    q.success_text = "仅答后解锁的结局"
    view, schema, keys = reviewer.prepare(game, plan, rows)
    raw = json.dumps(view, ensure_ascii=False)
    assert all(private not in raw for private in (q.explanation, q.remediation_text, q.success_text,
               "knowledge_id", "correct_option_id", "success_text", "remediation_text", "explanation"))
    for scene in view["scenes"]:
        for question in scene["challenges"].values():
            assert {"choices", "available_hint", "prompt"} == question.keys()
    answers = solve_blind(view)
    passed, _ = reviewer.grade(schema.model_validate(answers), keys)
    assert passed.valid
    answers["decision_1"]["choice"] = "unclear"
    failed, _ = reviewer.grade(schema.model_validate(answers), keys)
    assert [i.code for i in failed.issues] == ["blind_answer_mismatch"]
