"""Grounded local authoring and shared, host-owned assembly of the adventure."""

import re
from difflib import SequenceMatcher

from .models import RPGGameInternal, RPGPlan
from .prompts import GameDraft, SceneDraft, QuestionDraft, OutlineDraft, PlanDraft
from .validation import DraftError, RPGContentError, groups, key


# Each expedition pursues a concrete goal through up to four stops.
THEMES = {
    "laboratory": ("交班实验室", "lab", "值班研究员", "交班手册",
                   ["样本接收台", "观察室", "复核工作台", "交班室"]),
    "campus": ("开馆前一小时", "campus", "学生策展人", "导览手册",
               ["布展仓库", "导览台", "互动展厅", "开馆控制室"]),
    "fantasy": ("雾林失落的图鉴", "forest", "巡林抄录师", "旅行图鉴",
                ["林口驿站", "溪边营地", "回声树屋", "林间档案室"]),
}
GOALS = {"preview": "预习资料中首次出现的术语", "review": "回顾资料里的关键判断",
         "classroom": "向同伴说明判断的依据", "recognize": "辨认概念与描述的对应关系",
         "distinguish": "区分相近概念的用途"}


def local_plan(preferences, selected):
    title, _, _, book, stops = THEMES[preferences.theme]
    outlines = []
    objectives = []
    missions = {
        "laboratory": ["给入库样本登记标签", "核对观察记录的归属", "裁定两份登记表的争议", "整理可带走的交班档案"],
        "campus": ["给入场的展件配上说明", "修订讲解员的提示卡", "复核互动展台的演示线索", "交付开馆导览手册"],
        "fantasy": ["为驿站收到的残页归类", "拼合向导失落的野外笔记", "校对守林人保存的抄本", "送回装订完成的旅行图鉴"],
    }[preferences.theme]
    for stop, mission, section in zip(stops, missions, groups(selected, preferences.scene_count)):
        terms = "、".join(k.term[:24] for k in section[:3])
        outlines.append(OutlineDraft(name=stop, objective=f"{mission}，将核对结果记入{book}。"))
        objectives.append(f"{GOALS[preferences.goal]}，说明{terms}在讲义中的含义。")
    return PlanDraft(title=title,
                     rationale=f"每到一站都要为{book}补齐一页。你将用资料线索完成判断，再把已核对的记录交给下一站。",
                     learning_objectives=objectives, scenes=outlines)


def assemble_plan(preferences, selected, draft, warnings):
    sections = groups(selected, preferences.scene_count)
    if len(draft.scenes) != len(sections):
        raise RPGContentError("生成的场景数与本轮安排有出入，请重新拟定方案。")
    return RPGPlan(title=draft.title, goal=preferences.goal, learner_level=preferences.learner_level,
                   difficulty=preferences.difficulty, theme=preferences.theme,
                   knowledge_ids=[k.knowledge_id for k in selected], challenge_count=len(selected),
                   scene_count=len(sections), learning_objectives=draft.learning_objectives,
                   scene_outlines=[{**outline.model_dump(), "knowledge_ids": [k.knowledge_id for k in section]}
                                   for outline, section in zip(draft.scenes, sections)],
                   rationale=draft.rationale, warnings=warnings)


def _nearby(item, pool, hard):
    others = [k for k in pool if k.knowledge_id != item.knowledge_id]
    if hard:
        text = key(item.definition)
        others.sort(key=lambda k: (
            k.knowledge_type == item.knowledge_type,
            SequenceMatcher(None, text, key(k.definition)[:500], autojunk=False).ratio()
        ), reverse=True)
    elif others:
        # Rotate easy distractors through the lecture instead of showing the
        # same first two definitions beside every subsequent term.
        index = next(i for i, row in enumerate(pool) if row.knowledge_id == item.knowledge_id)
        start = index % len(others)
        others = others[start:] + others[:start]
    return others


def _question(item, pool, plan, book, repeat):
    harder = plan.difficulty == "hard" or plan.goal == "distinguish"
    peers = _nearby(item, pool, harder)
    # A definition quoting its own term is evidence, but would reveal a reverse
    # lookup's answer. In that case ask for the description, not the term.
    evidence = item.example or item.definition
    reverse = ((plan.difficulty != "easy") != repeat and key(item.term) not in key(evidence)
               and len(evidence) <= 570)
    if not reverse and len(item.definition) > 200:
        reverse = key(item.term) not in key(evidence) and len(evidence) <= 570
        if not reverse:
            raise RPGContentError("资料描述过长，请选用更简明的讲义或启用模型生成。")
    answer = item.term if reverse else item.definition
    alternatives = []
    for peer in peers:
        choice = peer.term if reverse else peer.definition
        if len(choice) > 200 or key(choice) == key(answer):
            continue
        alternatives.append(choice)
        if len(alternatives) == (3 if harder else 2):
            break
    if len(alternatives) < 2:
        raise RPGContentError("可区分的同资料选项较少，请补充至少三个有独立描述的概念。")
    if reverse:
        if item.source_type in {"image", "mixed", "visual", "diagram"}:
            prompt = f"图示记录写着「{evidence}」。请为{book}选出对应的标注。"
        elif harder:
            prompt = f"复核员拿到一条匿名记录：「{evidence}」 哪个标签能解释这条线索？"
        else:
            prompt = f"登记页留下线索「{evidence}」。你要给这一页贴上哪个标签？"
    else:
        prompt = (f"同伴为「{item.term}」留下了几份记录。根据讲义，哪一份可以收入{book}？" if harder
                  else f"你领到了「{item.term}」标签。请选择与讲义相符的说明，补全{book}。")
    return QuestionDraft(knowledge_id=item.knowledge_id, prompt=prompt,
                         options=[answer, *alternatives], correct_index=0,
                         hint="先圈出描述中的动作、对象或位置，再逐项比较选项。",
                         success_effect="stamp")


def local_game(pool, plan, previous):
    title, _, npc, book, _ = THEMES[plan.theme]
    by_id = {k.knowledge_id: k for k in pool}
    seen = ({q.knowledge_id: q.prompt for s in previous.scenes for q in s.challenges}
            if previous else {})
    scenes = []
    for idx, outline in enumerate(plan.scene_outlines, start=1):
        questions = []
        for kid in outline.knowledge_ids:
            q = _question(by_id[kid], pool, plan, book, False)
            if seen.get(kid) == q.prompt:
                q = _question(by_id[kid], pool, plan, book, True)
            questions.append(q)
        intro = ("从记录里找出关键动作，再查看各张标签。" if plan.learner_level == "beginner"
                 else "请独立复核有争议的记录，签入核对结果。")
        scenes.append(SceneDraft(
            description=f"{title}的第 {idx} 份记录刚送到{outline.name}。交接前，你要为{book}整理缺页。",
            npc_name=npc, dialogue=[f"我是{outline.name}的{npc}。{intro}", outline.objective],
            quest_title=f"找回{book}第 {idx} 页", item_name=f"{outline.name}签章",
            questions=questions))
    return GameDraft(scenes=scenes)


def assemble_game(draft, plan, pool, previous):
    """Bind trusted question roles, citations and all game rules on the host."""
    if len(draft.scenes) != plan.scene_count:
        raise DraftError("场景数量与已确认方案有出入。")
    by_id = {k.knowledge_id: k for k in pool}
    scenes = []
    for i, (scene, outline) in enumerate(zip(draft.scenes, plan.scene_outlines), 1):
        if [q.knowledge_id for q in scene.questions] != outline.knowledge_ids:
            raise DraftError("题目应逐项覆盖已确认场景中的知识点。")
        challenges = []
        for j, q in enumerate(scene.questions, 1):
            if q.correct_index >= len(q.options):
                raise DraftError("正确选项索引超出本题选项范围。")
            item = by_id[q.knowledge_id]
            if len(item.definition) > 1200:
                # Preserve an entire supported statement instead of cutting mid-claim.
                first = re.split(r"(?<=[。！？])|(?<=[.!?])\s+", item.definition)[0]
                if len(first) > 1200:
                    raise DraftError("本题缺少长度合适的资料解释，请调整所选条目。")
                explanation = first
            else:
                explanation = item.definition
            opts = [{"id": f"o{i}_{j}_{n}", "text": t} for n, t in enumerate(q.options)]
            book = THEMES[plan.theme][3]
            # Consequences belong to the story; the subsequent teaching note
            # uses the exact source. Model prose cannot introduce extra mechanisms.
            effects = {"stamp": f"你在{book}上留下了核对印记。",
                       "archive": f"{scene.npc_name}把核对好的记录收入{book}。",
                       "deliver": f"一张核对好的记录已交到{scene.npc_name}手中。"}
            challenges.append(dict(challenge_id=f"c{i}_{j}", type="single_choice", prompt=q.prompt,
                                   options=opts, correct_option_id=opts[q.correct_index]["id"],
                                   knowledge_id=item.knowledge_id, hint=q.hint, explanation=explanation,
                                   source_ref=item.source_ref, evidence=item.evidence,
                                   success_text=effects[q.success_effect],
                                   remediation_text=f"向导陪你按讲义核对这条记录。{book}收下了本页讲解。"))
        scenes.append(dict(scene_id=f"s{i}", name=outline.name, description=scene.description,
                           visual_key=THEMES[plan.theme][1], npc=dict(name=scene.npc_name, dialogue=scene.dialogue),
                           quest=dict(quest_id=f"q{i}", title=scene.quest_title, objective=outline.objective,
                                      challenge_ids=[q["challenge_id"] for q in challenges],
                                      reward=dict(xp=20, item=dict(id=f"i{i}", name=scene.item_name))),
                           challenges=challenges, next_scene_id=f"s{i+1}" if i < plan.scene_count else None))
    warnings = list(plan.warnings)
    if previous:
        seen = {key(q.prompt) for s in previous.scenes for q in s.challenges}
        if any(key(q["prompt"]) in seen for s in scenes for q in s["challenges"]):
            warnings.append("部分题目沿用已有情境，可再次核对原资料线索。")
    return RPGGameInternal(title=plan.title, rules="接受所在场景的任务，按序完成挑战。每题可尝试两次并查看一次提示，完成任务获得经验与物品。",
                           theme=plan.theme, start_scene_id="s1", scenes=scenes, warnings=warnings)
