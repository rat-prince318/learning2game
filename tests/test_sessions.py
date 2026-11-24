import json
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from backend.db import connection
from backend.games import court_groups
from backend.main import create_app


@pytest.fixture()
def board(tmp_path):
    app = create_app(data_dir=tmp_path, demo=True)
    with TestClient(app) as client:
        response = client.get("/demo/game")
        assert response.status_code == 200, response.text
        game = response.json()
        with connection(app) as conn:
            row = conn.execute(
                "SELECT internal_json, card_map_json FROM games WHERE id = ?", (game["game_id"],)
            ).fetchone()
        pairs = json.loads(row["internal_json"])["pairs"]
        mapping = json.loads(row["card_map_json"])
        left = {pair: card for card, pair in mapping["left"].items()}
        right = {pair: card for card, pair in mapping["right"].items()}
        answers = [(left[p["pair_id"]], right[p["pair_id"]], p["knowledge_id"]) for p in pairs]
        yield client, game, answers


def new_session(client, game):
    response = client.post(f"/games/{game['game_id']}/sessions")
    assert response.status_code == 201, response.text
    return f"/sessions/{response.json()['session_id']}"


def attempt(client, session, event_id, left, right):
    return client.post(f"{session}/attempts", json={
        "event_id": event_id, "left_id": left, "right_id": right,
    })


def hint(client, session, event_id, left):
    return client.post(f"{session}/hints", json={"event_id": event_id, "left_id": left})


@pytest.mark.parametrize("demo", [False, True])
def test_warmup_is_localized_reusable_and_keeps_its_source(tmp_path, monkeypatch, demo):
    monkeypatch.setenv("EDUGAME_MODE", "offline")
    app = create_app(data_dir=tmp_path, demo=demo)
    with TestClient(app) as client:
        english = client.get("/court/warmup?language=en").json()
        chinese = client.get("/court/warmup").json()
        assert english["game_id"] != chinese["game_id"]
        assert client.get("/court/warmup?language=en").json() == english
        assert len(english["left_cards"]) == len(chinese["right_cards"]) == 4
        assert "energy" in english["title"].lower() or "machine learning" in english["title"].lower()
        session = new_session(client, english)
        assert hint(client, session, "warm-hint", english["left_cards"][0]["id"]).status_code == 200
        assert client.post(f"{session}/finish").status_code == 200
        job = client.post(f"{session}/practice").json()["job_id"]
        assert client.get(f"/jobs/{job}").json()["status"] == "awaiting_confirmation"


def test_public_game_and_unknown_resources(board):
    client, game, _ = board
    public = client.get(f"/games/{game['game_id']}").json()
    left_cards, right_cards = public["left_cards"], public["right_cards"]
    assert {c["id"] for c in left_cards}.isdisjoint(c["id"] for c in right_cards)
    assert all(set(c) == {"id", "text"} for c in left_cards + right_cards)
    assert not ({"pairs", "card_map_json", "internal_json"} & public.keys())
    assert public["court_groups"] == game["court_groups"]
    assert client.get("/games/missing").status_code == 404
    assert client.post("/games/missing/sessions").status_code == 404
    assert client.get("/sessions/missing/report").status_code == 404


@pytest.mark.parametrize("count", range(2, 13))
def test_courts_keep_every_solution_in_reach_without_ordering_answers(count):
    left = [f"L{i}" for i in range(count)]
    right = [f"R{i}" for i in reversed(range(count))]
    public = {"left_cards": [{"id": card} for card in left],
              "right_cards": [{"id": card} for card in right]}
    key = {"left": {card: card[1:] for card in left}, "right": {card: card[1:] for card in right}}
    groups = court_groups(public, key)
    assert [card for group in groups for card in group["left_ids"]] == left
    assert sorted(card for group in groups for card in group["right_ids"]) == sorted(right)
    for group in groups:
        assert 2 <= len(group["left_ids"]) == len(group["right_ids"]) <= 4
        expected = {key["left"][card] for card in group["left_ids"]}
        assert group["right_ids"] == [card for card in right if key["right"][card] in expected]


def test_scoring_replay_and_report(board):
    client, game, answers = board
    (left_a, right_a, concept_a), (left_b, right_b, concept_b) = answers[:2]
    session = new_session(client, game)
    assert client.get(f"{session}/report").status_code == 409
    assert attempt(client, session, "invalid", left_a, "foreign-card").status_code == 422

    wrong = attempt(client, session, "mistake", left_a, right_b)
    assert wrong.status_code == 200, wrong.text
    assert wrong.json()["correct"] is False
    assert "explanation" not in wrong.json() and "source_ref" not in wrong.json()
    assert attempt(client, session, "mistake", left_a, right_b).json() == wrong.json()
    assert attempt(client, session, "mistake", left_a, right_a).status_code == 409

    help_result = hint(client, session, "help", left_b)
    assert help_result.status_code == 200
    assert help_result.json()["hint"]
    assert attempt(client, session, "help", left_b, right_b).status_code == 409

    match = attempt(client, session, "match", left_a, right_a)
    assert match.json()["correct"] and match.json()["explanation"]
    assert attempt(client, session, "locked-left", left_a, right_b).status_code == 409
    assert attempt(client, session, "locked-right", left_b, right_a).status_code == 409
    assert hint(client, session, "locked-hint", left_a).status_code == 409
    progress = client.get(session).json()
    assert progress["status"] == "active" and progress["mistakes"] == 1
    assert progress["matched_cards"] == [{"left_id": left_a, "right_id": right_a}]
    assert progress["hints_by_left_id"] == {left_b: 1}
    assert attempt(client, session, "second", left_b, right_b).json()["correct"]

    response = client.post(f"{session}/finish")
    assert response.status_code == 200, response.text
    report = response.json()
    assert report["total_pairs"] == len(answers)
    assert report["matched_pairs"] == 2 and report["valid_attempts"] == 3
    assert report["attempted_concepts"] == report["correct_attempts"] == 2
    assert report["overall_attempt_accuracy"] == pytest.approx(2 / 3)
    assert report["first_attempt_accuracy"] == 0.5
    assert report["completion_rate"] == pytest.approx(2 / len(answers))
    assert set(report["untouched_concepts"]) == {p[2] for p in answers[2:]}
    assert report["hints_by_concept"][concept_b] == 1
    assert set(report["weak_knowledge_ids"]) == {p[2] for p in answers}
    assert report["hints_by_concept"][concept_a] == 0
    assert report["mistakes"] == 1
    details = {row["knowledge_id"]: row for row in report["concepts"]}
    assert details[concept_a]["attempts"] == 2 and details[concept_a]["mistakes"] == 1
    assert details[concept_a]["first_attempt_correct"] is False and details[concept_a]["matched"]
    assert details[concept_b]["hints"] == 1 and details[concept_b]["first_attempt_correct"] is True
    assert details[answers[2][2]]["first_attempt_correct"] is None
    assert all(row["source_ref"] and row["explanation"] and row["term"] for row in details.values())
    assert client.post(f"{session}/finish").json() == report
    assert client.get(f"{session}/report").json() == report
    assert hint(client, session, "help", left_b).json() == help_result.json()
    assert attempt(client, session, "match", left_a, right_a).json() == match.json()
    assert attempt(client, session, "closed", left_a, right_a).status_code == 409


def test_empty_session_hint_only_and_replay(board):
    client, game, answers = board
    session = new_session(client, game)
    left, _, concept = answers[0]
    assert hint(client, session, "only-hint", left).status_code == 200
    report = client.post(f"{session}/finish").json()
    assert report["valid_attempts"] == report["attempted_concepts"] == 0
    assert report["first_attempt_accuracy"] is None
    assert report["overall_attempt_accuracy"] is None
    assert report["completion_rate"] == 0
    assert set(report["untouched_concepts"]) == {p[2] for p in answers}
    assert report["hints_by_concept"][concept] == 1

    replay = new_session(client, game)
    assert replay != session
    for index, (left, right, _) in enumerate(answers):
        assert attempt(client, replay, f"m{index}", left, right).json()["correct"]
    report = client.post(f"{replay}/finish").json()
    assert report["completion_rate"] == report["first_attempt_accuracy"] == 1
    assert report["weak_knowledge_ids"] == report["untouched_concepts"] == []
    assert sum(report["hints_by_concept"].values()) == 0


def test_concurrent_submissions_and_client_cannot_set_grade(board):
    client, game, answers = board
    session = new_session(client, game)
    (left, right, _), (left_b, right_b, _) = answers[:2]
    forged = client.post(f"{session}/attempts", json={
        "event_id": "forged", "left_id": left, "right_id": right_b, "is_correct": True,
    })
    assert forged.status_code == 422
    with ThreadPoolExecutor(max_workers=4) as pool:
        duplicates = list(pool.map(lambda _: attempt(client, session, "same", left, right), range(4)))
        race = list(pool.map(lambda i: attempt(client, session, f"race-{i}", left_b, right_b), range(2)))
    assert all(r.status_code == 200 and r.json() == duplicates[0].json() for r in duplicates)
    assert sorted(r.status_code for r in race) == [200, 409]
    report = client.post(f"{session}/finish").json()
    assert report["valid_attempts"] == report["matched_pairs"] == 2


def test_active_and_finished_sessions_survive_restart(tmp_path):
    def reopen():
        return TestClient(create_app(data_dir=tmp_path, demo=True))

    with reopen() as client:
        game = client.get("/demo/game").json()
        session = new_session(client, game)
        left = game["left_cards"][0]["id"]
        original_hint = hint(client, session, "retry", left).json()

    with reopen() as client:
        assert client.get(f"/games/{game['game_id']}").json()["left_cards"] == game["left_cards"]
        assert hint(client, session, "retry", left).json() == original_hint
        report = client.post(f"{session}/finish").json()
        assert sum(report["hints_by_concept"].values()) == 1

    with reopen() as client:
        assert client.get(f"{session}/report").json() == report
        assert client.post(f"{session}/finish").json() == report
