from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient

from backend.db import connection
from backend.main import create_app
from rpg_play_scenario import play


def test_server_gates_and_refresh_feedback(play):
    first, second = play.scenes
    a, b = first["challenges"]
    client = play.client
    start = client.get(play.session).json()
    assert start["unlocked_scene_ids"] == [first["scene_id"]]
    assert start["revision"] == start["xp"] == 0 and start["last_feedback"] is None
    assert client.get(play.session + "/report").status_code == 409
    assert play.answer(a, correct=True).status_code == 409
    assert play.action("enter_scene", scene_id=second["scene_id"]).status_code == 409
    assert play.action("enter_scene", scene_id="foreign").status_code == 422
    assert play.action("accept_quest", quest_id=second["quest"]["quest_id"]).status_code == 409
    assert play.action("accept_quest", quest_id="foreign").status_code == 422
    assert play.action("attempt", challenge_id="foreign", option_id="foreign").status_code == 422
    assert play.action("attempt", challenge_id=a["challenge_id"],
                       option_id=b["options"][0]["id"]).status_code == 422
    assert client.get(play.session).json()["revision"] == 0
    play.accept(0)
    assert play.answer(b, correct=True).status_code == 409
    assert play.action("hint", challenge_id=a["challenge_id"], xp=100).status_code == 422
    assert play.action("hint", challenge_id=a["challenge_id"],
                       option_id=a["options"][0]["id"]).status_code == 422
    first_wrong = play.answer(a, correct=False, event_id="mistake").json()
    denied = {"explanation", "source_ref", "revealed_option_id", "knowledge_id"}
    assert first_wrong["feedback"]["correct"] is False
    assert denied.isdisjoint(first_wrong["feedback"])
    assert denied.isdisjoint(first_wrong["progress"]["last_feedback"])

    hint = play.action("hint", challenge_id=a["challenge_id"], event_id="one-hint").json()
    assert hint["feedback"]["hint"] == a["hint"] and hint["feedback"]["reward_delta"] == 0
    assert play.action("hint", challenge_id=a["challenge_id"]).status_code == 409
    assert play.answer(a, correct=True, event_id="mistake").status_code == 409
    assert play.action("hint", challenge_id=a["challenge_id"], event_id="one-hint").json() == hint
    result = play.answer(a, correct=True).json()
    assert result["feedback"]["reward_delta"] == 6
    assert result["feedback"]["source_ref"] == a["source_ref"]
    assert play.answer(a, correct=False).status_code == 409
    assert play.action("hint", challenge_id=a["challenge_id"]).status_code == 409
    finishing = play.answer(b, correct=True).json()
    assert finishing["feedback"]["reward_delta"] == 30
    assert finishing["progress"]["xp"] == 36
    assert finishing["progress"]["inventory"] == [first["quest"]["reward"]["item"]]
    assert finishing["progress"]["unlocked_scene_ids"] == [first["scene_id"], second["scene_id"]]
    moved = play.accept(1)
    assert moved["progress"]["last_feedback"] == finishing["feedback"]
    assert moved["progress"]["revealed_hints"] == {a["challenge_id"]: a["hint"]}
    assert play.answer(a, correct=False, event_id="mistake").json() == first_wrong
    assert client.get(play.session).json()["revision"] == moved["progress"]["revision"]


def test_racing_moves_and_finishes_grant_one_reward(play):
    first, second = play.scenes
    a, b = first["challenges"]
    d = second["challenges"][0]
    play.accept(0)

    def send_a(_):
        return play.answer(a, correct=True, event_id="network-retry")

    with ThreadPoolExecutor(max_workers=4) as pool:
        copies = list(pool.map(send_a, range(4)))
        contenders = list(pool.map(lambda i: play.answer(b, correct=True, event_id=f"answer-{i}"), range(2)))
    assert all(r.status_code == 200 and r.json() == copies[0].json() for r in copies)
    assert sorted(r.status_code for r in contenders) == [200, 409]
    play.accept(1)
    final = play.answer(d, correct=True, event_id="last").json()
    assert final["progress"]["all_quests_completed"]
    assert final["progress"]["xp"] == 70 and len(final["progress"]["inventory"]) == 2
    with ThreadPoolExecutor(max_workers=3) as pool:
        reports = list(pool.map(lambda _: play.client.post(play.session + "/finish"), range(3)))
    assert all(r.status_code == 200 and r.json() == reports[0].json() for r in reports)
    assert reports[0].json()["weak_knowledge_ids"] == []
    assert play.answer(d, correct=True, event_id="last").json() == final
    assert play.answer(d, correct=True).status_code == 409
    assert play.client.post(play.session + "/practice", json={}).status_code == 409
    again = play.client.post(f"/rpg/games/{play.game_id}/sessions").json()
    assert again["session_id"] != final["progress"]["session_id"]
    assert again["xp"] == again["revision"] == 0 and again["inventory"] == []
    with connection(play.client.app) as conn:
        assert conn.execute("SELECT count(*) FROM rpg_events WHERE kind='attempt'").fetchone()[0] == 3
        assert conn.execute("SELECT count(*) FROM reports").fetchone()[0] == 1


def test_restart_recovers_events_published_order_and_report(play, tmp_path):
    a = play.scenes[0]["challenges"][0]
    play.accept(0)
    original = play.answer(a, correct=False, event_id="before-restart").json()
    board_url = "/rpg/games/" + play.game_id
    board = play.client.get(board_url).json()
    play.lifespan.close()
    with TestClient(create_app(data_dir=tmp_path)) as reopened:
        assert reopened.get(board_url).json() == board
        state = reopened.get(play.session).json()
        assert state["challenge_attempts"] == {a["challenge_id"]: 1}
        assert state["last_feedback"]["correct"] is False
        response = reopened.post(play.session + "/actions", json={
            "action": "attempt", "event_id": "before-restart", "challenge_id": a["challenge_id"],
            "option_id": next(o["id"] for o in a["options"] if o["id"] != a["correct_option_id"]),
        })
        assert response.json() == original
        report = reopened.post(play.session + "/finish").json()
    with TestClient(create_app(data_dir=tmp_path)) as reopened:
        assert reopened.get(play.session + "/report").json() == report
        assert reopened.get(play.session).json()["elapsed_seconds"] == report["elapsed_seconds"]
