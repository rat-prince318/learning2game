"""HTTP boundary for RPG moves, game projection, progress recovery and final statistics."""

from fastapi import APIRouter, Request

from ..db import connection
from .games import read_rpg_game
from .models import RPGActionInput, RPGActionResult, RPGGamePublic, RPGLearningReport, RPGProgress
from .reports import finish_rpg_session, read_rpg_report
from .sessions import apply_rpg_action, create_rpg_session, read_rpg_progress


router = APIRouter(prefix="/rpg", tags=["RPG gameplay"])


@router.get("/games/{game_id}", response_model=RPGGamePublic)
def public_game(game_id: str, request: Request):
    with connection(request.app) as conn:
        return read_rpg_game(conn, game_id)


@router.post("/games/{game_id}/sessions", response_model=RPGProgress, status_code=201)
def start_game(game_id: str, request: Request):
    with connection(request.app, write=True) as conn:
        return create_rpg_session(conn, game_id)


@router.get("/sessions/{session_id}", response_model=RPGProgress)
def progress(session_id: str, request: Request):
    with connection(request.app) as conn:
        return read_rpg_progress(conn, session_id)


@router.post("/sessions/{session_id}/actions", response_model=RPGActionResult)
def action(session_id: str, body: RPGActionInput, request: Request):
    with connection(request.app, write=True) as conn:
        return apply_rpg_action(conn, session_id, body)


@router.post("/sessions/{session_id}/finish", response_model=RPGLearningReport)
def finish(session_id: str, request: Request):
    with connection(request.app, write=True) as conn:
        return finish_rpg_session(conn, session_id)


@router.get("/sessions/{session_id}/report", response_model=RPGLearningReport)
def report(session_id: str, request: Request):
    with connection(request.app) as conn:
        return read_rpg_report(conn, session_id)
