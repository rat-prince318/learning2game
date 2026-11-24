import json
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from backend.db import connection
from backend.main import create_app


@pytest.mark.parametrize("language", ["zh", "en"])
def test_existing_three_of_four_save_can_miss_and_finish_after_upgrade(tmp_path, monkeypatch, language):
    monkeypatch.setenv("EDUGAME_MODE", "offline")
    app = create_app(data_dir=tmp_path)
    with TestClient(app) as client:
        warmup = client.get("/court/warmup", params={"language": language}).json()
        url = "/games/" + warmup["game_id"]
        sid = client.post(url + "/sessions").json()["session_id"]
        session = "/sessions/" + sid

        # Recreate the historical, shared-board storage format and a saved 3/4 round.
        with connection(app, write=True) as conn:
            row = conn.execute("SELECT * FROM games WHERE id=?", (warmup["game_id"],)).fetchone()
            key, game = json.loads(row["card_map_json"]), json.loads(row["internal_json"])
            original = dict(warmup)
            original.pop("court_options")
            original["right_cards"] = [c for c in original["right_cards"] if c["id"] in key["right"]]
            for pair in game["pairs"]:
                del pair["distractors"]
            conn.execute("UPDATE games SET internal_json=?, public_json=? WHERE id=?",
                         (json.dumps(game), json.dumps(original), warmup["game_id"]))
            balls = {pair: card for card, pair in key["left"].items()}
            boards = {pair: card for card, pair in key["right"].items()}
            last = next(p for p in game["pairs"] if p["study_term"].lower() in ("平均速度", "average velocity"))
            for p in game["pairs"]:
                if p == last:
                    continue
                receipt = {"event_id": "old-" + p["pair_id"], "left_id": balls[p["pair_id"]],
                           "right_id": boards[p["pair_id"]], "correct": True,
                           "explanation": p["explanation"], "source_ref": p["source_ref"]}
                conn.execute("""INSERT INTO events(session_id,event_id,kind,left_id,right_id,knowledge_id,correct,result_json)
                                VALUES(?,?,'attempt',?,?,?,1,?)""",
                             (sid, receipt["event_id"], receipt["left_id"], receipt["right_id"],
                              p["knowledge_id"], json.dumps(receipt)))
        # A lost acknowledgement must still replay even before the browser fetches the new game.
        payload = {k: receipt[k] for k in ("event_id", "left_id", "right_id")}
        assert client.post(session + "/attempts", json=payload).json() == receipt
        with ThreadPoolExecutor(max_workers=3) as pool:
            published = list(pool.map(lambda _: client.get(url).json(), range(3)))
        assert published[0] == published[1] == published[2]
        new = published[0]
        assert client.get("/court/warmup", params={"language": language}).json() == new
        assert len(client.get(session).json()["matched_cards"]) == 3

        left = balls[last["pair_id"]]
        correct = boards[last["pair_id"]]
        options = new["court_options"][left]
        texts = {card["id"]: card["text"] for card in new["right_cards"]}
        assert len(options) == len(set(options)) == 4
        assert all("m/s" in texts[option] for option in options)
        wrong = next(option for option in options if option != correct)
        submit = lambda event, right: client.post(session + "/attempts",
                                                  json={"event_id": event, "left_id": left, "right_id": right})
        assert submit("wrong", wrong).json()["correct"] is False
        assert client.get(url).json()["court_options"][left] == options
        foreign = next(i for i in boards.values() if i != correct)
        assert submit("cross-question", foreign).status_code == 422
        assert submit("right", correct).json()["correct"] is True
        report = client.post(session + "/finish").json()
        assert (report["matched_pairs"], report["valid_attempts"], report["mistakes"]) == (4, 5, 1)
