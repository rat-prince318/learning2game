"""Publish one immutable, shuffled RPG configuration and its private answer key."""

import json
import sqlite3
from secrets import SystemRandom
from uuid import uuid4

from fastapi import HTTPException

from ..models import MaterialResult
from .models import RPGChallengePublic, RPGGameInternal, RPGGamePublic, RPGPlan
from .validation import check_game


def _opaque_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


def _rekey(internal: RPGGameInternal) -> RPGGameInternal:
    """Replace all structural IDs. Keep the knowledge IDs used by reports private."""
    config = internal.model_dump(mode="json")
    scene_ids = {s["scene_id"]: _opaque_id("sc") for s in config["scenes"]}
    config["start_scene_id"] = scene_ids[config["start_scene_id"]]
    rng = SystemRandom()
    for scene in config["scenes"]:
        scene["scene_id"] = scene_ids[scene["scene_id"]]
        scene["next_scene_id"] = scene_ids.get(scene["next_scene_id"])
        quest = scene["quest"]
        quest["quest_id"] = _opaque_id("qu")
        quest["reward"]["item"]["id"] = _opaque_id("it")
        challenge_ids = {}
        for challenge in scene["challenges"]:
            key = _opaque_id("ch")
            challenge_ids[challenge["challenge_id"]] = key
            challenge["challenge_id"] = key
            options = challenge["options"]
            option_ids = {option["id"]: _opaque_id("op") for option in options}
            challenge["correct_option_id"] = option_ids[challenge["correct_option_id"]]
            for option in options:
                option["id"] = option_ids[option["id"]]
            rng.shuffle(options)
        quest["challenge_ids"] = [challenge_ids[k] for k in quest["challenge_ids"]]
    return RPGGameInternal.model_validate(config)


def _public_view(game_id: str, internal: RPGGameInternal) -> RPGGamePublic:
    # Copy the challenge allowlist. A newly added private field cannot flow to a player.
    fields = set(RPGChallengePublic.model_fields)
    params = internal.model_dump(exclude={"scenes"})
    scenes = []
    for scene in internal.scenes:
        entry = scene.model_dump(exclude={"challenges"})
        entry["challenges"] = [q.model_dump(include=fields) for q in scene.challenges]
        scenes.append(entry)
    return RPGGamePublic(game_id=game_id, scenes=scenes, **params)


def store_rpg_game(conn: sqlite3.Connection, internal: RPGGameInternal, plan_id: str) -> str:
    """Check the saved confirmation and source records inside the publishing transaction."""
    row = conn.execute(
        """SELECT p.game_type,p.confirmed_at,p.config_json,p.scope_json,m.result_json
           FROM plans AS p JOIN materials AS m ON m.id=p.material_id WHERE p.id=?""", (plan_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(404, "找不到这个方案。")
    if row[0] != "rpg_quest" or row[1] is None:
        raise HTTPException(409, "请先确认本轮 RPG 方案。")
    plan = RPGPlan.model_validate_json(row[2])
    internal = RPGGameInternal.model_validate(internal)
    material = MaterialResult.model_validate_json(row[4])
    if set(plan.knowledge_ids) - set(json.loads(row[3])) or not check_game(internal, plan, material.knowledge).valid:
        raise ValueError("The RPG configuration must match the confirmed plan, scope and source records.")
    game_id = _opaque_id("g")
    private = _rekey(internal)
    public = _public_view(game_id, private)
    conn.execute(
        """INSERT INTO games (id,game_type,plan_id,internal_json,public_json,card_map_json)
           VALUES (?,'rpg_quest',?,?,?,'{}')""",
        (game_id, plan_id, private.model_dump_json(), public.model_dump_json()),
    )
    return game_id


def _read(conn: sqlite3.Connection, game_id: str, *, public: bool):
    column = "public_json" if public else "internal_json"
    row = conn.execute(f"SELECT game_type,{column} FROM games WHERE id=?", (game_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "找不到这局游戏。")
    if row[0] != "rpg_quest":
        raise HTTPException(409, "请使用这局游戏对应的玩法接口。")
    return row[1]


def read_rpg_game(conn: sqlite3.Connection, game_id: str) -> RPGGamePublic:
    return RPGGamePublic.model_validate_json(_read(conn, game_id, public=True))


def read_rpg_internal(conn: sqlite3.Connection, game_id: str) -> RPGGameInternal:
    return RPGGameInternal.model_validate_json(_read(conn, game_id, public=False))
