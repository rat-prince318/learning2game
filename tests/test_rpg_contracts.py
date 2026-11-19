"""Wire contract, safe publishing and rekeying checks independent of a model provider."""

import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import TypeAdapter, ValidationError

from backend.db import initialize, open_database
from backend.models import KnowledgeItem, MaterialResult
from backend.rpg.games import read_rpg_game, read_rpg_internal, store_rpg_game
from backend.rpg.models import (
    GameRecommendation, RPGActionInput, RPGActionResult, RPGGameInternal, RPGGamePublic,
    RPGLearningReport, RPGPlan, RPGPreferences, RPGProgress, StudyFeedback,
)
from scripts.export_rpg_schemas import OUTPUT, SCHEMA_TYPES, schema_for


def lesson():
    ref = "讲义第 1 页"
    evidence = "叶绿体负责光合作用。"
    item = KnowledgeItem(knowledge_id="k-1", term="叶绿体", definition="进行光合作用",
                         evidence=evidence, source_ref=ref)
    plan = RPGPlan(title="观察工作室", goal="review", learner_level="beginner", difficulty="medium",
                   theme="laboratory", knowledge_ids=["k-1"], challenge_count=1, scene_count=1,
                   learning_objectives=["区分细胞器的功能"],
                   scene_outlines=[dict(name="温室", objective="查验温室样品", knowledge_ids=["k-1"])],
                   rationale="这次再练聚焦观察记录。")
    config = {
        "title": plan.title, "rules": "接受任务并完成挑战。", "theme": plan.theme,
        "start_scene_id": "original-scene",
        "scenes": [{
            "scene_id": "original-scene", "name": "温室", "description": "带观察员挑选样品。",
            "visual_key": "lab", "next_scene_id": None,
            "npc": {"name": "观察员", "dialogue": ["先读记录，再核对样品。"]},
            "quest": {"quest_id": "original-quest", "title": "观察任务", "objective": "查验温室样品",
                      "challenge_ids": ["original-challenge"], "reward": {
                          "xp": 20, "item": {"id": "original-item", "name": "温室记录章"}}},
            "challenges": [{
                "challenge_id": "original-challenge", "prompt": "哪个细胞器进行光合作用？",
                "options": [{"id": "obvious-correct", "text": "叶绿体"},
                            {"id": "wrong-1", "text": "细胞核"}, {"id": "wrong-2", "text": "核糖体"}],
                "knowledge_id": item.knowledge_id, "correct_option_id": "obvious-correct",
                "hint": "回想叶片样品吸收光的部位。", "explanation": "叶绿体负责光合作用。",
                "source_ref": ref, "evidence": evidence,
                "success_text": "观察员收下样品。", "remediation_text": "读完记录后，观察员带你继续。",
            }],
        }],
    }
    return plan, config, MaterialResult(knowledge=[item])


def test_exported_schemas_match_the_backend():
    for name in SCHEMA_TYPES:
        snapshot = json.loads((OUTPUT / f"{name}.schema.json").read_text(encoding="utf-8"))
        assert snapshot == schema_for(name), f"refresh {name} with python -m scripts.export_rpg_schemas"
    assert "correct_option_id" not in json.dumps(schema_for("RPGGamePublic"))


FIXTURES = Path(__file__).resolve().parents[1] / "docs" / "rpg-fixtures"


def _load(folder, name, model):
    return model.model_validate_json((folder / f"{name}.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("series", ["normal", "practice", "profiles/biology-hard",
                                    "profiles/geography-easy", "profiles/geography-hard"])
def test_student_handoff_fixtures_are_a_coherent_public_game(series):
    folder = FIXTURES / series
    plan = _load(folder, "plan", RPGPlan)
    public = _load(folder, "game-public", RPGGamePublic)
    private = _load(folder, "game-internal.private", RPGGameInternal)
    assert (private.title, private.theme) == (plan.title, plan.theme)
    assert public.start_scene_id == private.start_scene_id
    assert len(public.scenes) == len(private.scenes) == plan.scene_count
    for scene, shown, outline in zip(private.scenes, public.scenes, plan.scene_outlines, strict=True):
        assert scene.model_dump(exclude={"challenges"}) == shown.model_dump(exclude={"challenges"})
        assert [q.knowledge_id for q in scene.challenges] == outline.knowledge_ids
        for q, display in zip(scene.challenges, shown.challenges, strict=True):
            assert q.model_dump(include=set(type(display).model_fields)) == display.model_dump()


@pytest.mark.parametrize(("series", "question_count"), [("normal", 6), ("practice", 1)])
def test_handoff_actions_progress_and_final_score_refer_to_the_same_game(series, question_count):
    folder = FIXTURES / series
    game = _load(folder, "game-public", RPGGamePublic)
    private = _load(folder, "game-internal.private", RPGGameInternal)
    keys = {q.challenge_id: q for scene in private.scenes for q in scene.challenges}
    start = _load(folder, "session-start", RPGProgress)
    restored = _load(folder, "session-restored", RPGProgress)
    report = _load(folder, "report", RPGLearningReport)
    assert start.session_id == restored.session_id == report.session_id
    assert game.game_id == start.game_id == restored.game_id == report.game_id
    assert start.xp == start.revision == 0
    assert len(keys) == question_count == report.total_challenges
    assert {q.knowledge_id for q in keys.values()} == {c.knowledge_id for c in report.concepts}
    assert report.valid_attempts == sum(c.attempts for c in report.concepts)
    assert report.mistakes == sum(c.mistakes for c in report.concepts)
    assert report.correct_challenges == sum(c.passed for c in report.concepts)
    assert report.remediated_challenges == sum(c.remediated for c in report.concepts)
    assert report.xp == (20 * report.completed_quests
                         + sum((10 if c.first_attempt_correct and not c.hints else 6)
                               for c in report.concepts if c.passed))
    for name in ("wrong", "remediation", "correct"):
        action = _load(folder, "action-" + name, RPGActionResult)
        assert action.progress.game_id == game.game_id
        # A single-question game demonstrates the alternative correct outcome using a new session.
        if series == "practice" and name == "correct":
            assert action.progress.session_id != start.session_id
        else:
            assert action.progress.session_id == start.session_id
        feedback = action.feedback
        q = keys[feedback.challenge_id]
        assert feedback.correct == (name == "correct")
        assert feedback.remediated == (name == "remediation")
        if name == "wrong":
            assert feedback.revealed_option_id is None and feedback.explanation is None
        else:
            assert feedback.revealed_option_id == q.correct_option_id
            assert feedback.source_ref == q.source_ref
    assert restored.revision > 0


@pytest.mark.parametrize("content", ["body { color: red }", "ftp://cdn.example.org/map",
                                     "alert(1)", '<a href="#">hint</a>'])
def test_study_feedback_remains_plain_text(content):
    with pytest.raises(ValidationError):
        TypeAdapter(StudyFeedback).validate_python(content)


@pytest.mark.parametrize("extras", [
    {"selected_knowledge_ids": []}, {"selected_knowledge_ids": ["a", "a"]},
    {"scene_count": True}, {"challenge_count": 9}, {"pair_count": 3},
])
def test_invalid_preferences_rejected(extras):
    with pytest.raises(ValidationError):
        RPGPreferences(**extras)


def test_typed_recommendation_and_actions():
    with pytest.raises(ValidationError):
        GameRecommendation(recommended_type="rpg_quest", rationale="选择资料卡", supported_types=["matching"])
    action = TypeAdapter(RPGActionInput)
    assert action.validate_python({"event_id": "1", "action": "hint", "challenge_id": "c1"}).action == "hint"
    with pytest.raises(ValidationError):
        action.validate_python({"event_id": "1", "action": "hint", "challenge_id": "c1", "option_id": "o1"})


def test_count_and_assignment_must_match_plan():
    plan, _, _ = lesson()
    data = plan.model_dump()
    data["scene_outlines"][0]["knowledge_ids"][0] = "foreign"
    with pytest.raises(ValidationError):
        RPGPlan.model_validate(data)


@pytest.mark.parametrize(("path", "value"), [
    (("schema_version",), "2.0"),
    (("scenes", 0, "next_scene_id"), "original-scene"),
    (("scenes", 0, "quest", "challenge_ids"), ["missing"]),
    (("scenes", 0, "quest", "reward", "xp"), 2000),
    (("scenes", 0, "quest", "reward", "item", "id"), "original-quest"),
    (("scenes", 0, "visual_key"), "https://example.org/art.png"),
    (("scenes", 0, "npc", "dialogue"), ["<img src=x onerror=alert(1)>"]),
    (("scenes", 0, "description"), "a · b"),
    (("scenes", 0, "description"), "不是 A 而是 B"),
    (("scenes", 0, "challenges", 0, "correct_option_id"), "foreign"),
])
def test_invalid_drafts_rejected(path, value):
    _, config, _ = lesson()
    target = config
    for part in path[:-1]:
        target = target[part]
    target[path[-1]] = value
    with pytest.raises(ValidationError):
        RPGGameInternal.model_validate(config)


def test_equivalent_visible_option_text_is_rejected():
    _, config, _ = lesson()
    options = config["scenes"][0]["challenges"][0]["options"]
    options[0]["text"], options[1]["text"] = "ＡtP  pool", "atp pool"
    with pytest.raises(ValidationError):
        RPGGameInternal.model_validate(config)


def test_publication_uses_confirmed_sources_and_private_answer_keys(tmp_path):
    plan, data, material = lesson()
    internal = RPGGameInternal.model_validate(data)
    db = tmp_path / "lesson.sqlite3"
    initialize(SimpleNamespace(state=SimpleNamespace(db_path=db)))
    with open_database(db, write=True) as conn:
        conn.execute("""INSERT INTO materials(id,original_name,path,media_type,result_json)
                        VALUES ('m','lesson.txt','lesson.txt','text/plain',?)""", (material.model_dump_json(),))
        conn.execute("""INSERT INTO plans(id,material_id,game_type,config_json,scope_json,preferences_json)
                        VALUES ('p','m','rpg_quest',?,'["k-1"]','{}')""", (plan.model_dump_json(),))
        with pytest.raises(HTTPException) as pending:
            store_rpg_game(conn, internal, "p")
        assert pending.value.status_code == 409
        conn.execute("UPDATE plans SET confirmed_at=CURRENT_TIMESTAMP WHERE id='p'")
        data["scenes"][0]["challenges"][0]["source_ref"] = "讲义第 99 页"
        with pytest.raises(ValueError):
            store_rpg_game(conn, RPGGameInternal.model_validate(data), "p")
        assert conn.execute("SELECT count(*) FROM games").fetchone()[0] == 0

        game_id = store_rpg_game(conn, internal, "p")
        public = read_rpg_game(conn, game_id)
        private = read_rpg_internal(conn, game_id)
        assert isinstance(public, RPGGamePublic)
        scene = private.scenes[0]
        question = scene.challenges[0]
        assert scene.scene_id == public.start_scene_id == private.start_scene_id
        assert scene.quest.challenge_ids == [question.challenge_id]
        assert public.scenes[0].challenges[0].options == question.options
        assert next(o.text for o in question.options if o.id == question.correct_option_id) == "叶绿体"
        assert public == read_rpg_game(conn, game_id)
        output = public.model_dump_json()
        for private_value in ("original-", "obvious-correct", "wrong-1", "k-1", "correct_option_id",
                              "knowledge_id", "hint", "explanation", "source_ref", "evidence",
                              "success_text", "remediation_text", question.evidence, question.hint):
            assert private_value not in output
        assert internal.scenes[0].challenges[0].correct_option_id == "obvious-correct"
        assert conn.execute("SELECT card_map_json FROM games").fetchone()[0] == "{}"
