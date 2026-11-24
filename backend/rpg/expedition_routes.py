"""Open, resume and settle a multi-volume expedition using atomic SQLite commands."""

import json
import re
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from pydantic import Field, field_validator, model_validator

from ..db import connection
from ..models import Count, Identifier, MaterialResult, SourceRef, StrictModel
from . import course_notes, expedition, tower
from .battle_rules import BattleError
from .battle_reports import BattleConcept, concept_rows
from .expedition import ExpeditionAction, ExpeditionReport, ExpeditionState, ExpeditionView
from .expedition_world import ExpeditionCatalog, expedition_catalog
from .games import read_rpg_courses
from .hero_catalog import ClassId, KitId

router = APIRouter(prefix="/rpg", tags=["RPG expeditions"])


class ExpeditionStart(StrictModel):
    eight_chapters: bool = False
    campaign_story: bool = False
    source_material_ids: list[Identifier] = Field(default_factory=list, max_length=8)
    game_ids: list[Identifier] = Field(min_length=1)
    hero_class: ClassId = "arcanist"
    kit: KitId = "trail"
    request_id: Identifier | None = None

    @model_validator(mode="after")
    def valid_route(self):
        if self.eight_chapters:
            self.campaign_story = True
        if not self.eight_chapters and len(self.game_ids) > 8:
            raise ValueError("这条旧路线最多容纳八卷课程。")
        return self

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
    row = conn.execute("SELECT state_json, report_json, settings_json FROM expedition_runs WHERE id=?", (session_id,)).fetchone()
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
            old_settings = json.loads(old["settings_json"])
            old_settings.setdefault("campaign_story", False)
            old_settings.setdefault("eight_chapters", False)
            old_settings.setdefault("source_material_ids", [])
            if settings != old_settings:
                raise HTTPException(409, "这个开局编号已绑定另一份远征配置。")
            return expedition.view(ExpeditionState.model_validate_json(old["state_json"]), _courses(conn, old["id"]))
    for mid in body.source_material_ids:
        if not conn.execute("SELECT 1 FROM materials WHERE id=? AND result_json IS NOT NULL", (mid,)).fetchone():
            raise HTTPException(404, "课程资料已移除或还在解析中。")
    courses = read_rpg_courses(conn, body.game_ids)
    session_id = uuid4().hex
    state = expedition.new_expedition(session_id, courses, body.hero_class, body.kit,
                                      veteran=predecessor is not None, inherited_relic_id=inherited_relic_id,
                                      campaign_story=body.campaign_story, eight_chapters=body.eight_chapters)
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
        row = _run(conn, session_id)
        previous = ExpeditionState.model_validate_json(row["state_json"])
        if previous.phase != "victory":
            raise HTTPException(409, "完成远征后即可开启进阶周目。")
        if choices.inherited_relic_id is not None and choices.inherited_relic_id not in previous.relic_ids:
            raise HTTPException(422, "请选择这次通关持有的遗物。")
        settings = ExpeditionStart(game_ids=previous.game_ids, campaign_story=previous.campaign_story,
                                   eight_chapters=previous.eight_chapters,
                                   source_material_ids=[mid for mid in json.loads(row["settings_json"]).get("source_material_ids", [])
                                                        if conn.execute("SELECT 1 FROM materials WHERE id=?", (mid,)).fetchone()],
                                   hero_class=choices.hero_class or previous.hero_class,
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


@router.get("/expeditions/{session_id}/course-notes", response_model=course_notes.CourseNotebook)
def read_course_notes(session_id: str, request: Request, mode: course_notes.NoteMode = "campaign",
                      spot: course_notes.NoteSpot | None = None):
    with connection(request.app) as conn:
        state = ExpeditionState.model_validate_json(_run(conn, session_id)["state_json"])
        courses = expedition.playable_courses(_courses(conn, session_id), state.excluded_cards)
        floor = tower.current_course(state.tower, courses) if mode == "tower" and state.tower.battle else None
        return course_notes.notebook(state, expedition.itinerary(state, courses), courses, mode, spot, floor)


class JournalPage(StrictModel):
    region_index: int
    entries: list[BattleConcept]


@router.get("/expeditions/{session_id}/notebook", response_model=list[JournalPage])
def field_notebook(session_id: str, request: Request):
    """The live fieldbook contains evidence for concepts the player has actually tried."""
    with connection(request.app) as conn:
        state = ExpeditionState.model_validate_json(_run(conn, session_id)["state_json"])
        courses = expedition.playable_courses(_courses(conn, session_id), state.excluded_cards)
        locations = {(gid, courses[gid][0].scenes[stage].scene_id): region
                     for region, stops in enumerate(expedition.itinerary(state, courses)) for gid, stage in stops}
        rows_by_game = {volume.game_id: volume.concepts for volume in state.completed_volumes}
        gid = state.battle.game_id
        if gid not in rows_by_game:
            rows_by_game[gid] = concept_rows(state.battle.concepts, *courses[gid])
        pages = {}
        for gid, rows in rows_by_game.items():
            for row in rows:
                page = pages.setdefault(locations[gid, row.scene_id], [])
                if row.combat_attempts or row.review_attempts:
                    page.append(row)
        return [JournalPage(region_index=i, entries=rows) for i, rows in sorted(pages.items())]



class MaterialCoverage(StrictModel):
    material_id: Identifier
    filename: str
    extracted_count: Count
    scheduled_count: Count
    needs_review_count: Count | None = None
    warnings: list[SourceRef]


class CampaignCoverage(StrictModel):
    sources: list[MaterialCoverage]


@router.get("/expeditions/{session_id}/coverage", response_model=CampaignCoverage)
def coverage(session_id: str, request: Request):
    """Show extraction limits and the playable share of each source when the notebook opens."""
    with connection(request.app) as conn:
        run = _run(conn, session_id)
        state = ExpeditionState.model_validate_json(run["state_json"])
        declared = json.loads(run["settings_json"]).get("source_material_ids", [])
        books = conn.execute(
            "SELECT g.id,g.internal_json,p.material_id FROM expedition_books b JOIN games g ON g.id=b.game_id "
            "JOIN plans p ON p.id=g.plan_id WHERE b.run_id=? ORDER BY b.book_index", (session_id,))
        scheduled = dict.fromkeys(declared, 0)
        for book in books:
            mid = book["material_id"]
            skipped = set(state.excluded_cards.get(book["id"], []))
            scenes = json.loads(book["internal_json"])["scenes"]
            count = sum(card["challenge_id"] not in skipped for scene in scenes for card in scene["challenges"])
            scheduled[mid] = scheduled.get(mid, 0) + count
        sources = []
        for mid, count in scheduled.items():
            row = conn.execute("SELECT original_name,result_json FROM materials WHERE id=?", (mid,)).fetchone()
            if not row:  # A fully duplicated optional source may since have been deleted.
                continue
            result = MaterialResult.model_validate_json(row["result_json"])
            review = result.needs_review_count
            if review is None:
                # Older exam extractions retained the same count in their warning.
                review = next((int(m[1]) for w in result.warnings if (m := re.search(r"另有 (\d+) 个题项", w))), None)
            sources.append(MaterialCoverage(material_id=mid, filename=row["original_name"],
                extracted_count=len(result.knowledge), scheduled_count=count,
                needs_review_count=review, warnings=result.warnings))
        return CampaignCoverage(sources=sources)
