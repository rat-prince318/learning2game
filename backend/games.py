"""Publish a fixed set of plausible boards for each ball. Only the server stores the answer key."""

import json
import sqlite3
from pathlib import Path
from secrets import SystemRandom
from uuid import uuid4

from .basketball_questions import option_issue, text_problem
from .court_choices import CourtChoicesUnavailable, prepare_choices
from .models import GameConfigInternal, GameConfigPublic, KnowledgeItem, MatchingPair, MaterialResult, PublicCard


def _prepare_game(conn, game, plan_id):
    if all(pair.distractors for pair in game.pairs):
        return game
    source = conn.execute(
        """SELECT m.result_json,p.config_json FROM plans p
           JOIN materials m ON m.id=p.material_id WHERE p.id=?""", (plan_id,)
    ).fetchone()
    language = json.loads(source[1]).get("question_language") if source else None
    if source and source[0]:
        knowledge = MaterialResult.model_validate_json(source[0]).knowledge
    else:
        knowledge = [KnowledgeItem(knowledge_id=p.knowledge_id, term=p.study_term or p.left,
                                   definition=p.explanation, source_ref=p.source_ref)
                     for p in game.pairs if len(p.study_term or p.left) <= 160]
    by_id = {item.knowledge_id: item for item in knowledge}
    warmup = {}
    if language and plan_id == f"court-warmup-v1-{language}":
        data = Path(__file__).with_name("fixtures") / f"court-{language}.json"
        warmup = {(s["ball"], s["hoop"]): s["distractors"]
                  for s in json.loads(data.read_text(encoding="utf-8"))["shots"]}

    pairs = []
    for pair in game.pairs:
        if pair.distractors:
            pairs.append(pair)
            continue
        prompt, answer = pair.left, pair.right
        wrong = warmup.get((prompt, answer))
        if wrong is None:
            prompt, answer, wrong = prepare_choices(pair, by_id.get(pair.knowledge_id), language, knowledge)
        pairs.append(MatchingPair.model_validate({**pair.model_dump(), "left": prompt,
                                                  "right": answer, "distractors": wrong}))
    return GameConfigInternal(title=game.title, pairs=pairs)


def _project(game_id, game, prior_map=None):
    # During an upgrade keep both IDs from each original correct match. Old receipts,
    # current progress and reports can still refer to their original balls and boards.
    prior_map = prior_map or {}
    left_by_pair = {pair: card for card, pair in prior_map.get("left", {}).items()}
    right_by_pair = {pair: card for card, pair in prior_map.get("right", {}).items()}
    left_cards, right_cards = [], []
    card_map = {"left": {}, "right": {}}
    options = {}
    rng = SystemRandom()
    for pair in game.pairs:
        answers = [pair.right, *pair.distractors]
        if (len(answers) < 3 or option_issue(answers, pair.left)
                or any(text_problem(s) for s in (pair.left, *answers))):
            raise CourtChoicesUnavailable("请提供可以独立作答、同类且彼此可区分的选项。")
        ball = PublicCard(id=left_by_pair.get(pair.pair_id) or uuid4().hex, text=pair.left)
        answer = PublicCard(id=right_by_pair.get(pair.pair_id) or uuid4().hex, text=pair.right)
        left_cards.append(ball)
        boards = [answer, *(PublicCard(id=uuid4().hex, text=text) for text in pair.distractors)]
        rng.shuffle(boards)
        right_cards.extend(boards)
        options[ball.id] = [b.id for b in boards]
        card_map["left"][ball.id] = pair.pair_id
        card_map["right"][answer.id] = pair.pair_id
    rng.shuffle(left_cards)
    rng.shuffle(right_cards)
    public = GameConfigPublic(game_id=game_id, title=game.title, left_cards=left_cards,
                              right_cards=right_cards, court_options=options)
    return public.model_dump_json(), json.dumps(card_map)


def store_game(conn: sqlite3.Connection, internal: GameConfigInternal, plan_id: str | None = None) -> str:
    game_id = uuid4().hex
    game = _prepare_game(conn, internal, plan_id)
    # Keep the author's original wording so targeted practice can vary the source
    # definition or example even when the court presents it as a reverse question.
    conn.execute("INSERT INTO games(id,internal_json,public_json,card_map_json,plan_id) VALUES (?,?,?,?,?)",
                 (game_id, internal.model_dump_json(), *_project(game_id, game), plan_id))
    return game_id


def upgrade_court(conn, row):
    """Called inside a write transaction after reading the latest row."""
    public = json.loads(row["public_json"])
    if "court_options" in public:
        return public
    game = _prepare_game(conn, GameConfigInternal.model_validate_json(row["internal_json"]), row["plan_id"])
    payload = _project(public["game_id"], game, json.loads(row["card_map_json"]))
    conn.execute("UPDATE games SET public_json=?, card_map_json=? WHERE id=?",
                 (*payload, public["game_id"]))
    return json.loads(payload[0])
