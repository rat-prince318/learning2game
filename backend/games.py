"""Publish a playable view while retaining answer keys in SQLite."""

import json
import sqlite3
from secrets import SystemRandom
from uuid import uuid4

from .models import GameConfigInternal, GameConfigPublic, PublicCard


def store_game(
    conn: sqlite3.Connection,
    internal: GameConfigInternal,
    plan_id: str | None = None,
) -> str:
    """Insert both views in the caller's transaction and return the game ID."""
    game_id = uuid4().hex
    left_cards = []
    right_cards = []
    card_map: dict[str, dict[str, str]] = {"left": {}, "right": {}}
    for pair in internal.pairs:
        left = PublicCard(id=uuid4().hex, text=pair.left)
        right = PublicCard(id=uuid4().hex, text=pair.right)
        left_cards.append(left)
        right_cards.append(right)
        card_map["left"][left.id] = pair.pair_id
        card_map["right"][right.id] = pair.pair_id

    rng = SystemRandom()
    rng.shuffle(left_cards)
    rng.shuffle(right_cards)
    public = GameConfigPublic(
        game_id=game_id,
        title=internal.title,
        left_cards=left_cards,
        right_cards=right_cards,
    )
    conn.execute(
        "INSERT INTO games (id, internal_json, public_json, card_map_json, plan_id) "
        "VALUES (?, ?, ?, ?, ?)",
        (
            game_id,
            internal.model_dump_json(),
            public.model_dump_json(),
            json.dumps(card_map),
            plan_id,
        ),
    )
    return game_id
