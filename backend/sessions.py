"""Server-authoritative matching sessions and deterministic learning statistics."""

import json
from collections import Counter
from datetime import datetime, timezone
from sqlite3 import Connection, Row
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ValidationError

from .db import connection
from .court_warmup import warmup_game
from .court_choices import CourtChoicesUnavailable
from .games import upgrade_court
from .models import (
    AttemptInput, ConceptPerformance, GameConfigInternal, GameConfigPublic, HintInput,
    LearningReport, MaterialResult,
)

router = APIRouter(tags=["gameplay"])


class SessionStarted(BaseModel):
    session_id: str
    game_id: str
    status: str


class MatchedCards(BaseModel):
    left_id: str
    right_id: str


class SessionProgress(SessionStarted):
    matched_cards: list[MatchedCards]
    mistakes: int
    hints_by_left_id: dict[str, int]


class AttemptResult(BaseModel):
    event_id: str
    left_id: str
    right_id: str
    correct: bool
    explanation: str | None = None
    source_ref: str | None = None


class HintResult(BaseModel):
    event_id: str
    left_id: str
    hint: str


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _session(conn: Connection, session_id: str) -> Row:
    row = conn.execute(
        """SELECT s.game_id, s.status, g.game_type, g.public_json, g.internal_json, g.card_map_json, g.plan_id
           FROM sessions s JOIN games g ON g.id = s.game_id
           WHERE s.id = ?""",
        (session_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(404, "Session not found")
    if row["game_type"] != "matching":
        raise HTTPException(409, "请从 RPG 会话入口打开这一局。")
    return row


@router.get("/court/warmup", response_model=GameConfigPublic)
def public_warmup(request: Request, language: Literal["zh", "en"] = "zh"):
    return public_game(warmup_game(request.app, language), request)


@router.get("/games/{game_id}", response_model=GameConfigPublic)
def public_game(game_id: str, request: Request):
    with connection(request.app) as conn:
        row = conn.execute("SELECT game_type,public_json FROM games WHERE id = ?", (game_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "Game not found")
    if row["game_type"] != "matching":
        raise HTTPException(409, "请从 RPG 游戏入口打开这个关卡。")
    public = json.loads(row["public_json"])
    if "court_options" in public:
        return public
    with connection(request.app, write=True) as conn:
        return _load_playable(conn, game_id)


def _load_playable(conn, game_id):
    row = conn.execute("SELECT * FROM games WHERE id=?", (game_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "Game not found")
    if row["game_type"] != "matching":
        raise HTTPException(409, "请从 RPG 游戏入口打开这个关卡。")
    try:
        return upgrade_court(conn, row)
    except (CourtChoicesUnavailable, ValidationError) as exc:
        raise HTTPException(409, "这局旧题需要补充同类选项。请用原资料重新生成球场，历史学习报告已保留。") from exc


@router.post("/games/{game_id}/sessions", response_model=SessionStarted, status_code=201)
def start_session(game_id: str, request: Request):
    with connection(request.app, write=True) as conn:
        _load_playable(conn, game_id)
        session_id = str(uuid4())
        conn.execute(
            "INSERT INTO sessions (id, game_id, status, created_at) VALUES (?, ?, 'active', ?)",
            (session_id, game_id, _now()),
        )
    return SessionStarted(session_id=session_id, game_id=game_id, status="active")


@router.get("/sessions/{session_id}", response_model=SessionProgress)
def session_progress(session_id: str, request: Request):
    """Recover the student's own board after a refresh, revealing only solved pairs."""
    with connection(request.app) as conn:
        session = _session(conn, session_id)
        matches = []
        hints: Counter[str] = Counter()
        mistakes = 0
        for event in conn.execute(
            "SELECT kind, left_id, right_id, correct FROM events WHERE session_id = ? ORDER BY seq",
            (session_id,),
        ):
            if event["kind"] == "hint":
                hints[event["left_id"]] += 1
            elif event["correct"]:
                matches.append(MatchedCards(left_id=event["left_id"], right_id=event["right_id"]))
            else:
                mistakes += 1
        return SessionProgress(
            session_id=session_id, game_id=session["game_id"], status=session["status"],
            matched_cards=matches, mistakes=mistakes, hints_by_left_id=dict(hints),
        )


def _record_event(conn: Connection, session_id: str, body: AttemptInput | HintInput) -> dict:
    # The caller holds a SQLite write transaction across replay detection, grading and insertion.
    session = _session(conn, session_id)
    is_attempt = isinstance(body, AttemptInput)
    kind = "attempt" if is_attempt else "hint"
    right_id = body.right_id if is_attempt else None
    prior = conn.execute(
        """SELECT kind, left_id, right_id, result_json FROM events
           WHERE session_id = ? AND event_id = ?""",
        (session_id, body.event_id),
    ).fetchone()
    if prior is not None:
        if (prior["kind"], prior["left_id"], prior["right_id"]) != (kind, body.left_id, right_id):
            raise HTTPException(409, "This event ID already identifies another action")
        return json.loads(prior["result_json"])

    if session["status"] != "active":
        raise HTTPException(409, "Session has finished")
    public = json.loads(session["public_json"])
    if "court_options" not in public:
        public = _load_playable(conn, session["game_id"])
        session = _session(conn, session_id)
    mapping = json.loads(session["card_map_json"])
    if body.left_id not in mapping["left"]:
        raise HTTPException(422, "Card does not belong to this game or this side")
    if is_attempt and right_id not in public["court_options"][body.left_id]:
        raise HTTPException(422, "This hoop is outside the choices for this ball")
    locked = conn.execute(
        """SELECT 1 FROM events WHERE session_id = ? AND correct = 1
           AND left_id = ? LIMIT 1""",
        (session_id, body.left_id),
    ).fetchone()
    if locked:
        raise HTTPException(409, "A selected card has already been matched")

    pair_id = mapping["left"][body.left_id]
    game = GameConfigInternal.model_validate_json(session["internal_json"])
    pair = next(pair for pair in game.pairs if pair.pair_id == pair_id)
    result = {"event_id": body.event_id, "left_id": body.left_id}
    correct = None
    if is_attempt:
        correct = pair_id == mapping["right"].get(right_id)
        result.update(right_id=right_id, correct=correct)
        if correct:
            result.update(explanation=pair.explanation, source_ref=pair.source_ref)
    else:
        # A generated hint may accidentally repeat the full answer. Use a neutral fallback then.
        hint = pair.hint or ""
        answer = next(card["text"] for card in public["right_cards"]
                      if mapping["right"].get(card["id"]) == pair_id)
        if not hint.strip() or answer.strip().casefold() in hint.casefold():
            hint = ("Compare each board with the conditions in the question."
                    if not any("\u4e00" <= c <= "\u9fff" for c in pair.left + pair.explanation)
                    else "先看球上的已知条件，再逐项比较篮板上的答案。")
        result["hint"] = hint

    conn.execute(
        """INSERT INTO events
           (session_id, event_id, kind, left_id, right_id, knowledge_id, correct, result_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (session_id, body.event_id, kind, body.left_id, right_id, pair.knowledge_id,
         correct, json.dumps(result, ensure_ascii=False)),
    )
    return result


@router.post("/sessions/{session_id}/attempts", response_model=AttemptResult,
             response_model_exclude_none=True)
def submit_attempt(session_id: str, body: AttemptInput, request: Request):
    with connection(request.app, write=True) as conn:
        return _record_event(conn, session_id, body)


@router.post("/sessions/{session_id}/hints", response_model=HintResult)
def request_hint(session_id: str, body: HintInput, request: Request):
    with connection(request.app, write=True) as conn:
        return _record_event(conn, session_id, body)


def evaluate_learning(conn: Connection, session_id: str) -> LearningReport:
    """Compute rates in [0, 1]. A concept counts as attempted after a valid attempt."""
    session = _session(conn, session_id)
    game = GameConfigInternal.model_validate_json(session["internal_json"])
    concept_ids = [pair.knowledge_id for pair in game.pairs]
    attempts: Counter[str] = Counter()
    hints: Counter[str] = Counter()
    first_correct: dict[str, bool] = {}
    matched: set[str] = set()
    for event in conn.execute(
        "SELECT kind, knowledge_id, correct FROM events WHERE session_id = ? ORDER BY seq",
        (session_id,),
    ):
        concept = event["knowledge_id"]
        if event["kind"] == "hint":
            hints[concept] += 1
            continue
        attempts[concept] += 1
        first_correct.setdefault(concept, bool(event["correct"]))
        if event["correct"]:
            matched.add(concept)

    total_attempts = sum(attempts.values())
    # A scenario can be the left card. Use the extracted concept name for material-based games.
    terms = {}
    language = None
    if session["plan_id"]:
        material = conn.execute(
            """SELECT m.result_json,p.config_json FROM plans p JOIN materials m ON m.id = p.material_id
               WHERE p.id = ?""", (session["plan_id"],),
        ).fetchone()
        if material and material["result_json"]:
            language = json.loads(material["config_json"]).get("question_language")
            knowledge = MaterialResult.model_validate_json(material["result_json"]).knowledge
            terms = {item.knowledge_id: item.term for item in knowledge}
    concepts = [
        ConceptPerformance(
            knowledge_id=pair.knowledge_id,
            term=pair.study_term or terms.get(pair.knowledge_id, pair.left),
            source_ref=pair.source_ref, explanation=pair.explanation,
            attempts=attempts[pair.knowledge_id],
            mistakes=attempts[pair.knowledge_id] - int(pair.knowledge_id in matched),
            first_attempt_correct=first_correct.get(pair.knowledge_id),
            matched=pair.knowledge_id in matched, hints=hints[pair.knowledge_id],
        )
        for pair in game.pairs
    ]
    return LearningReport(
        session_id=session_id, game_id=session["game_id"], question_language=language, total_pairs=len(concept_ids),
        matched_pairs=len(matched), attempted_concepts=len(attempts),
        untouched_concepts=[c for c in concept_ids if c not in attempts],
        valid_attempts=total_attempts, correct_attempts=len(matched),
        mistakes=total_attempts - len(matched),
        first_attempt_accuracy=sum(first_correct.values()) / len(attempts) if attempts else None,
        overall_attempt_accuracy=len(matched) / total_attempts if total_attempts else None,
        completion_rate=len(matched) / len(concept_ids),
        hints_by_concept={c: hints[c] for c in concept_ids},
        weak_knowledge_ids=[
            item.knowledge_id for item in concepts if not item.matched or item.mistakes or item.hints
        ],
        concepts=concepts,
    )


def _saved_report(conn: Connection, session_id: str) -> LearningReport:
    row = conn.execute(
        "SELECT stats_json FROM reports WHERE session_id = ?", (session_id,)
    ).fetchone()
    return LearningReport.model_validate_json(row["stats_json"])


@router.post("/sessions/{session_id}/finish", response_model=LearningReport)
def finish_session(session_id: str, request: Request):
    with connection(request.app, write=True) as conn:
        session = _session(conn, session_id)
        if session["status"] == "finished":
            return _saved_report(conn, session_id)
        report = evaluate_learning(conn, session_id)
        conn.execute(
            "UPDATE sessions SET status = 'finished', finished_at = ? WHERE id = ?",
            (_now(), session_id),
        )
        conn.execute(
            "INSERT INTO reports (session_id, stats_json) VALUES (?, ?)",
            (session_id, report.model_dump_json()),
        )
        return report


@router.get("/sessions/{session_id}/report", response_model=LearningReport)
def get_report(session_id: str, request: Request):
    with connection(request.app) as conn:
        if _session(conn, session_id)["status"] != "finished":
            raise HTTPException(409, "Finish the session before requesting the report")
        return _saved_report(conn, session_id)
