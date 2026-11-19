import pytest

from rpg_play_scenario import job_result, play


def test_hand_scored_three_question_report(play):
    first, second = play.scenes
    a, b = first["challenges"]
    d = second["challenges"][0]
    play.accept(0)
    assert play.answer(a, correct=False).json()["feedback"]["reward_delta"] == 0
    assert play.answer(a, correct=True).json()["feedback"]["reward_delta"] == 6
    assert play.answer(b, correct=True).json()["feedback"]["reward_delta"] == 30
    play.accept(1)
    assert play.answer(d, correct=False).json()["feedback"]["reward_delta"] == 0
    helped = play.answer(d, correct=False).json()
    assert helped["feedback"]["correct"] is False and helped["feedback"]["remediated"] is True
    assert helped["feedback"]["revealed_option_id"] == d["correct_option_id"]
    assert helped["feedback"]["source_ref"] == d["source_ref"]
    assert helped["feedback"]["explanation"] == d["explanation"]
    assert helped["feedback"]["reward_delta"] == 20
    report = play.client.post(play.session + "/finish").json()
    assert report["finish_reason"] == "completed" and report["attempted_concepts"] == 3
    assert report["valid_attempts"] == 5 and report["correct_attempts"] == 2 and report["mistakes"] == 3
    assert report["first_attempt_accuracy"] == pytest.approx(1 / 3)
    assert report["overall_attempt_accuracy"] == pytest.approx(2 / 5)
    assert report["completion_rate"] == 1 and report["resolved_challenges"] == 3
    assert report["correct_challenges"] == 2 and report["remediated_challenges"] == 1
    assert report["xp"] == 56 and report["completed_quests"] == len(report["inventory"]) == 2
    assert set(report["weak_knowledge_ids"]) == {a["knowledge_id"], d["knowledge_id"]}
    assert report["untouched_concepts"] == []
    details = {c["knowledge_id"]: c for c in report["concepts"]}
    assert details[a["knowledge_id"]]["mistakes"] == 1 and details[a["knowledge_id"]]["passed"]
    assert details[b["knowledge_id"]]["first_attempt_correct"] is True
    assert details[d["knowledge_id"]]["remediated"] and not details[d["knowledge_id"]]["passed"]
    assert all(c["source_ref"] and c["explanation"] and c["term"] != c["knowledge_id"]
               for c in report["concepts"])
    assert play.client.get(play.session + "/report").json() == report


def test_hint_only_early_exit_and_null_denominators(play):
    a = play.scenes[0]["challenges"][0]
    play.accept(0)
    assert play.action("hint", challenge_id=a["challenge_id"]).status_code == 200
    report = play.client.post(play.session + "/finish").json()
    assert report["finish_reason"] == "exited" and report["xp"] == 0
    assert report["first_attempt_accuracy"] is report["overall_attempt_accuracy"] is None
    assert report["valid_attempts"] == report["attempted_concepts"] == report["completion_rate"] == 0
    assert set(report["untouched_concepts"]) == set(report["weak_knowledge_ids"])
    assert len(report["untouched_concepts"]) == 3
    assert sum(report["hints_by_concept"].values()) == report["hints_by_concept"][a["knowledge_id"]] == 1
    assert all(c["first_attempt_correct"] is None for c in report["concepts"])


def test_hint_assisted_first_success_creates_one_concept_practice(play):
    first, second = play.scenes
    a, b = first["challenges"]
    play.accept(0)
    assert play.action("hint", challenge_id=a["challenge_id"]).status_code == 200
    assert play.answer(a, correct=True).json()["feedback"]["reward_delta"] == 6
    assert play.answer(b, correct=True).status_code == 200
    play.accept(1)
    assert play.answer(second["challenges"][0], correct=True).status_code == 200
    report = play.client.post(play.session + "/finish").json()
    assert report["first_attempt_accuracy"] == report["overall_attempt_accuracy"] == 1
    assert report["xp"] == 66 and report["weak_knowledge_ids"] == [a["knowledge_id"]]
    practice = job_result(play.client, play.client.post(play.session + "/practice", json={}),
                          "awaiting_confirmation")
    plan = practice["plan"]
    assert plan["challenge_count"] == plan["scene_count"] == 1
    assert plan["knowledge_ids"] == [a["knowledge_id"]]
    assert play.client.post("/rpg/games", json={"plan_id": practice["plan_id"],
                                                 "confirmed": False}).status_code == 422
    next_game = job_result(play.client, play.client.post("/rpg/games", json={
        "plan_id": practice["plan_id"], "confirmed": True,
    }), "completed")
    assert next_game["game_id"] != play.game_id
    fresh = play.client.post(f"/rpg/games/{next_game['game_id']}/sessions").json()
    assert fresh["xp"] == fresh["revision"] == 0
    assert play.client.get(play.session + "/report").json() == report
