"""Persist extraction, planning and generation as individually observable jobs."""

import json
import logging
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from time import perf_counter
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, FastAPI, HTTPException, Request
from matching_agent.errors import AgentError
from pydantic import Field, StrictBool, ValidationError

from .db import connection
from .games import store_game
from .models import (
    GameConfigInternal, Identifier, KnowledgeItem, LearningReport, MatchingPlan,
    MaterialResult, StrictModel, UserPreferences,
)
from .provider import ToolCall, call_service

router = APIRouter(tags=["Generation workflow"])
log = logging.getLogger("uvicorn.error")
_NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"


class PlanRequest(StrictModel):
    material_id: Identifier
    preferences: UserPreferences = Field(default_factory=UserPreferences)


class ConfirmRequest(StrictModel):
    plan_id: Identifier
    confirmed: StrictBool
    plan: MatchingPlan | None = None


class PracticeRequest(StrictModel):
    preferences: UserPreferences | None = None


class MaterialJob(StrictModel):
    material_id: Identifier
    job_id: Identifier


class GenerationJob(StrictModel):
    plan_id: Identifier
    job_id: Identifier


class FeedbackJob(StrictModel):
    session_id: Identifier
    job_id: Identifier


class JobResult(StrictModel):
    material_id: str | None = None
    knowledge_count: int | None = None
    plan_id: str | None = None
    plan: MatchingPlan | None = None
    game_id: str | None = None
    session_id: str | None = None
    feedback: str | None = None


class JobStatus(StrictModel):
    job_id: str
    kind: Literal["extraction", "planning", "generation", "practice", "feedback"]
    status: Literal["queued", "extracting", "planning", "awaiting_confirmation", "generating",
                    "validating", "writing_feedback", "completed", "failed"]
    mode: str
    resource_id: str
    result: JobResult | None
    error: str | None
    stages_ms: dict[str, float]
    tool_calls: list[ToolCall]
    created_at: str
    updated_at: str


def insert_job(conn: sqlite3.Connection, kind: str, resource_id: str, mode: str) -> str:
    job_id = uuid4().hex
    conn.execute("INSERT INTO jobs(id,kind,resource_id,mode,status) VALUES(?,?,?,?,'queued')",
                 (job_id, kind, resource_id, mode))
    return job_id


def _services(app):
    if app.state.services is None:
        raise HTTPException(503, "Material and agent services are not configured")
    return app.state.services


class OutputError(Exception):
    """A known, user-safe explanation of a rejected service result."""


class _Progress:
    def __init__(self, app: FastAPI, job_id: str):
        self.app = app
        self.id = job_id
        self.times: dict[str, float] = {}
        self.tools: list[dict] = []

    @contextmanager
    def stage(self, name: str):
        with connection(self.app, write=True) as conn:
            conn.execute(f"UPDATE jobs SET status=?,stages_json=?,tools_json=?,updated_at={_NOW} WHERE id=?",
                         (name, json.dumps(self.times), json.dumps(self.tools), self.id))
        started = perf_counter()
        try:
            yield
        finally:
            self.times[name] = round((perf_counter() - started) * 1000, 3)

    def complete(self, conn, result: dict, status: str = "completed"):
        # Commit the result and the corresponding material/plan/game in one transaction.
        conn.execute(f"UPDATE jobs SET status=?,result_json=?,stages_json=?,tools_json=?,updated_at={_NOW} WHERE id=?",
                     (status, json.dumps(result, ensure_ascii=False), json.dumps(self.times),
                      json.dumps(self.tools), self.id))


def _execute(app, job_id, operation, *args):
    progress = _Progress(app, job_id)
    try:
        operation(progress, *args)
        return
    except OutputError as exc:
        message = str(exc)
    except AgentError as exc:
        # A may attach internal validation details. Publish only known static guidance.
        explanations = {
            "missing_api_key": "请在后端配置出题模型的 API 凭证，或切换为本地模式。",
            "model_request_rejected": "请检查后端配置的模型名、凭证和工具调用权限。",
            "model_unavailable": "模型服务繁忙，请稍后重试。",
            "model_timeout": "模型响应超时，请稍后重试或减少本轮题量。",
            "insufficient_knowledge": "可用知识点较少，请调低题量或增加带定义与出处的资料。",
            "game_quality": "卡片校验需要更清楚的证据，请调整知识点或改用另一段资料。",
        }
        message = explanations.get(exc.code, "模型返回的内容需要重新核验，请重试本步或调整方案。")
    except TimeoutError:
        message = "The service timed out. Retry this operation."
    except ValidationError:
        message = "The service returned data that failed the shared schema checks."
    except Exception:
        # Integration exceptions may include course content, local paths or credentials.
        message = "The operation failed. Check the service configuration and retry."
    log.warning("EduGame job %s (%s) failed: %s", job_id, operation.__name__, message)
    with connection(app, write=True) as conn:
        conn.execute(f"UPDATE jobs SET status='failed',error=?,stages_json=?,tools_json=?,updated_at={_NOW} WHERE id=?",
                     (message, json.dumps(progress.times), json.dumps(progress.tools), job_id))


def _material(conn, material_id):
    row = conn.execute("SELECT * FROM materials WHERE id=?", (material_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "Material not found")
    return row


def _knowledge(conn, material_id) -> MaterialResult:
    row = _material(conn, material_id)
    if row["result_json"] is None:
        raise HTTPException(409, "Knowledge is unavailable. Check the extraction job.")
    return MaterialResult.model_validate_json(row["result_json"])


def _extract(job: _Progress, material_id: str):
    from .material_adapter import MaterialError

    with connection(job.app) as conn:
        row = _material(conn, material_id)
        path = Path(row["path"])
        options = {**json.loads(row["options_json"]), "original_name": row["original_name"]}
    with job.stage("extracting"):
        try:
            if callable(getattr(job.app.state.services, "extract_options", None)):
                extracted = call_service(job.app, "extract_options", path, options, tool_trace=job.tools)
            else:
                extracted = call_service(job.app, "extract", path, tool_trace=job.tools)
        except MaterialError as exc:
            raise OutputError(str(exc)) from None
        except ValueError:
            if job.app.state.mode == "demo":
                raise OutputError("Demo mode accepts only the supplied sample handout.") from None
            raise
    with job.stage("validating"):
        material = MaterialResult.model_validate(extracted)
    with connection(job.app, write=True) as conn:
        conn.execute("UPDATE materials SET result_json=? WHERE id=?", (material.model_dump_json(), material_id))
        job.complete(conn, {"material_id": material_id, "knowledge_count": len(material.knowledge)})


def run_extraction(app, job_id: str, material_id: str):
    _execute(app, job_id, _extract, material_id)


@router.get("/jobs/{job_id}", response_model=JobStatus, response_model_exclude_unset=True)
def get_job(job_id: str, request: Request):
    with connection(request.app) as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "Job not found")
    return {"job_id": job_id, "kind": row["kind"], "status": row["status"], "mode": row["mode"],
            "resource_id": row["resource_id"],
            "result": json.loads(row["result_json"]) if row["result_json"] else None, "error": row["error"],
            "stages_ms": json.loads(row["stages_json"]), "tool_calls": json.loads(row["tools_json"]),
            "created_at": row["created_at"], "updated_at": row["updated_at"]}


@router.get("/materials/{material_id}/knowledge", response_model=MaterialResult)
def material_knowledge(material_id: str, request: Request):
    with connection(request.app) as conn:
        return _knowledge(conn, material_id)


@router.post("/materials/{material_id}/retry", status_code=202, response_model=MaterialJob)
def retry_extraction(material_id: str, request: Request, tasks: BackgroundTasks):
    with connection(request.app, write=True) as conn:
        _material(conn, material_id)
        last = conn.execute("SELECT id,status FROM jobs WHERE kind='extraction' AND resource_id=? "
                            "ORDER BY rowid DESC LIMIT 1", (material_id,)).fetchone()
        if last and last["status"] != "failed":
            return {"material_id": material_id, "job_id": last["id"]}
        _services(request.app)
        job_id = insert_job(conn, "extraction", material_id, request.app.state.mode)
    tasks.add_task(run_extraction, request.app, job_id, material_id)
    return {"material_id": material_id, "job_id": job_id}


def _make_plan(job, material_id: str, knowledge: list[KnowledgeItem], prefs: UserPreferences,
               practice_session_id: str | None, single_weak: bool):
    with job.stage("planning"):
        proposal = call_service(job.app, "plan", knowledge, prefs, tool_trace=job.tools)
    with job.stage("validating"):
        plan = MatchingPlan.model_validate(proposal)
        scope = [item.knowledge_id for item in knowledge]
        pair_count = min(len(knowledge), prefs.pair_count)
        if not set(plan.knowledge_ids).issubset(scope) or len(plan.knowledge_ids) != pair_count:
            raise OutputError("The proposed plan does not match the requested concepts or pair count.")
        notices = []
        if len(knowledge) < prefs.pair_count:
            notices.append(f"本轮可选知识点只有 {len(knowledge)} 个，已相应减少卡片数量。")
        if single_weak:
            notices.append("本轮包含一个待复习知识点，并从上一轮加入一个已完成的知识点作对照。")
        plan = plan.model_copy(update={"warnings": list(dict.fromkeys([*notices, *plan.warnings]))[:12]})
    plan_id = uuid4().hex
    with connection(job.app, write=True) as conn:
        conn.execute("INSERT INTO plans(id,material_id,config_json,preferences_json,scope_json,practice_session_id) "
                     "VALUES(?,?,?,?,?,?)", (plan_id, material_id, plan.model_dump_json(), prefs.model_dump_json(),
                                              json.dumps(scope), practice_session_id))
        job.complete(conn, {"material_id": material_id, "plan_id": plan_id, "plan": plan.model_dump()},
                     status="awaiting_confirmation")


def _queue_plan(app, tasks, conn, kind, resource_id, material_id, knowledge, prefs, *, single_weak=False):
    _services(app)
    if len(knowledge) < 2:
        raise HTTPException(422, "At least two extracted concepts are required to build a matching game")
    job_id = insert_job(conn, kind, resource_id, app.state.mode)
    tasks.add_task(_execute, app, job_id, _make_plan, material_id, knowledge, prefs,
                   resource_id if kind == "practice" else None, single_weak)
    return {"material_id": material_id, "job_id": job_id}


@router.post("/matching-plans", status_code=202, response_model=MaterialJob)
def request_plan(body: PlanRequest, request: Request, tasks: BackgroundTasks):
    with connection(request.app, write=True) as conn:
        knowledge = _knowledge(conn, body.material_id).knowledge
        return _queue_plan(request.app, tasks, conn, "planning", body.material_id, body.material_id,
                           knowledge, body.preferences)


def _generate(job, plan_id: str, knowledge: list[KnowledgeItem], plan: MatchingPlan,
              previous: GameConfigInternal | None):
    with job.stage("generating"):
        args = (knowledge, plan, previous) if previous else (knowledge, plan)
        proposal = call_service(job.app, "generate", *args, tool_trace=job.tools)
    with job.stage("validating"):
        game = GameConfigInternal.model_validate(proposal)
        sources = {item.knowledge_id: item.source_ref for item in knowledge}
        if {pair.knowledge_id for pair in game.pairs} != set(plan.knowledge_ids):
            raise OutputError("The generated cards do not cover exactly the confirmed concepts.")
        if any(pair.source_ref != sources[pair.knowledge_id] for pair in game.pairs):
            raise OutputError("A generated card does not reference its extracted source.")
    with connection(job.app, write=True) as conn:
        game_id = store_game(conn, game, plan_id)
        conn.execute("UPDATE plans SET game_id=? WHERE id=?", (game_id, plan_id))
        job.complete(conn, {"game_id": game_id, "plan_id": plan_id})


@router.post("/games", status_code=202, response_model=GenerationJob)
def confirm_plan(body: ConfirmRequest, request: Request, tasks: BackgroundTasks):
    if not body.confirmed:
        raise HTTPException(422, "Confirm the matching plan before generating a game")
    with connection(request.app, write=True) as conn:
        row = conn.execute("SELECT p.*,j.status AS game_status FROM plans p "
                           "LEFT JOIN jobs j ON j.id=p.game_job_id WHERE p.id=?", (body.plan_id,)).fetchone()
        if row is None:
            raise HTTPException(404, "Plan not found")
        saved = MatchingPlan.model_validate_json(row["config_json"])
        selected = body.plan or saved
        if row["game_job_id"] and row["game_status"] != "failed":
            if selected != saved:
                raise HTTPException(409, "This plan was already confirmed with different settings")
            return {"plan_id": body.plan_id, "job_id": row["game_job_id"]}
        if row["game_id"]:
            raise HTTPException(409, "This plan already has a game")
        if not set(selected.knowledge_ids).issubset(json.loads(row["scope_json"])):
            raise HTTPException(422, "A selected concept is outside this plan's material or practice scope")
        _services(request.app)
        by_id = {item.knowledge_id: item for item in _knowledge(conn, row["material_id"]).knowledge}
        knowledge = [by_id[key] for key in selected.knowledge_ids]
        previous = None
        if row["practice_session_id"]:
            original = conn.execute("SELECT g.internal_json FROM games g JOIN sessions s ON s.game_id=g.id "
                                    "WHERE s.id=?", (row["practice_session_id"],)).fetchone()
            previous = GameConfigInternal.model_validate_json(original["internal_json"])
        job_id = insert_job(conn, "generation", body.plan_id, request.app.state.mode)
        conn.execute("UPDATE plans SET game_job_id=?,config_json=? WHERE id=?",
                     (job_id, selected.model_dump_json(), body.plan_id))
    tasks.add_task(_execute, request.app, job_id, _generate, body.plan_id, knowledge, selected, previous)
    return {"plan_id": body.plan_id, "job_id": job_id}


def _finished_round(conn, session_id):
    row = conn.execute(
        "SELECT s.status,r.stats_json,g.internal_json,p.material_id,p.config_json FROM sessions s "
        "JOIN games g ON g.id=s.game_id LEFT JOIN plans p ON p.id=g.plan_id "
        "LEFT JOIN reports r ON r.session_id=s.id WHERE s.id=?", (session_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(404, "Session not found")
    if row["status"] != "finished":
        raise HTTPException(409, "Finish the session first")
    if not row["material_id"]:
        raise HTTPException(409, "This game has no linked source material")
    report = LearningReport.model_validate_json(row["stats_json"])
    game = GameConfigInternal.model_validate_json(row["internal_json"])
    by_id = {item.knowledge_id: item for item in _knowledge(conn, row["material_id"]).knowledge}
    return row, report, [by_id[pair.knowledge_id] for pair in game.pairs]


@router.post("/sessions/{session_id}/practice", status_code=202, response_model=MaterialJob)
def request_practice(session_id: str, request: Request, tasks: BackgroundTasks, body: PracticeRequest | None = None):
    with connection(request.app, write=True) as conn:
        row, report, round_knowledge = _finished_round(conn, session_id)
        weak = set(report.weak_knowledge_ids)
        if not weak:
            raise HTTPException(409, "This report contains no weak concepts to practice")
        knowledge = [item for item in round_knowledge if item.knowledge_id in weak]
        if len(knowledge) == 1:
            # A meaningful matching round needs at least one competing choice.
            knowledge.append(next(item for item in round_knowledge if item.knowledge_id not in weak))
        last_plan = MatchingPlan.model_validate_json(row["config_json"])
        prefs = body.preferences if body and body.preferences else UserPreferences(
            goal=last_plan.goal, learner_level=last_plan.learner_level,
            difficulty=last_plan.difficulty, pair_count=len(last_plan.knowledge_ids))
        return _queue_plan(request.app, tasks, conn, "practice", session_id, row["material_id"], knowledge, prefs,
                           single_weak=len(weak) == 1)


def _write_feedback(job, session_id: str, report: LearningReport, knowledge: list[KnowledgeItem]):
    with job.stage("writing_feedback"):
        text = call_service(job.app, "feedback", report, knowledge, tool_trace=job.tools)
    if not isinstance(text, str) or not 1 <= len(text.strip()) <= 10000:
        raise OutputError("Feedback must contain a short nonempty text response.")
    with connection(job.app, write=True) as conn:
        conn.execute("UPDATE reports SET feedback=? WHERE session_id=?", (text.strip(), session_id))
        job.complete(conn, {"session_id": session_id, "feedback": text.strip()})


@router.post("/sessions/{session_id}/feedback", status_code=202, response_model=FeedbackJob)
def request_feedback(session_id: str, request: Request, tasks: BackgroundTasks):
    with connection(request.app, write=True) as conn:
        _, report, knowledge = _finished_round(conn, session_id)
        latest = conn.execute("SELECT id,status FROM jobs WHERE kind='feedback' AND resource_id=? "
                              "ORDER BY rowid DESC LIMIT 1", (session_id,)).fetchone()
        if latest and latest["status"] != "failed":
            return {"session_id": session_id, "job_id": latest["id"]}
        _services(request.app)
        job_id = insert_job(conn, "feedback", session_id, request.app.state.mode)
    tasks.add_task(_execute, request.app, job_id, _write_feedback, session_id, report, knowledge)
    return {"session_id": session_id, "job_id": job_id}
