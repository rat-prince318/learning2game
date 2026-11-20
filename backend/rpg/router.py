"""RPG planning jobs and explicit confirmation on the shared course-material store."""

import json
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pydantic import Field, StrictBool, TypeAdapter

from ..db import connection
from ..models import Identifier, StrictModel
from ..pipeline import (
    FeedbackJob, GenerationJob, MaterialJob, OutputError, _execute, _knowledge,
    _services, insert_job,
)
from ..provider import call_service
from .games import store_rpg_game
from .models import GameRecommendation, RPGGameInternal, RPGPlan, RPGPreferences, StudyFeedback
from .reports import read_rpg_report
from .validation import RPGContentError, eligible

router = APIRouter(tags=["RPG learning workflow"])
GAME = "rpg_quest"
SERVICE_METHODS = ("recommend_game_type", "plan_rpg", "generate_rpg", "feedback_rpg")


class PlanRequest(StrictModel):
    material_id: Identifier
    preferences: RPGPreferences = Field(default_factory=RPGPreferences)


class ConfirmRequest(StrictModel):
    plan_id: Identifier
    confirmed: StrictBool


class PracticeRequest(StrictModel):
    preferences: RPGPreferences | None = None


def supported_games(services):
    if services is None:
        return []
    if all(callable(getattr(services, name, None)) for name in SERVICE_METHODS):
        return ["matching", GAME]
    return ["matching"]


def _require_rpg(app):
    if GAME not in supported_games(_services(app)):
        raise HTTPException(503, "当前服务提供配对练习。请启用支持 RPG 的服务配置。")


def _service(job, name, *args):
    try:
        return call_service(job.app, name, *args, tool_trace=job.tools)
    except RPGContentError as exc:
        raise OutputError(str(exc)) from None


def _recommend(job, material_id, knowledge, prefs, available):
    with job.stage("planning"):
        if GAME in available:
            recommendation = GameRecommendation.model_validate(
                _service(job, "recommend_game_type", knowledge, prefs))
        else:
            recommendation = GameRecommendation(
                recommended_type="matching", supported_types=available,
                rationale="当前服务支持配对练习，可用讲义中的术语和释义建立对应关系。",
                warnings=[])
        if set(recommendation.supported_types) != set(available):
            raise OutputError("推荐结果与当前可用玩法不一致，请重试。")
    with connection(job.app, write=True) as conn:
        job.complete(conn, {"material_id": material_id, "recommendation": recommendation.model_dump()})


@router.post("/game-recommendations", status_code=202, response_model=MaterialJob)
def recommend(body: PlanRequest, request: Request, tasks: BackgroundTasks):
    available = supported_games(_services(request.app))
    with connection(request.app, write=True) as conn:
        knowledge = _knowledge(conn, body.material_id).knowledge
        job_id = insert_job(conn, "planning", body.material_id, request.app.state.mode)
    tasks.add_task(_execute, request.app, job_id, _recommend, body.material_id, knowledge,
                   body.preferences, available)
    return MaterialJob(material_id=body.material_id, job_id=job_id)


def _make_plan(job, material_id, material, prefs, scope, practice_session_id, previous_report):
    with job.stage("planning"):
        proposal = _service(job, "plan_rpg", material.knowledge, prefs, previous_report)
    with job.stage("validating"):
        plan = RPGPlan.model_validate(proposal)
        minimum = 1 if previous_report else 3
        if (not set(plan.knowledge_ids).issubset(scope)
                or (prefs.selected_knowledge_ids is not None and set(plan.knowledge_ids) != set(scope))
                or not minimum <= plan.challenge_count <= prefs.challenge_count
                or plan.scene_count > prefs.scene_count
                or any(getattr(plan, f) != getattr(prefs, f)
                       for f in ("difficulty", "learner_level", "theme", "goal", "question_language"))):
            raise OutputError("方案与选定的范围或偏好不一致，请重新规划。")
        warnings = list(dict.fromkeys([*plan.warnings, *material.warnings]))
        plan = RPGPlan.model_validate({**plan.model_dump(), "warnings": warnings[:12]})
    plan_id = uuid4().hex
    with connection(job.app, write=True) as conn:
        conn.execute("INSERT INTO plans(id,material_id,config_json,preferences_json,scope_json,"
                     "practice_session_id,game_type) VALUES(?,?,?,?,?,?,?)",
                     (plan_id, material_id, plan.model_dump_json(), prefs.model_dump_json(),
                      json.dumps(scope), practice_session_id, GAME))
        job.complete(conn, {"material_id": material_id, "game_type": GAME, "plan_id": plan_id,
                            "plan": plan.model_dump()}, status="awaiting_confirmation")


def _queue_plan(app, tasks, conn, material_id, prefs, session_id=None, report=None):
    _require_rpg(app)
    material = _knowledge(conn, material_id)
    available = [item.knowledge_id for item in eligible(material.knowledge)]
    scope = [key for key in available if key in report.weak_knowledge_ids] if report else available
    if prefs.selected_knowledge_ids is not None:
        if not set(prefs.selected_knowledge_ids).issubset(scope):
            raise HTTPException(422, "请选择当前资料与本轮复习范围内的知识点。")
        scope = prefs.selected_knowledge_ids
        if len(scope) > prefs.challenge_count:
            raise HTTPException(422, "请将题量调至选中知识点的数量，或减少选中的知识点。")
    if report is None and min(len(scope), prefs.challenge_count) < 3:
        raise HTTPException(422, "常规 RPG 需要至少三个有出处的知识点。请扩大范围、补充资料或选择配对练习。")
    job_id = insert_job(conn, "practice" if report else "planning", session_id or material_id, app.state.mode, GAME)
    tasks.add_task(_execute, app, job_id, _make_plan, material_id, material, prefs, scope, session_id, report)
    return MaterialJob(material_id=material_id, job_id=job_id)


@router.post("/rpg/plans", status_code=202, response_model=MaterialJob)
def request_plan(body: PlanRequest, request: Request, tasks: BackgroundTasks):
    with connection(request.app, write=True) as conn:
        return _queue_plan(request.app, tasks, conn, body.material_id, body.preferences)


def _generate(job, plan_id, knowledge, plan, previous):
    with job.stage("generating"):
        proposal = _service(job, "generate_rpg", knowledge, plan, previous)
    with job.stage("validating"):
        game = RPGGameInternal.model_validate(proposal)
    with connection(job.app, write=True) as conn:
        game_id = store_rpg_game(conn, game, plan_id)
        conn.execute("UPDATE plans SET game_id=? WHERE id=?", (game_id, plan_id))
        job.complete(conn, {"game_type": GAME, "game_id": game_id, "plan_id": plan_id})


@router.post("/rpg/games", status_code=202, response_model=GenerationJob)
def confirm(body: ConfirmRequest, request: Request, tasks: BackgroundTasks):
    if not body.confirmed:
        raise HTTPException(422, "请先确认 RPG 方案。")
    with connection(request.app, write=True) as conn:
        row = conn.execute("SELECT p.*,j.status AS job_status FROM plans p "
                           "LEFT JOIN jobs j ON p.game_job_id=j.id WHERE p.id=?", (body.plan_id,)).fetchone()
        if row is None:
            raise HTTPException(404, "找不到这份方案。")
        if row["game_type"] != GAME:
            raise HTTPException(409, "请从配对练习入口确认这份方案。")
        if row["game_job_id"] and row["job_status"] != "failed":
            return GenerationJob(plan_id=body.plan_id, job_id=row["game_job_id"])
        _require_rpg(request.app)
        plan = RPGPlan.model_validate_json(row["config_json"])
        if not set(plan.knowledge_ids).issubset(json.loads(row["scope_json"])):
            raise HTTPException(409, "请重新生成与复习范围一致的方案。")
        knowledge = _knowledge(conn, row["material_id"]).knowledge
        previous = None
        if row["practice_session_id"]:
            original = conn.execute("SELECT g.internal_json FROM games g JOIN sessions s ON s.game_id=g.id "
                                    "WHERE s.id=?", (row["practice_session_id"],)).fetchone()
            previous = RPGGameInternal.model_validate_json(original["internal_json"])
        job_id = insert_job(conn, "generation", body.plan_id, request.app.state.mode, GAME)
        conn.execute("UPDATE plans SET game_job_id=?,confirmed_at=coalesce(confirmed_at,"
                     "strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id=?", (job_id, body.plan_id))
    tasks.add_task(_execute, request.app, job_id, _generate, body.plan_id, knowledge, plan, previous)
    return GenerationJob(plan_id=body.plan_id, job_id=job_id)


def _round(conn, session_id):
    report = read_rpg_report(conn, session_id)
    row = conn.execute("SELECT p.material_id,p.preferences_json FROM sessions s JOIN games g ON g.id=s.game_id "
                       "JOIN plans p ON p.id=g.plan_id WHERE s.id=?", (session_id,)).fetchone()
    return row, report


@router.post("/rpg/sessions/{session_id}/practice", status_code=202, response_model=MaterialJob)
def practice(session_id: str, request: Request, tasks: BackgroundTasks, body: PracticeRequest | None = None):
    with connection(request.app, write=True) as conn:
        row, report = _round(conn, session_id)
        if not report.weak_knowledge_ids:
            raise HTTPException(409, "本轮知识点均已独立答对，可开始新的范围。")
        prefs = body.preferences if body and body.preferences else None
        if prefs is None:
            prefs = RPGPreferences.model_validate_json(row["preferences_json"]).model_copy(update={
                "selected_knowledge_ids": None, "challenge_count": len(report.weak_knowledge_ids)})
        return _queue_plan(request.app, tasks, conn, row["material_id"], prefs, session_id, report)


def _feedback(job, session_id, report, knowledge):
    with job.stage("writing_feedback"):
        text = TypeAdapter(StudyFeedback).validate_python(_service(job, "feedback_rpg", report, knowledge))
    with connection(job.app, write=True) as conn:
        conn.execute("UPDATE reports SET feedback=? WHERE session_id=?", (text, session_id))
        job.complete(conn, {"session_id": session_id, "game_type": GAME, "feedback": text})


@router.post("/rpg/sessions/{session_id}/feedback", status_code=202, response_model=FeedbackJob)
def feedback(session_id: str, request: Request, tasks: BackgroundTasks):
    with connection(request.app, write=True) as conn:
        row, report = _round(conn, session_id)
        last = conn.execute("SELECT id,status FROM jobs WHERE kind='feedback' AND resource_id=? "
                            "ORDER BY rowid DESC LIMIT 1", (session_id,)).fetchone()
        if last and last["status"] != "failed":
            return FeedbackJob(session_id=session_id, job_id=last["id"])
        _require_rpg(request.app)
        knowledge = _knowledge(conn, row["material_id"], for_generation=False).knowledge
        job_id = insert_job(conn, "feedback", session_id, request.app.state.mode, GAME)
    tasks.add_task(_execute, request.app, job_id, _feedback, session_id, report, knowledge)
    return FeedbackJob(session_id=session_id, job_id=job_id)
