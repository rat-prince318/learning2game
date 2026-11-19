"""Exercise multi-source publishing, receipts, cleanup and New Game+ on the public API."""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.db import connection
from backend.main import create_app
from backend.pipeline import _knowledge
from backend.rpg.games import read_rpg_internal
from rpg_play_scenario import job_result


COURSE = Path(__file__).resolve().parents[1] / "docs/rpg-fixtures/expedition/computing-course.txt"
BASE = "/rpg/expeditions"


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("EDUGAME_MODE", "offline")
    monkeypatch.delenv("EDUGAME_SERVICE_FACTORY", raising=False)
    return create_app(data_dir=tmp_path)


def upload(client, filename, data):
    receipt = client.post("/materials", files={"file": (filename, data, "text/plain")})
    job_result(client, receipt, "completed")
    return receipt.json()


def publish(client, request):
    plan = job_result(client, client.post("/rpg/plans", json=request), "awaiting_confirmation")
    game = job_result(client, client.post("/rpg/games", json={
        "plan_id": plan["plan_id"], "confirmed": True}), "completed")
    return game["game_id"]


def opening(client, game_ids, **kwargs):
    reply = client.post(BASE, json={"game_ids": game_ids, **kwargs})
    assert reply.status_code == 201, reply.text
    return reply.json()


def payload(state, action, **fields):
    return {"action": action, "expected_revision": state["revision"], "event_id": uuid4().hex, **fields}


def test_outline_covers_a_complete_long_lecture_and_flags_excess(app):
    with TestClient(app) as c:
        assert "expedition" in c.get("/health").json()["rpg_play_modes"]
        source = upload(c, COURSE.name, COURSE.read_bytes())
        body = {"sources": [{"material_id": source["material_id"]}]}
        outline = c.post("/rpg/expedition-outline", json=body).json()
        assert (outline["concept_count"], outline["scene_count"], len(outline["volumes"])) == (64, 32, 8)
        groups = [v["plan_request"]["preferences"]["selected_knowledge_ids"] for v in outline["volumes"]]
        flat = [k for group in groups for k in group]
        assert len(set(flat)) == 64 and all(len(group) == 8 for group in groups)
        selection = {"sources": [{"material_id": source["material_id"], "selected_knowledge_ids": flat[:9]}]}
        split = c.post("/rpg/expedition-outline", json=selection).json()["volumes"]
        assert [len(v["terms"]) for v in split] == [5, 4]
        assert [k for v in split for k in v["plan_request"]["preferences"]["selected_knowledge_ids"]] == flat[:9]
        assert c.post("/rpg/expedition-outline", json={**body, "concepts_per_volume": 3}).status_code == 422
        assert c.post("/rpg/expedition-outline", json={"sources": body["sources"] * 2}).status_code == 422
        extra = COURSE.read_text(encoding="utf-8") + "\n循环缓冲区：在固定容量内按环形位置读写数据。"
        over = upload(c, "large.txt", extra.encode())
        with connection(c.app) as conn:
            material = _knowledge(conn, over["material_id"])
            assert len(material.knowledge) == 64 and any("64" in w for w in material.warnings)


def test_atomic_creation_replays_and_non_anchor_deletion(app, tmp_path):
    with TestClient(app) as c:
        catalog = c.get("/rpg/expedition-catalog").json()
        assert len(catalog["regions"]) == 8 and len(catalog["encounters"]) == 32
        sample = COURSE.read_bytes().splitlines()[:8]
        a = upload(c, "a.txt", b"\n".join(sample[:4]))
        b = upload(c, "b.txt", b"\n".join(sample[4:]))
        volumes = c.post("/rpg/expedition-outline", json={
            "sources": [{"material_id": r["material_id"]} for r in (a, b)]}).json()["volumes"]
        ids = [publish(c, v["plan_request"]) for v in volumes]
        args = {"game_ids": ids, "request_id": "two-books", "hero_class": "ranger"}
        with ThreadPoolExecutor(max_workers=3) as pool:
            starts = list(pool.map(lambda _: c.post(BASE, json=args), range(3)))
        start = starts[0].json()
        assert all(r.status_code == 201 and r.json() == start for r in starts)
        path = BASE + "/" + start["session_id"]
        assert c.post(path + "/encore").status_code == c.get(path + "/report").status_code == 409
        assert c.post(BASE, json={**args, "kit": "ward"}).status_code == 409
        assert c.post(BASE, json={**args, "game_ids": [ids[0]]}).status_code == 409
        assert c.post(BASE, json={"game_ids": [ids[0], ids[0]]}).status_code == 422
        assert c.post(BASE, json={"game_ids": [*ids, "missing"]}).status_code == 404
        action = payload(start, "choose_route", route_id=start["routes"][0]["id"])
        with ThreadPoolExecutor(max_workers=3) as pool:
            replies = list(pool.map(lambda _: c.post(path + "/actions", json=action), range(3)))
        live = replies[0].json()
        assert all(r.status_code == 200 and r.json() == live for r in replies)
        assert c.post(path + "/actions", json={**action, "route_id": "other"}).status_code == 409
        assert c.post(path + "/actions", json=payload(start, "retreat")).status_code == 409
        assert c.post(BASE, json=args).json() == live
    with TestClient(create_app(data_dir=tmp_path)) as reopened:
        assert reopened.get(path).json() == reopened.post(path + "/actions", json=action).json() == live
        assert reopened.post(path + "/actions", json=payload(live, "retreat")).json()["phase"] == "retreated"
        report = reopened.get(path + "/report").json()
        assert report["outcome"] == "retreated" and len(report["volumes"]) == 2
        assert reopened.post(path + "/encore").status_code == 409
        # The deleted material belongs to the second book, not the anchor.
        assert reopened.delete("/materials/" + b["material_id"], headers={
            "X-Material-Token": b["delete_token"]}).status_code == 204
        assert reopened.get(path).status_code == reopened.get(path + "/report").status_code == 404
        assert reopened.post(path + "/actions", json=action).status_code == 404
        with connection(reopened.app) as db:
            for table in ("expedition_events", "expedition_books", "expedition_runs"):
                assert db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] == 0
            assert db.execute("SELECT id FROM games WHERE id=?", (ids[0],)).fetchone()
            assert db.execute("PRAGMA foreign_key_check").fetchall() == []


def test_victory_unlocks_a_new_archive_with_one_earned_relic(app):
    with TestClient(app) as c:
        source = upload(c, "sample.txt", b"\n".join(COURSE.read_bytes().splitlines()[:8]))
        gid = publish(c, {"material_id": source["material_id"], "preferences": {"scene_count": 2, "challenge_count": 6}})
        with connection(app) as db:
            game = read_rpg_internal(db, gid)
        keys = {frozenset(o.id for o in q.options): q.correct_option_id for s in game.scenes for q in s.challenges}
        state = opening(c, [gid], hero_class="vanguard", kit="ward")
        path = BASE + "/" + state["session_id"]
        for _ in range(80):
            phase = state["phase"]
            if phase == "victory":
                break
            if phase == "route":
                action = payload(state, "choose_route", route_id=state["routes"][0]["id"])
            elif phase == "reward":
                relic = next(r for r in state["rewards"] if r["kind"] == "relic" and r["affordable"])
                action = payload(state, "choose_reward", reward_id=relic["id"])
            else:
                battle = state["battle"]
                prompt = battle["prompt"]
                tactics = battle["tactics"]
                intent = (tactics["intent"] or {}).get("id")
                skill = "guard" if intent in ("heavy", "charge") else "burst" if state["player"]["burst_ready"] else "strike"
                key = keys[frozenset(o["id"] for o in prompt["options"])]
                action = payload(state, "answer", prompt_id=prompt["prompt_id"], option_id=key, skill=skill)
            reply = c.post(path + "/actions", json=action)
            assert reply.status_code == 200, reply.text
            state = reply.json()
        assert state["phase"] == "victory"
        final = c.get(path + "/report").json()
        assert final["outcome"] == "victory" and final["combat_accuracy"] == 1
        assert c.post(path + "/encore", json={"inherited_relic_id": "unknown"}).status_code == 422
        heirloom = state["relics"][0]["relic"]["id"]
        choices = {"hero_class": "ranger", "inherited_relic_id": heirloom, "request_id": "encore"}
        again = c.post(path + "/encore", json=choices)
        assert again.status_code == 201, again.text
        new = again.json()
        assert new["veteran"] and new["player"]["level"] == 1 and new["player"]["hero_class"] == "ranger"
        assert new["relics"][0]["relic"]["id"] == heirloom and new["session_id"] != state["session_id"]
        assert c.post(path + "/encore", json=choices).json() == new
        assert c.get(path + "/report").json() == final
