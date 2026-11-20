"""Exercise multi-source publishing, receipts, cleanup and New Game+ on the public API."""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.db import connection
from backend.main import create_app
from backend.pipeline import _knowledge
from backend.question_identity import exercise_key
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


def test_backpack_commands_survive_retries_and_restart(app, tmp_path):
    with TestClient(app) as c:
        source = upload(c, "pack.txt", b"\n".join(COURSE.read_bytes().splitlines()[:4]))
        book = c.post("/rpg/expedition-outline", json={
            "sources": [{"material_id": source["material_id"]}]}).json()["volumes"][0]
        start = opening(c, [publish(c, book["plan_request"])])
        path = f"{BASE}/{start['session_id']}"
        action = payload(start, "use_item", item_id="focus_tea")
        with ThreadPoolExecutor(max_workers=2) as pool:
            replies = list(pool.map(lambda _: c.post(path + "/actions", json=action), range(2)))
        live = replies[0].json()
        assert all(r.status_code == 200 and r.json() == live for r in replies)
        assert live["revision"] == start["revision"] + 1 and live["player"]["focus"] == 1
        assert {s["id"]: s["quantity"] for s in live["supplies"]} == {"field_bandage": 2, "focus_tea": 0}
        for body, expected in [
            ({**action, "item_id": "field_bandage"}, 409),
            (payload(start, "discard_item", item_id="field_bandage", quantity=1), 409),
            (payload(live, "discard_item", item_id="field_bandage", quantity=-1), 422),
            (payload(live, "discard_item", item_id="field_bandage", quantity=3), 409),
            (payload(live, "discard_item", item_id="invented", quantity=1), 422),
        ]:
            assert c.post(path + "/actions", json=body).status_code == expected
    with TestClient(create_app(data_dir=tmp_path)) as reopened:
        assert reopened.get(path).json() == reopened.post(path + "/actions", json=action).json() == live


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
            assert len(material.knowledge) == 65
        campaign = c.post("/rpg/expedition-outline", json={
            "eight_chapters": True, "sources": [{"material_id": over["material_id"]}]}).json()
        assert campaign["concept_count"] == 65 and len(campaign["volumes"]) == 9
        keys = [key for v in campaign["volumes"] for key in v["plan_request"]["preferences"]["selected_knowledge_ids"]]
        assert keys == [k.knowledge_id for k in material.knowledge]


def test_overlapping_exam_sources_publish_each_exercise_once_and_keep_distinct_numerical_cases(app):
    # The first two problems even have the same answer. The givens distinguish them.
    force_a = "An object of mass 6 kg accelerates at 4 m/s². Find the net force."
    force_b = "An object of mass 8 kg accelerates at 3 m/s². Find the net force."
    energy = "A cart of mass 3 kg moves at 6 m/s. What is its kinetic energy?"
    momentum = "A particle of mass 5 kg moves at 8 m/s. Determine its momentum."

    def paper(*rows):
        return ("Mechanics Quiz\n" + "\n".join(f"{i}. {row}" for i, row in enumerate(rows, 1))).encode()

    with TestClient(app) as c:
        sources = [upload(c, filename, data)["material_id"] for filename, data in [
            ("first.txt", paper(force_a, force_b, energy, force_a)),
            ("practice.txt", paper(energy, force_a, momentum)),
            ("copy.txt", paper(force_b, force_a, energy)),
        ]]
        response = c.post("/rpg/expedition-outline", json={
            "sources": [{"material_id": mid} for mid in sources], "question_language": "zh",
        })
        assert response.status_code == 200, response.text
        outline = response.json()
        assert outline["concept_count"] == 4
        assert [len(book["terms"]) for book in outline["volumes"]] == [3, 1]
        gids = [publish(c, book["plan_request"]) for book in outline["volumes"]]
        with connection(app) as db:
            questions = [q for gid in gids for scene in read_rpg_internal(db, gid).scenes for q in scene.challenges]
        assert len({q.prompt for q in questions}) == 4
        assert "6 kg" in questions[0].prompt and "8 kg" in questions[1].prompt
        assert questions[-1].source_ref.startswith("practice.txt")
        assert opening(c, gids)["chapter_count"] == 4


def test_exercise_identity_keeps_formula_case_exponents_and_code_indentation():
    assert exercise_key("Find   F?", "24 N") == exercise_key(" Find F？ ", "24 N")
    assert exercise_key("Find F?", "24 N") != exercise_key("Find f?", "24 N")
    assert exercise_key("Evaluate x²", "4") != exercise_key("Evaluate x2", "4")
    assert exercise_key("Which holds?", "Yes") != exercise_key("Which holds?", "No")
    assert exercise_key("Run:\n    print(x)", "x") != exercise_key("Run:\nprint(x)", "x")


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


def finish_campaign(client, current, books):
    from backend.rpg.quest_story import CHOICES
    from backend.rpg.expedition_models import ExpeditionState

    with connection(client.app) as db:
        published = {gid: read_rpg_internal(db, gid) for gid in books}
    solutions = {(gid, q.prompt): (q.knowledge_id, q.correct_option_id) for gid, g in published.items()
                 for scene in g.scenes for q in scene.challenges}
    path = BASE + "/" + current["session_id"]
    reached = set()
    questions = set()
    seen_in_fight = set()
    all_draws = set()
    while current["phase"] != "victory":
        phase = current["phase"]
        region = current["map"][current["region_index"]]
        reached.add(region["region_id"])
        if phase == "route":
            if region["region_id"] not in current["story_marks"]:
                action = payload(current, "story_choice", choice=CHOICES[region["region_id"]][0])
            elif not current["routes"]:
                action = (payload(current, "advance_exploration") if region["region_id"] in current["field_signals"]
                          else payload(current, "inspect_landmark"))
            else:
                seen_in_fight.clear()
                action = payload(current, "choose_route", route_id=current["routes"][0]["id"])
        elif phase == "reward":
            action = payload(current, "choose_reward", reward_id="purse")
        else:
            assert phase == "combat", current
            prompt = current["battle"]["prompt"]
            item = (current["game_id"], prompt["text"])
            progress = current["battle"]["rounds"]
            expected = {"normal": 3, "elite": 4, "boss": 4}[current["battle"]["tactics"]["tier"]]
            assert progress["total"] >= (5 if current["battle"]["tactics"]["encounter_id"] == "ash_crown" else expected)
            assert progress["completed"] == len(seen_in_fight) and prompt["text"] not in seen_in_fight
            seen_in_fight.add(prompt["text"])
            assert prompt["text"] not in all_draws
            all_draws.add(prompt["text"])
            if progress["kind"] == "source":
                kid, correct = solutions[item]
                assert kid not in questions
                questions.add(kid)
            else:
                with connection(client.app) as conn:
                    row = conn.execute("SELECT state_json FROM expedition_runs WHERE id=?", (current["session_id"],)).fetchone()
                fight = ExpeditionState.model_validate_json(row["state_json"]).battle
                drill = next(d for d in fight.encounter_drills if d.card.prompt == prompt["text"])
                assert drill.kind == progress["kind"]
                correct = drill.card.correct_option_id
            action = payload(current, "answer", prompt_id=prompt["prompt_id"], option_id=correct,
                             skill="guard")
        reply = client.post(path + "/actions", json=action)
        assert reply.status_code == 200, reply.text
        current = reply.json()
    return current, reached, questions


@pytest.mark.parametrize("size", [1, 65])
def test_eight_regions_cover_the_entire_upload_in_battle_or_on_foot(app, size):
    paper = "Mechanics Quiz\n1. An object of mass 6 kg accelerates at 4 m/s². Find the net force."
    paper += "\n2. Sketch the curve in the missing diagram and label its turning points."
    data = (paper.encode() if size == 1 else
            COURSE.read_bytes() + "\n循环缓冲区：在固定容量内按环形位置读写数据。".encode())
    with TestClient(app) as client:
        material = upload(client, "course.txt", data)
        request = {"eight_chapters": True, "sources": [{"material_id": material["material_id"]}]}
        outline = client.post("/rpg/expedition-outline", json=request)
        assert outline.status_code == 200, outline.text
        assert outline.json()["concept_count"] == size
        books = [publish(client, v["plan_request"]) for v in outline.json()["volumes"]]
        current = opening(client, books, eight_chapters=True, campaign_story=True)
        path = BASE + "/" + current["session_id"]
        counts = client.get(path + "/coverage").json()["sources"]
        assert len(counts) == 1 and counts[0]["filename"] == "course.txt"
        assert counts[0]["extracted_count"] == counts[0]["scheduled_count"] == size
        assert isinstance(counts[0]["warnings"], list)
        assert counts[0]["needs_review_count"] == (1 if size == 1 else None)
        assert len(current["map"]) == 8
        assert current["region_index"] == current["cleared_regions"] == current["covered_knowledge_count"] == 0
        assert sum(region["knowledge_count"] for region in current["map"]) == size
        if size == 65:
            assert all(region["knowledge_count"] > 0 for region in current["map"])
            assert len(books) > 8
        else:
            assert current["map"][0]["chapters"][0]["kind"] == "exploration"
            assert client.post(path + "/actions", json=payload(current, "advance_exploration")).status_code == 409
        current, reached, questions = finish_campaign(client, current, books)
        assert current["region_index"] == 7 and current["battle"]["tactics"]["encounter_id"] == "ash_crown"
        assert current["covered_knowledge_count"] == current["knowledge_count"] == len(questions) == size
        assert len(reached) == current["cleared_regions"] == 8
        assert client.get(path).json() == current
        assert client.get(path + "/report").json()["completion_rate"] == 1
        pages = client.get(path + "/notebook").json()
        assert sum(len(page["entries"]) for page in pages) == size
        for page in pages:
            assert len(page["entries"]) == current["map"][page["region_index"]]["knowledge_count"]


def test_reusing_overlapping_published_books_keeps_progress_and_sources_separate(app):
    with TestClient(app) as client:
        data = b"\n".join(COURSE.read_bytes().splitlines()[:6])
        source_a = upload(client, "A.txt", data)
        source_b = upload(client, "B.txt", data)
        with connection(app) as db:
            concepts = [k.knowledge_id for k in _knowledge(db, source_a["material_id"]).knowledge]

        def selected(source, ids):
            return publish(client, {"material_id": source["material_id"], "preferences": {
                "selected_knowledge_ids": ids, "challenge_count": len(ids), "scene_count": len(ids)}})

        first = selected(source_a, concepts[:3])
        overlap = selected(source_b, concepts[2:5])
        copy = selected(source_b, concepts[:3])
        original = opening(client, [first, overlap, copy], campaign_story=True)
        assert original["chapter_count"] == 9 and original["knowledge_count"] == 5
        duplicate = upload(client, "C.txt", data)
        v = opening(client, [first, overlap, copy], eight_chapters=True,
                    source_material_ids=[r["material_id"] for r in [source_a, source_b, duplicate]])
        path = BASE + "/" + v["session_id"]
        assert v["chapter_count"] == len(v["map"]) == 8
        assert v["knowledge_count"] == 5
        assert [chapter["game_id"] for region in v["map"] for chapter in region["chapters"]
                if chapter["kind"] == "battle"] == [first] * 3 + [overlap] * 2
        counts = client.get(path + "/coverage").json()["sources"]
        assert [(row["filename"], row["scheduled_count"]) for row in counts] == [("A.txt", 3), ("B.txt", 2), ("C.txt", 0)]
        assert client.get(BASE + "/" + original["session_id"]).json() == original
        assert client.get(path).json() == v
        finished, _, attempted = finish_campaign(client, v, [first, overlap, copy])
        assert finished["covered_knowledge_count"] == finished["knowledge_count"] == len(attempted) == 5
