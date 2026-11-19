"""Authoritative RPG moves and recovery from the ordered session event stream."""

import json
from datetime import datetime, timezone
from sqlite3 import Connection, Row
from uuid import uuid4

from fastapi import HTTPException
from pydantic import TypeAdapter

from .games import read_rpg_internal
from .models import (
    AttemptChallenge, RequestHint, RPGActionFeedback, RPGActionInput, RPGActionResult,
    RPGChallengeInternal, RPGGameInternal, RPGProgress, RPGSceneInternal,
)


ACTION = TypeAdapter(RPGActionInput)


def _session(conn: Connection, session_id: str) -> Row:
    row = conn.execute(
        """SELECT s.id, s.game_id, s.status, s.created_at, s.finished_at, g.game_type
           FROM sessions s JOIN games g ON g.id = s.game_id WHERE s.id = ?""",
        (session_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(404, "未找到这次游戏记录。")
    if row["game_type"] != "rpg_quest":
        raise HTTPException(409, "这次记录属于配对游戏，请使用配对会话入口。")
    return row


def _initial(session: Row, game: RPGGameInternal) -> RPGProgress:
    start = datetime.fromisoformat(session["created_at"])
    end = (datetime.fromisoformat(session["finished_at"]) if session["finished_at"]
           else datetime.now(timezone.utc))
    return RPGProgress(
        session_id=session["id"], game_id=session["game_id"], status=session["status"],
        started_at=session["created_at"], elapsed_seconds=max(0, int((end - start).total_seconds())),
        revision=0, current_scene_id=game.start_scene_id, unlocked_scene_ids=[game.start_scene_id],
        accepted_quest_ids=[], completed_quest_ids=[], resolved_challenge_ids=[],
        passed_challenge_ids=[], remediated_challenge_ids=[], challenge_attempts={},
        hints_by_challenge={}, revealed_hints={}, xp=0, inventory=[],
        all_quests_completed=False, last_feedback=None,
    )


def create_rpg_session(conn: Connection, game_id: str) -> RPGProgress:
    game = read_rpg_internal(conn, game_id)
    session_id = uuid4().hex
    conn.execute("INSERT INTO sessions (id,game_id,status) VALUES (?,?,'active')",
                 (session_id, game_id))
    return _initial(_session(conn, session_id), game)


def _require_current_question(action: AttemptChallenge | RequestHint, scene: RPGSceneInternal,
                              game: RPGGameInternal, progress: RPGProgress) -> RPGChallengeInternal:
    question = next((q for s in game.scenes for q in s.challenges
                     if q.challenge_id == action.challenge_id), None)
    if question is None:
        raise HTTPException(422, "请使用本局的题目标识。")
    if action.action == "attempt" and action.option_id not in {o.id for o in question.options}:
        raise HTTPException(422, "请选择这道题提供的选项。")
    if scene.quest.quest_id not in progress.accepted_quest_ids:
        raise HTTPException(409, "请先接受当前场景的任务。")
    pending = next((key for key in scene.quest.challenge_ids
                    if key not in progress.resolved_challenge_ids), None)
    if action.challenge_id != pending:
        raise HTTPException(409, "请按当前任务的顺序完成下一道题。")
    return question


def _grade_action(progress: RPGProgress, scene: RPGSceneInternal, question: RPGChallengeInternal,
                  correct: bool) -> RPGActionFeedback:
    key = question.challenge_id
    count = progress.challenge_attempts.get(key, 0) + 1
    progress.challenge_attempts[key] = count
    if not correct and count == 1:
        return RPGActionFeedback(
            challenge_id=key, correct=False, reward_delta=0,
            message="再试一次。对照任务目标，逐项比较选项的特征。",
        )

    reward = 0
    if correct:
        progress.passed_challenge_ids.append(key)
        reward = 10 if count == 1 and key not in progress.hints_by_challenge else 6
        message = question.success_text
    else:
        progress.remediated_challenge_ids.append(key)
        message = question.remediation_text
    progress.resolved_challenge_ids.append(key)
    quest = scene.quest
    if all(q in progress.resolved_challenge_ids for q in quest.challenge_ids):
        progress.completed_quest_ids.append(quest.quest_id)
        reward += 20
        progress.inventory.append(quest.reward.item)
        if scene.next_scene_id is None:
            progress.all_quests_completed = True
        else:
            progress.unlocked_scene_ids.append(scene.next_scene_id)
    progress.xp += reward
    return RPGActionFeedback(
        challenge_id=key, correct=correct, message=message, explanation=question.explanation,
        source_ref=question.source_ref, revealed_option_id=question.correct_option_id,
        reward_delta=reward, remediated=not correct,
    )


def _advance(game: RPGGameInternal, progress: RPGProgress, action: RPGActionInput,
             *, recorded_correct: bool | None = None) -> tuple[RPGActionFeedback, str | None]:
    """Apply one ordered move. Only grading a new attempt consults the private answer."""
    if action.action == "enter_scene":
        if action.scene_id not in {s.scene_id for s in game.scenes}:
            raise HTTPException(422, "请选择本局的场景。")
        if action.scene_id not in progress.unlocked_scene_ids:
            raise HTTPException(409, "完成前一个场景的任务后即可进入。")
        progress.current_scene_id = action.scene_id
        return RPGActionFeedback(message="已进入场景。", reward_delta=0), None

    scene = next(s for s in game.scenes if s.scene_id == progress.current_scene_id)
    if action.action == "accept_quest":
        if action.quest_id not in {s.quest.quest_id for s in game.scenes}:
            raise HTTPException(422, "请选择本局的任务。")
        if action.quest_id != scene.quest.quest_id:
            raise HTTPException(409, "请先进入任务所在的场景。")
        if action.quest_id not in progress.accepted_quest_ids:
            progress.accepted_quest_ids.append(action.quest_id)
        return RPGActionFeedback(message="已接受任务。", reward_delta=0), None

    question = _require_current_question(action, scene, game, progress)
    key = question.challenge_id
    if action.action == "hint":
        if key in progress.hints_by_challenge:
            raise HTTPException(409, "已领取本题提示，可从会话记录再次查看。")
        progress.hints_by_challenge[key] = 1
        progress.revealed_hints[key] = question.hint
        feedback = RPGActionFeedback(
            challenge_id=key, hint=question.hint, message="已领取本题提示。", reward_delta=0,
        )
    else:
        correct = (action.option_id == question.correct_option_id
                   if recorded_correct is None else recorded_correct)
        feedback = _grade_action(progress, scene, question, correct)
    progress.last_feedback = feedback
    return feedback, question.knowledge_id


def _rebuild(conn: Connection, session: Row, game: RPGGameInternal) -> RPGProgress:
    progress = _initial(session, game)
    for event in conn.execute(
        "SELECT seq,payload_json,correct FROM rpg_events WHERE session_id=? ORDER BY seq",
        (session["id"],),
    ):
        correct = None if event["correct"] is None else bool(event["correct"])
        _advance(game, progress, ACTION.validate_json(event["payload_json"]), recorded_correct=correct)
        progress.revision = event["seq"]
    return progress


def read_rpg_progress(conn: Connection, session_id: str) -> RPGProgress:
    session = _session(conn, session_id)
    return _rebuild(conn, session, read_rpg_internal(conn, session["game_id"]))


def apply_rpg_action(conn: Connection, session_id: str, action: RPGActionInput) -> RPGActionResult:
    """The caller holds BEGIN IMMEDIATE from replay lookup through response persistence."""
    session = _session(conn, session_id)
    prior = conn.execute(
        "SELECT payload_json,result_json FROM rpg_events WHERE session_id=? AND event_id=?",
        (session_id, action.event_id),
    ).fetchone()
    if prior is not None:
        if json.loads(prior["payload_json"]) != action.model_dump(mode="json"):
            raise HTTPException(409, "该事件标识已用于另一个动作。")
        return RPGActionResult.model_validate_json(prior["result_json"])
    if session["status"] != "active":
        raise HTTPException(409, "这局游戏已经结束，可以开始新一局。")

    game = read_rpg_internal(conn, session["game_id"])
    progress = _rebuild(conn, session, game)
    feedback, knowledge_id = _advance(game, progress, action)
    seq = conn.execute(
        """INSERT INTO rpg_events(session_id,event_id,kind,payload_json,knowledge_id,correct,result_json)
           VALUES(?,?,?,?,?,?,'{}')""",
        (session_id, action.event_id, action.action, action.model_dump_json(),
         knowledge_id, feedback.correct),
    ).lastrowid
    progress.revision = seq
    result = RPGActionResult(event_id=action.event_id, action=action.action,
                             feedback=feedback, progress=progress)
    conn.execute("UPDATE rpg_events SET result_json=? WHERE seq=?", (result.model_dump_json(), seq))
    return result
