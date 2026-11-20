"""Open, resume and settle a multi-volume expedition using atomic SQLite commands."""

import json
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from pydantic import Field, field_validator

from ..db import connection
from ..models import Identifier, StrictModel
from . import expedition
from .battle_rules import BattleError
from .battle_reports import BattleConcept, concept_rows
from .expedition import ExpeditionAction, ExpeditionReport, ExpeditionState, ExpeditionView
from .expedition_world import ExpeditionCatalog, expedition_catalog
from .games import read_rpg_courses
from .hero_catalog import ClassId, KitId

router = APIRouter(prefix="/rpg", tags=["RPG expeditions"])


class ExpeditionStart(StrictModel):
    game_ids: list[Identifier] = Field(min_length=1, max_length=8)
    hero_class: ClassId = "arcanist"
    kit: KitId = "trail"
    request_id: Identifier | None = None

    @field_validator("game_ids")
    @classmethod
    def unique_books(cls, value):
        if len(set(value)) != len(value):
            raise ValueError("请为每卷选择不同的已发布关卡。")
        return value


class EncoreStart(StrictModel):
    hero_class: ClassId | None = None
    kit: KitId | None = None
    inherited_relic_id: Identifier | None = None
    request_id: Identifier | None = None


def _run(conn, session_id):
    row = conn.execute("SELECT state_json, report_json FROM expedition_runs WHERE id=?", (session_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "找不到这次远征。")
    return row


def _courses(conn, session_id):
    books = conn.execute("SELECT game_id FROM expedition_books WHERE run_id=? ORDER BY book_index", (session_id,))
    return read_rpg_courses(conn, [row["game_id"] for row in books])


@router.get("/expedition-catalog", response_model=ExpeditionCatalog)
def catalog():
    return expedition_catalog()


def _open(conn, body, *, predecessor=None, inherited_relic_id=None):
    settings = body.model_dump(exclude={"request_id"}, mode="json")
    if predecessor is not None:
        settings.update(predecessor=predecessor, inherited_relic_id=inherited_relic_id)
    anchor = body.game_ids[0]
    if body.request_id is not None:
        old = conn.execute("SELECT id, settings_json, state_json FROM expedition_runs "
                           "WHERE anchor_game_id=? AND request_id=?", (anchor, body.request_id)).fetchone()
        if old:
            if settings != json.loads(old["settings_json"]):
                raise HTTPException(409, "这个开局编号已绑定另一份远征配置。")
            return expedition.view(ExpeditionState.model_validate_json(old["state_json"]), _courses(conn, old["id"]))
    courses = read_rpg_courses(conn, body.game_ids)
    session_id = uuid4().hex
    state = expedition.new_expedition(session_id, courses, body.hero_class, body.kit,
                                      veteran=predecessor is not None, inherited_relic_id=inherited_relic_id)
    conn.execute("INSERT INTO expedition_runs(id,anchor_game_id,request_id,settings_json,state_json) "
                 "VALUES(?,?,?,?,?)", (session_id, anchor, body.request_id, json.dumps(settings), state.model_dump_json()))
    conn.executemany("INSERT INTO expedition_books(run_id,book_index,game_id) VALUES(?,?,?)",
                     [(session_id, index, book) for index, book in enumerate(body.game_ids)])
    return expedition.view(state, courses)


@router.post("/expeditions", status_code=201, response_model=ExpeditionView)
def start(body: ExpeditionStart, request: Request):
    with connection(request.app, write=True) as conn:
        return _open(conn, body)


@router.post("/expeditions/{session_id}/encore", status_code=201, response_model=ExpeditionView)
def play_again(session_id: str, request: Request, body: EncoreStart | None = None):
    choices = body or EncoreStart()
    with connection(request.app, write=True) as conn:
        previous = ExpeditionState.model_validate_json(_run(conn, session_id)["state_json"])
        if previous.phase != "victory":
            raise HTTPException(409, "完成远征后即可开启进阶周目。")
        if choices.inherited_relic_id is not None and choices.inherited_relic_id not in previous.relic_ids:
            raise HTTPException(422, "请选择这次通关持有的遗物。")
        settings = ExpeditionStart(game_ids=previous.game_ids, hero_class=choices.hero_class or previous.hero_class,
                                   kit=choices.kit or previous.kit, request_id=choices.request_id)
        return _open(conn, settings, predecessor=session_id, inherited_relic_id=choices.inherited_relic_id)


@router.get("/expeditions/{session_id}", response_model=ExpeditionView)
def resume(session_id: str, request: Request):
    with connection(request.app) as conn:
        state = ExpeditionState.model_validate_json(_run(conn, session_id)["state_json"])
        return expedition.view(state, _courses(conn, session_id))


@router.post("/expeditions/{session_id}/actions", response_model=ExpeditionView)
def act(session_id: str, body: ExpeditionAction, request: Request):
    with connection(request.app, write=True) as conn:
        row = _run(conn, session_id)
        old = conn.execute("SELECT payload_json, result_json FROM expedition_events WHERE run_id=? AND event_id=?",
                           (session_id, body.event_id)).fetchone()
        if old:
            if body.model_dump(mode="json") != json.loads(old["payload_json"]):
                raise HTTPException(409, "这个事件编号已用于另一次操作。")
            return ExpeditionView.model_validate_json(old["result_json"])
        state = ExpeditionState.model_validate_json(row["state_json"])
        courses = _courses(conn, session_id)
        try:
            updated = expedition.advance(state, body, courses)
        except BattleError as error:
            raise HTTPException(error.status_code, error.detail) from None
        result = expedition.view(updated, courses)
        final = expedition.report(updated, courses) if updated.phase in {"victory", "retreated"} else None
        conn.execute("UPDATE expedition_runs SET state_json=?, report_json=? WHERE id=?",
                     (updated.model_dump_json(), final.model_dump_json() if final else None, session_id))
        conn.execute("INSERT INTO expedition_events(run_id,event_id,payload_json,result_json) VALUES(?,?,?,?)",
                     (session_id, body.event_id, body.model_dump_json(), result.model_dump_json()))
        return result


@router.get("/expeditions/{session_id}/report", response_model=ExpeditionReport)
def learning_report(session_id: str, request: Request):
    with connection(request.app) as conn:
        result = _run(conn, session_id)["report_json"]
        if result is None:
            raise HTTPException(409, "通关或撤离后即可查看本次远征战报。")
        return ExpeditionReport.model_validate_json(result)


class JournalPage(StrictModel):
    region_index: int
    entries: list[BattleConcept]


@router.get("/expeditions/{session_id}/notebook", response_model=list[JournalPage])
def field_notebook(session_id: str, request: Request):
    """The live fieldbook contains evidence for concepts the player has actually tried."""
    with connection(request.app) as conn:
        state = ExpeditionState.model_validate_json(_run(conn, session_id)["state_json"])
        pages = {index: volume.concepts for index, volume in enumerate(state.completed_volumes)}
        index = state.game_ids.index(state.battle.game_id)
        if index not in pages:
            course = read_rpg_courses(conn, [state.battle.game_id])[state.battle.game_id]
            pages[index] = concept_rows(state.battle.concepts, *course)
        return [JournalPage(region_index=i, entries=[row for row in rows
                            if row.combat_attempts or row.review_attempts])
                for i, rows in sorted(pages.items())]
