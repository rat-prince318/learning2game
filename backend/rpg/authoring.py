"""Grounded live authoring. The model composes episodes and decisions using typed slots.

Story slots never contain free text. Only the material service supplies educational
language. A function call can select cited facts and contrast cases, but cannot
insert an answer into NPC dialogue or claim an extra real-world capability.
"""

from typing import Literal

from matching_agent.wording import has_unwanted_wording

from pydantic import Field, create_model

from ..models import StrictModel
from . import offline, prompts
from .models import _active_markup
from .validation import DraftError, key


ARCS = {"missing_pages": "寻找散落的记录", "handover": "最后一班交接", "opening": "开放日倒计时"}
BEATS = {
    "recover": "找回散落的记录，将线索送到登记处。",
    "compare": "复核两份有争议的登记，留下可追溯的处理记录。",
    "route": "分派刚送来的工单，将它们交给合适的负责人。",
    "restore": "修整缺页的记录册，集齐本页所需的标签。",
    "deliver": "整理本次查证的档案，送交下一站。",
}
EVENTS = {
    "dispatch": "值班台收到紧急工单，你负责安排交接。",
    "misfiled": "装订时有几张标签散落了，你负责把它们放回相应的记录页。",
    "audit": "两名同伴交来的登记各缺一栏，你负责签发复核结果。",
    "exhibit": "展台马上开放，你需要选好展签，交给正在布展的同伴。",
    "archive": "档案准备入库，你负责从候选标签中完成最后一次分拣。",
}
LENSES = {"recall": "根据讲义辨认术语和描述",
          "compare": "从几个相近的候选项中说明选择依据",
          "trace": "按资料记录的关系定位合适的标签"}
HINTS = {"action": "先圈出记录中的动作和对象，再比较各个选项。",
         "order": "先核对第一栏，再用第二栏排除次序相反的候选项。",
         "contrast": "把最相近的两个标签放在一起，找出区分它们的原文线索。"}


Arc = Literal["missing_pages", "handover", "opening"]
Lens = Literal["recall", "compare", "trace"]
Beat = Literal["recover", "compare", "route", "restore", "deliver"]


def plan_schema(scene_count):
    fields = {f"scene_{i}": (Beat, ...) for i in range(1, scene_count + 1)}
    return create_model("QuestOutline", __base__=StrictModel, arc=(Arc, ...), lens=(Lens, ...), **fields)


def make_plan(preferences, selected, recipe):
    draft = offline.local_plan(preferences, selected)
    draft.title = f"{offline.THEMES[preferences.theme][0]}：{ARCS[recipe.arc]}"
    draft.rationale = f"玩家将{LENSES[recipe.lens]}，在各站完成登记与交接。本轮练习针对{offline.GOALS[preferences.goal]}。"
    for i, outline in enumerate(draft.scenes, 1):
        outline.objective = BEATS[getattr(recipe, f"scene_{i}")]
    return draft


def recipe_schema(pool, plan):
    """Only offer existing references, and preassign objective slots on the server."""
    fields = {}
    by_id = {k.knowledge_id: k for k in pool}
    for i, kid in enumerate([kid for scene in plan.scene_outlines for kid in scene.knowledge_ids], 1):
        item = by_id[kid]
        refs = Literal[tuple(f"r{j}" for j, k in enumerate(pool, 1) if k.knowledge_id != kid)]
        source_fields = ["definition"]
        if item.example:
            source_fields.append("example")
        if item.evidence:
            source_fields.append("evidence")
        question = create_model(f"Decision{i}", __base__=StrictModel,
            event=(Literal["dispatch", "misfiled", "audit", "exhibit", "archive"], ...),
            clue=(Literal[tuple(source_fields)], ...),
            contrasts=(list[refs], Field(min_length=2, max_length=3)),  # selectable source handles only
            hint_style=(Literal["action", "order", "contrast"], ...),
            success_effect=(Literal["stamp", "archive", "deliver"], ...))
        fields[f"decision_{i}"] = (question, ...)
    return create_model("QuestDecisions", __base__=StrictModel, **fields)


def context(pool, plan, previous):
    ids = {k.knowledge_id: f"r{i}" for i, k in enumerate(pool, 1)}
    ordered = [kid for scene in plan.scene_outlines for kid in scene.knowledge_ids]
    return {"confirmed_plan": plan.model_dump(),
            "references": {ids[k.knowledge_id]: k.model_dump(exclude={"knowledge_id"}, exclude_none=True) for k in pool},
            "assigned": {f"decision_{i}": ids[kid] for i, kid in enumerate(ordered, 1)},
            "previous_prompts": [q.prompt for s in previous.scenes for q in s.challenges
                                 if q.knowledge_id in ordered] if previous else []}


def _clue(item, chosen):
    # A provenance note such as "the Screen box says catches leaves" identifies
    # the answer. Use the grounded definition when the chosen quote does so.
    candidates = [getattr(item, chosen), item.definition, item.example]
    for text in candidates:
        if (text and len(text) <= 230 and key(item.term) not in key(text)
                and not has_unwanted_wording(text) and not _active_markup.search(text)):
            return text.rstrip("。.")
    return None


def _decision_text(prompt):
    for opening in EVENTS.values():
        if prompt.startswith(opening):
            return key(prompt[len(opening):])
    return key(prompt)


def _question(recipe, item, references, plan, previous):
    chosen = list(dict.fromkeys(recipe.contrasts))
    if len(chosen) < 2:
        raise DraftError("每道题需要两条不同的参考项来构造干扰选项。")
    foils = [references[k] for k in chosen]
    prior_prompt = previous.prompt if previous else None
    prior_answer = (next(o.text for o in previous.options if o.id == previous.correct_option_id)
                    if previous else None)
    event_key = recipe.event
    if prior_prompt and prior_prompt.startswith(EVENTS[event_key]):
        # Replaying the same decision can still test recall, but a new
        # incident makes the transfer opportunity visible even for one fact.
        keys = list(EVENTS)
        event_key = keys[(keys.index(event_key) + 1) % len(keys)]
    opening = EVENTS[event_key]
    target = _clue(item, recipe.clue)
    visual = item.source_type in {"image", "diagram", "mixed", "visual"}
    record = "图示记录" if visual else "资料记录"
    if plan.difficulty == "hard" and target:
        # Retest the same assessed target with a different comparison case.
        # A shuffled public ID or a different story opening isn't a new problem.
        candidates = sorted(foils, key=lambda k: f"{k.term} → {item.term}" == prior_answer)
        for contrast in candidates:
            first = _clue(contrast, "definition")
            if (not first or key(first) == key(target) or key(item.term) in key(first)
                    or key(contrast.term) in key(target)):
                continue
            third = next(f for f in foils if f.knowledge_id != contrast.knowledge_id)
            if max(len(k.term) for k in [contrast, third, item]) > 96:
                continue
            prompt = (f"{opening}{record}的第一栏是「{first}」，第二栏是「{target}」。"
                      "两栏标签要按顺序送出，你签发哪一组？")
            # Each clue eliminates a different plausible candidate. All options
            # have the same format. The second slot is the assessed concept.
            a, b, c = contrast.term, item.term, third.term
            alternatives = [f"{a} → {b}", f"{b} → {a}", f"{a} → {c}", f"{c} → {b}"]
            return prompts.QuestionDraft(knowledge_id=item.knowledge_id, prompt=prompt,
                options=alternatives, correct_index=0, hint=HINTS["order"], success_effect=recipe.success_effect), contrast
    if target and plan.difficulty != "easy":
        prompt = f"{opening}{record}注明「{target}」。你会把这张标签归到哪一项？"
        choices = [k.term for k in [item, *foils]]
    else:
        prompt = f"{opening}这次要登记的条目是「{item.term}」。你选择哪条资料描述随它一起交接？"
        choices = [k.definition for k in [item, *foils] if len(k.definition) <= 200]
        if len(item.definition) > 200 or len(choices) < 3:
            if target is None:
                raise DraftError("请选用更短、更清晰的线索和干扰项。")
            prompt = f"{opening}{record}注明「{target}」。应领取哪张标签？"
            choices = [k.term for k in [item, *foils]]
    hint = recipe.hint_style if recipe.hint_style != "order" else "action"
    return prompts.QuestionDraft(knowledge_id=item.knowledge_id, prompt=prompt, options=choices,
            correct_index=0, hint=HINTS[hint], success_effect=recipe.success_effect), None


def make_game(recipe, pool, plan, previous):
    references = {f"r{i}": k for i, k in enumerate(pool, 1)}
    by_id = {k.knowledge_id: k for k in pool}
    seen = {q.knowledge_id: q for scene in previous.scenes for q in scene.challenges} if previous else {}
    title, _, npc, book, _ = offline.THEMES[plan.theme]
    n = 0
    companions = {}
    scenes = []
    for i, outline in enumerate(plan.scene_outlines, 1):
        questions = []
        for kid in outline.knowledge_ids:
            n += 1
            q, companion = _question(getattr(recipe, f"decision_{n}"), by_id[kid], references, plan, seen.get(kid))
            if companion:
                companions[kid] = companion
            questions.append(q)
        intro = ("我先把待核对的记录交给你。你可以逐条查看线索，需要时领取提示。"
                 if plan.learner_level == "beginner" else "交接台已经备好，请独立复核这一批记录。")
        scenes.append(prompts.SceneDraft(description=f"{title}的第 {i} 批记录抵达{outline.name}。{outline.objective}",
            npc_name=npc, dialogue=[intro, outline.objective], quest_title=f"{book}第 {i} 次交接",
            item_name=f"{outline.name}档案章", questions=questions))
    draft = prompts.GameDraft(scenes=scenes)
    game = offline.assemble_game(draft, plan, pool, previous)
    for scene in game.scenes:
        for challenge in scene.challenges:
            companion = companions.get(challenge.knowledge_id)
            if companion:
                primary = by_id[challenge.knowledge_id]
                note = (f"第一栏「{companion.term}」对应「{_clue(companion, 'definition')}」"
                        f"（{companion.source_ref}）。第二栏「{primary.term}」对应「{primary.definition}」"
                        f"（{primary.source_ref}）。")
                # With exceptionally long locators use the complete evidence
                # phrase for the selected target and keep its separate source_ref.
                if len(note) > 1200:
                    note = (f"第一栏「{companion.term}」对应「{_clue(companion, 'definition')}」"
                            f"（{companion.source_ref}）。第二栏「{primary.term}」对应"
                            f"「{_clue(primary, 'definition') or _clue(primary, 'example') or primary.definition}」。")
                if len(note) > 1200:
                    raise DraftError("两栏的来源说明过长，请选择简短的线索及对照项。")
                challenge.explanation = note
    if any(q.knowledge_id in seen and _decision_text(q.prompt) == _decision_text(seen[q.knowledge_id].prompt)
           for scene in game.scenes for q in scene.challenges):
        warning = "部分知识点沿用上轮的判断线索，可以再次对照原资料复核。"
        if warning not in game.warnings:
            game.warnings.append(warning)
    if plan.difficulty == "hard" and len(companions) < plan.challenge_count:
        game.warnings.append("部分记录适合单条线索判断，相应题目采用一张工单。")
    return game
