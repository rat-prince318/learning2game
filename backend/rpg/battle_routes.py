"""Persist each battle command, snapshot and terminal learning report atomically."""

import json
from sqlite3 import Connection
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request

from ..db import connection
from ..models import Identifier, StrictModel
from . import battle_rules
from .battle_models import BattleAction, BattleState, BattleView
from .battle_reports import BattleReport, build_report
from .games import read_rpg_course
from .hero_catalog import ClassId, HeroCatalog, KitId, catalog

router = APIRouter(prefix="/rpg", tags=["RPG battle campaign"])


class StartBattle(StrictModel):
    request_id: Identifier | None = None
    hero_class: ClassId | None = None
    kit: KitId | None = None


def _run(conn: Connection, battle_id: str):
    row = conn.execute("SELECT game_id, state_json, report_json FROM battle_runs WHERE id=?",
                       (battle_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "找不到这场战役。")
    return row


@router.get("/battle-catalog", response_model=HeroCatalog)
def battle_catalog():
    """Rules shared by the character-selection screen and the battle engine."""
    return catalog()


@router.post("/games/{game_id}/battles", response_model=BattleView, status_code=201)
def start_battle(game_id: str, request: Request, body: StartBattle | None = None):
    """A retried start with the same request_id resumes its battle at the latest turn."""
    settings = body or StartBattle()
    request_id = settings.request_id
    with connection(request.app, write=True) as conn:
        game, knowledge = read_rpg_course(conn, game_id)
        if request_id is not None:
            prior = conn.execute("SELECT state_json FROM battle_runs WHERE game_id=? AND request_id=?",
                                 (game_id, request_id)).fetchone()
            if prior:
                saved = BattleState.model_validate_json(prior["state_json"])
                if ((settings.hero_class is not None and settings.hero_class != saved.hero_class)
                        or (settings.kit is not None and settings.kit != saved.kit)):
                    raise HTTPException(409, "这份开局记录已绑定角色和行装，请为新战役使用新的 request_id。")
                return battle_rules.view(saved, game, knowledge)
        battle_id = uuid4().hex
        state = battle_rules.new_battle(battle_id, game_id, game, knowledge,
                                        hero_class=settings.hero_class or "arcanist", kit=settings.kit or "trail")
        conn.execute("INSERT INTO battle_runs(id,game_id,request_id,state_json) VALUES(?,?,?,?)",
                     (battle_id, game_id, request_id, state.model_dump_json()))
        return battle_rules.view(state, game, knowledge)


@router.get("/battles/{battle_id}", response_model=BattleView)
def read_battle(battle_id: str, request: Request):
    with connection(request.app) as conn:
        row = _run(conn, battle_id)
        return battle_rules.view(BattleState.model_validate_json(row["state_json"]), *read_rpg_course(conn, row["game_id"]))


@router.post("/battles/{battle_id}/actions", response_model=BattleView)
def apply_action(battle_id: str, body: BattleAction, request: Request):
    with connection(request.app, write=True) as conn:
        row = _run(conn, battle_id)
        prior = conn.execute("SELECT payload_json, result_json FROM battle_events WHERE run_id=? AND event_id=?",
                             (battle_id, body.event_id)).fetchone()
        if prior:
            if json.loads(prior["payload_json"]) != body.model_dump(mode="json"):
                raise HTTPException(409, "该事件已用于另一回合操作。请读取最新战况。")
            return BattleView.model_validate_json(prior["result_json"])
        state = BattleState.model_validate_json(row["state_json"])
        game, knowledge = read_rpg_course(conn, row["game_id"])
        try:
            updated = battle_rules.advance(state, body, game, knowledge)
        except battle_rules.BattleError as error:
            raise HTTPException(error.status_code, error.detail) from None

        result = battle_rules.view(updated, game, knowledge)
        report = build_report(updated, game, knowledge) if updated.phase in {"victory", "retreated"} else None
        conn.execute("UPDATE battle_runs SET state_json=?, report_json=? WHERE id=?",
                     (updated.model_dump_json(), report.model_dump_json() if report else None, battle_id))
        conn.execute("INSERT INTO battle_events(run_id,event_id,payload_json,result_json) VALUES(?,?,?,?)",
                     (battle_id, body.event_id, body.model_dump_json(), result.model_dump_json()))
        return result


@router.get("/battles/{battle_id}/report", response_model=BattleReport)
def read_report(battle_id: str, request: Request):
    with connection(request.app) as conn:
        row = _run(conn, battle_id)
        if row["report_json"] is None:
            raise HTTPException(409, "完成最后一关或撤离战役后可查看报告。")
        return BattleReport.model_validate_json(row["report_json"])
