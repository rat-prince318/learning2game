"""Learning measures derived from persisted RPG actions, independent of narrative feedback."""

from sqlite3 import Connection

from fastapi import HTTPException

from ..models import MaterialResult
from .games import read_rpg_internal
from .models import RPGConceptPerformance, RPGLearningReport
from .sessions import _rebuild, _session


def evaluate_rpg_learning(conn: Connection, session_id: str) -> RPGLearningReport:
    session = _session(conn, session_id)
    game = read_rpg_internal(conn, session["game_id"])
    progress = _rebuild(conn, session, game)
    material = conn.execute(
        """SELECT m.result_json FROM games g JOIN plans p ON p.id=g.plan_id
           JOIN materials m ON m.id=p.material_id WHERE g.id=?""", (session["game_id"],),
    ).fetchone()
    terms = {}
    if material and material["result_json"]:
        knowledge = MaterialResult.model_validate_json(material["result_json"]).knowledge
        terms = {item.knowledge_id: item.term for item in knowledge}

    concepts = []
    for scene in game.scenes:
        for question in scene.challenges:
            key = question.challenge_id
            attempts = progress.challenge_attempts.get(key, 0)
            passed = key in progress.passed_challenge_ids
            concepts.append(RPGConceptPerformance(
                knowledge_id=question.knowledge_id,
                term=question.study_term or terms.get(question.knowledge_id, question.knowledge_id),
                attempts=attempts, mistakes=attempts - int(passed),
                first_attempt_correct=(passed and attempts == 1) if attempts else None,
                hints=progress.hints_by_challenge.get(key, 0), passed=passed,
                resolved=key in progress.resolved_challenge_ids,
                remediated=key in progress.remediated_challenge_ids,
                explanation=question.explanation, source_ref=question.source_ref,
            ))

    attempted = [c for c in concepts if c.attempts]
    attempts = sum(c.attempts for c in attempted)
    correct = len(progress.passed_challenge_ids)
    resolved = len(progress.resolved_challenge_ids)
    return RPGLearningReport(
        session_id=session_id, game_id=session["game_id"], question_language=game.question_language,
        elapsed_seconds=progress.elapsed_seconds,
        finish_reason="completed" if progress.all_quests_completed else "exited",
        total_challenges=len(concepts), resolved_challenges=resolved, correct_challenges=correct,
        remediated_challenges=len(progress.remediated_challenge_ids), total_quests=len(game.scenes),
        completed_quests=len(progress.completed_quest_ids), xp=progress.xp, inventory=progress.inventory,
        valid_attempts=attempts, correct_attempts=correct, mistakes=attempts - correct,
        attempted_concepts=len(attempted),
        untouched_concepts=[c.knowledge_id for c in concepts if not c.attempts],
        first_attempt_accuracy=(sum(c.first_attempt_correct is True for c in attempted) / len(attempted)
                                if attempted else None),
        overall_attempt_accuracy=correct / attempts if attempts else None,
        completion_rate=resolved / len(concepts),
        hints_by_concept={c.knowledge_id: c.hints for c in concepts},
        weak_knowledge_ids=[c.knowledge_id for c in concepts if not c.passed or c.mistakes or c.hints],
        concepts=concepts,
    )


def read_rpg_report(conn: Connection, session_id: str) -> RPGLearningReport:
    if _session(conn, session_id)["status"] != "finished":
        raise HTTPException(409, "请先结束本轮游戏，再查看报告。")
    row = conn.execute("SELECT stats_json FROM reports WHERE session_id=?", (session_id,)).fetchone()
    return RPGLearningReport.model_validate_json(row["stats_json"])


def finish_rpg_session(conn: Connection, session_id: str) -> RPGLearningReport:
    if _session(conn, session_id)["status"] == "finished":
        return read_rpg_report(conn, session_id)
    conn.execute(
        """UPDATE sessions SET status='finished', finished_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
           WHERE id=?""", (session_id,),
    )
    report = evaluate_rpg_learning(conn, session_id)
    conn.execute("INSERT INTO reports(session_id,stats_json) VALUES(?,?)",
                 (session_id, report.model_dump_json()))
    return report
