"""Build repeatable camp exercises from the chapter and the original material."""

from dataclasses import dataclass
from hashlib import sha256

from pydantic import TypeAdapter, ValidationError

from ..models import KnowledgeItem
from ..question_language import accepts
from .battle_models import BattleOption, BattlePrompt, BattleState, StudyLesson
from .models import RPGChallengeInternal, RPGGameInternal, StudyFeedback
from .validation import key

_STUDY_TEXT = TypeAdapter(StudyFeedback)


@dataclass(frozen=True)
class Exam:
    prompt: BattlePrompt
    answer_id: str
    help_text: str
    question: RPGChallengeInternal
    lesson: StudyLesson | None = None
    supporting: tuple[RPGChallengeInternal, ...] = ()
    missed_by_choice: dict[str, list[str]] | None = None


def _token(*components: str) -> str:
    return sha256("\x00".join(components).encode("utf-8")).hexdigest()[:28]


def _displayable(item: KnowledgeItem) -> bool:
    try:
        for value in (item.term, item.definition, item.source_ref):
            _STUDY_TEXT.validate_python(value)
    except ValidationError:
        return False
    return True


def _review(state, token, question, game, knowledge):
    # Some older material stores contain duplicate definitions. A term and its
    # definition must both distinguish a foil from the target and the other foils.
    target = next((k for k in knowledge if k.knowledge_id == question.knowledge_id
                   and _displayable(k)), None)
    lesson = StudyLesson(term=target.term if target else question.study_term or (
                             "Chapter review" if game.question_language == "en" else "本章知识回顾"),
                         definition=question.hint if target and target.exam_question else (
                             target.definition if target else question.explanation),
                         source_ref=question.source_ref)
    peers = []
    if target is not None:
        seen_terms, seen_meanings = {key(target.term)}, {key(target.definition)}
        # Rotate across defeats, but keep the same exercise and option positions
        # when a player refreshes, equips an item or opens a hint.
        chapter = {q.knowledge_id for q in game.scenes[state.stage_index].challenges}
        published_clues = {key(o.text) for o in question.options}
        published_labels = {key(term) for option in question.options for term in option.text.split(" → ")}

        def priority(item):
            group = 0 if item.knowledge_id in chapter else 1 if item.knowledge_id in state.concepts else 2
            return group, _token(state.session_id, str(state.defeats), question.challenge_id, item.knowledge_id)

        ordered = sorted(knowledge, key=priority)
        for item in ordered:
            term, meaning = key(item.term), key(item.definition)
            if item.knowledge_id not in state.concepts and len(peers) >= 2:
                break
            # A one-target campaign still has distractors in its published
            # question. Resolve those to their material records when possible;
            # never introduce an unrelated, unselected topic during camp.
            if item.knowledge_id not in state.concepts and term not in published_labels and meaning not in published_clues:
                continue
            if (item.knowledge_id == target.knowledge_id or term in seen_terms
                    or meaning in seen_meanings or not _displayable(item)):
                continue
            seen_terms.add(term)
            seen_meanings.add(meaning)
            peers.append(item)
            if len(peers) == 3:
                break
    if len(peers) >= 2 and not target.exam_question:
        # Prefer the reverse direction to the published challenge. Long definitions
        # remain intact on the study card, while compact terms fit the choice buttons.
        names_on_board = {key(o.text) for o in question.options}
        choices_are_terms = (key(target.definition) in names_on_board or
                             any(len(k.definition) > 200 for k in [target, *peers]))
        if choices_are_terms:
            text = "补给站的索引卡缺少标题。请根据这条资料说明选出标题：\n" + target.definition
            if game.question_language == "en":
                text = "Which term belongs to this entry?\n" + target.definition
            values = [(k.knowledge_id, k.term) for k in [target, *peers]]
        else:
            text = f"为「{target.term}」修复档案页。哪一条记录与本章讲义相符？"
            if game.question_language == "en":
                text = f"Restore the entry for “{target.term}”. Which description fits?"
            values = [(k.knowledge_id, k.definition) for k in [target, *peers]]
        correct_key = target.knowledge_id
    else:
        # Previously published games can outlive a rich extraction record.
        # Their validated choices still form a sound exercise when the reference
        # sheet supplies fewer than two independently distinguishable distractors.
        text = "补给站交回一份待核对的作业。先读资料摘记，再重新判断：\n" + question.prompt
        if game.question_language == "en":
            text = "Use the field note to solve this problem again:\n" + question.prompt
        values = [(o.id, o.text) for o in question.options]
        correct_key = question.correct_option_id
    # The material roster is available to its owner, so a public turn ID and
    # knowledge ID alone must not encode the answer to a camp exercise.
    options = [BattleOption(id="bo_" + _token(state.camp_key, token, ident), text=value) for ident, value in values]
    answer = "bo_" + _token(state.camp_key, token, correct_key)
    options.sort(key=lambda o: _token(token, o.id))
    tip = question.hint if game.question_language else "留意资料里的动作、对象和条件，再逐项比较。"
    return Exam(BattlePrompt(prompt_id=token, text=text, options=options,
                             hint=tip if state.hinted else None), answer, tip, question, lesson)


def question_mode(floor, width, *, sequenced=False):
    if floor <= 1:
        return "recognition"
    # Keep a spare clue so successive rounds ask for different combinations.
    # Existing saves retain their original option tuples until the next floor.
    if floor <= 3 or width < (3 if sequenced else 2):
        return "recall"
    if floor <= 6 or width < (4 if sequenced else 3):
        return "paired"
    return "synthesis"


def _tower_exam(state, token, question, scene, knowledge):
    floor = state.expedition.tower_floor
    sequenced = bool(getattr(state.expedition, "tower_questions", ()))
    mode = question_mode(floor, len(scene.challenges), sequenced=sequenced)
    seed = (state.camp_key, token)
    fields = [question]
    records = {k.knowledge_id: k for k in knowledge if _displayable(k)}
    if mode in {"paired", "synthesis"}:
        if sequenced:
            position = scene.challenges.index(question)
            peers = scene.challenges[position + 1:] + scene.challenges[:position]
        else:
            peers = sorted((q for q in scene.challenges if q.knowledge_id != question.knowledge_id),
                           key=lambda q: _token(*seed, q.challenge_id))
        fields += peers[:1 if mode == "paired" else 2]
    hints = "\n".join(q.hint for q in fields)
    right = [next(o.text for o in q.options if o.id == q.correct_option_id) for q in fields]
    wrong = [sorted([o.text for o in q.options if o.id != q.correct_option_id],
                    key=lambda value: _token(*seed, str(i), value)) for i, q in enumerate(fields)]
    text = question.prompt
    # Reverse retrieval with independently distinguishable terms and definitions.
    # Only concepts already published for this floor can appear as new options.
    if mode == "recall" and question.knowledge_id in records and not records[question.knowledge_id].exam_question:
        target = records[question.knowledge_id]
        terms, meanings, distractors = {key(target.term)}, {key(target.definition)}, []
        for q in scene.challenges:
            other = records.get(q.knowledge_id)
            if other and key(other.term) not in terms and key(other.definition) not in meanings:
                terms.add(key(other.term))
                meanings.add(key(other.definition))
                distractors.append(other.term)
        if len(distractors) >= 2:
            text, right, wrong = target.definition, [target.term], [distractors]
    if len(fields) == 1:
        options = [[right[0]], *[[value] for value in wrong[0][:2 if mode == "recognition" else 3]]]
    else:
        # Each distractor preserves all other correct bindings. A player must
        # solve each requested clue to distinguish the right tuple.
        options = [right]
        for i in range(len(fields)):
            foil = right.copy()
            foil[i] = wrong[i][0]
            options.append(foil)
        if len(options) == 3:
            options.append([foils[-1] for foils in wrong])
        text = "\n\n".join(f"{'①②③'[i]} {q.prompt}" for i, q in enumerate(fields))
    entries, missed = [], {}
    for i, row in enumerate(options):
        ident = "to_" + _token(*seed, str(i))
        label = row[0] if len(row) == 1 else "\n".join(f"{'①②③'[j]} {value}" for j, value in enumerate(row))
        entries.append(BattleOption(id=ident, text=label))
        missed[ident] = [q.knowledge_id for j, q in enumerate(fields) if row[j] != right[j]]
    answer = entries[0].id
    entries.sort(key=lambda o: _token(*seed, o.id))
    return Exam(BattlePrompt(prompt_id=token, text=text, options=entries, hint=hints if state.hinted else None),
                answer, hints, question, supporting=tuple(fields), missed_by_choice=missed)


def active_exam(state: BattleState, game: RPGGameInternal, knowledge: list[KnowledgeItem]) -> Exam | None:
    if state.phase not in {"combat", "sidequest"}:
        return None
    questions = game.scenes[state.stage_index].challenges
    if state.phase == "sidequest":
        kid = state.review_queue[state.review_index]
        q = next(q for q in questions if q.knowledge_id == kid)
    elif state.pending:
        q = next(q for q in questions if q.challenge_id == state.pending[0])
    else:
        q = questions[state.finishing_turn % len(questions)]
    # Options of a newly drawn camp exercise cannot be applied to an older turn.
    token = "turn_" + _token(state.session_id, state.phase, str(state.prompt_serial), q.challenge_id)
    if game.question_language and (state.phase == "sidequest" or (state.expedition and state.expedition.tower_floor)):
        # Unselected source records can be in the opposite language. Use the immutable
        # teaching copy from publication so camp/tower never retranslates a save.
        published = {c.knowledge_id: c for s in game.scenes for c in s.challenges}
        roster = []
        for item in knowledge:
            record = published.get(item.knowledge_id)
            if record and record.study_term and record.study_definition:
                roster.append(item.model_copy(update={"term": record.study_term, "definition": record.study_definition}))
            elif accepts(item.term, game.question_language) and accepts(item.definition, game.question_language):
                roster.append(item)
        knowledge = roster
    if state.phase == "sidequest":
        return _review(state, token, q, game, knowledge)
    if state.expedition and state.expedition.tower_floor:
        return _tower_exam(state, token, q, game.scenes[state.stage_index], knowledge)
    options = [BattleOption(id=o.id, text=o.text) for o in q.options]
    return Exam(BattlePrompt(prompt_id=token, text=q.prompt, options=options,
                             hint=q.hint if state.hinted else None), q.correct_option_id, q.hint, q)
