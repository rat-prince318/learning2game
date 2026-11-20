"""Stale cover extracts get a recovery path while immutable games retain their contents."""

import json

from backend.db import connection
from backend.legacy_exam import REUPLOAD_GUIDANCE, has_legacy_exam_cover
from backend.models import KnowledgeItem
from rpg_play_scenario import play  # noqa: F401


def header(term, definition, page=1):
    return KnowledgeItem(
        term=term,
        definition=definition,
        knowledge_id=f"old_{term.replace(' ', '_')}",
        page=page,
        source_ref=f"course.pdf / p. {page}",
    )


def test_ordinary_sources_and_later_occurrences_are_not_legacy_exams():
    item = header("Time Allowed", "3 hours")
    assert not has_legacy_exam_cover([item], "Final Project Notes.pdf")
    assert not has_legacy_exam_cover([header("Time Allowed", "3 hours", page=5)], "Mechanics Exam.pdf")
    assert not has_legacy_exam_cover([header("Orbital period", "3 hours")], "Mechanics Exam.pdf")
    assert has_legacy_exam_cover([item], "PHYS_Midterm.pdf")


def test_saved_game_is_preserved_and_stale_generations_point_to_reupload(play):  # noqa: F811
    client, gid = play.client, play.game_id
    course = client.get(f"/rpg/games/{gid}").json()
    new = client.post("/rpg/expeditions", json={"game_ids": [gid]}).json()
    assert new["legacy_exam_cover"] is False
    endpoint = "/rpg/expeditions/" + new["session_id"]
    with connection(client.app, write=True) as db:
        row = db.execute(
            "SELECT m.id,m.result_json FROM materials m JOIN plans p ON p.material_id=m.id "
            "JOIN games g ON g.plan_id=p.id WHERE g.id=?",
            (gid,),
        ).fetchone()
        original = json.loads(row["result_json"])
        original["knowledge"].extend(
            [
                header("Time Allowed", "3 Hours").model_dump(),
                header("Closed Book Exam", "One sheet of notes").model_dump(),
            ]
        )
        db.execute("UPDATE materials SET result_json=? WHERE id=?", (json.dumps(original), row["id"]))
        mid = row["id"]
    reopened = client.get(endpoint)
    assert reopened.status_code == 200 and reopened.json()["legacy_exam_cover"] is True
    assert reopened.json()["revision"] == new["revision"]
    assert client.get(f"/rpg/games/{gid}").json() == course
    assert REUPLOAD_GUIDANCE in client.get(f"/materials/{mid}/knowledge").json()["warnings"]
    for route, body in [
        ("/rpg/plans", {"material_id": mid}),
        ("/matching-plans", {"material_id": mid}),
        ("/rpg/expedition-outline", {"sources": [{"material_id": mid}]}),
    ]:
        response = client.post(route, json=body)
        assert response.status_code == 409, (route, response.text)
        assert response.json()["error"]["message"] == REUPLOAD_GUIDANCE
