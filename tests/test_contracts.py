import json
import sqlite3
from contextlib import closing
from pathlib import Path

import pytest
from pydantic import ValidationError

from backend.games import store_game
from backend.models import AttemptInput, GameConfigInternal, MatchingPlan, MaterialResult, UserPreferences
from backend.services import DEMO_MATERIAL_TEXT, DemoServices, demo_game


def test_uploaded_demo_is_exact_and_plan_preserves_selections(tmp_path):
    path = tmp_path / "lecture.txt"
    path.write_bytes(DEMO_MATERIAL_TEXT.replace("\n", "\r\n").encode("utf-8-sig"))
    services = DemoServices()
    material = services.extract(path)
    assert len(material.knowledge) == 6
    selected = [material.knowledge[3], material.knowledge[1]]
    plan = services.plan(selected, UserPreferences(goal="preview", difficulty="hard", pair_count=2))
    assert plan.goal == "preview"
    assert plan.knowledge_ids == [item.knowledge_id for item in selected]
    assert plan.relationship_type == "term_scenario"
    assert plan.rationale and not plan.warnings
    game = services.generate(material.knowledge, plan)
    assert [pair.source_ref for pair in game.pairs] == [item.source_ref for item in selected]
    assert [pair.right for pair in game.pairs] == [item.example for item in selected]
    for content in [b"my original material", b"\xff\xff", path.read_bytes() + b"x"]:
        path.write_bytes(content)
        with pytest.raises(ValueError, match="示例讲义"):
            services.extract(path)


def test_sample_plan_uses_preferences_and_available_concepts(tmp_path):
    path = tmp_path / "sample.txt"
    path.write_text(DEMO_MATERIAL_TEXT, encoding="utf-8")
    services = DemoServices()
    selected = services.extract(path).knowledge[:2]
    beginner = services.plan(selected, UserPreferences(goal="recognize", difficulty="easy"))
    assert beginner.learner_level == "beginner"
    assert beginner.warnings and len(beginner.knowledge_ids) == 2
    familiar = services.plan(selected, UserPreferences(learner_level="familiar", difficulty="easy"))
    contrast = services.plan(selected, UserPreferences(goal="distinguish"))
    assert contrast.relationship_type == "term_scenario"
    assert services.generate(selected, beginner).pairs[0].right == (
        f"{selected[0].definition} 例：{selected[0].example}"
    )
    assert services.generate(selected, familiar).pairs[0].right == selected[0].definition


@pytest.mark.parametrize("difficulty", ["easy", "medium", "hard"])
def test_demo_practice_rephrases_the_same_concepts_in_the_confirmed_relation(tmp_path, difficulty):
    path = tmp_path / "sample.txt"
    path.write_text(DEMO_MATERIAL_TEXT, encoding="utf-8")
    services = DemoServices()
    items = services.extract(path).knowledge
    plan = services.plan(items, UserPreferences(difficulty=difficulty))
    previous = services.generate(items, plan)
    selected = [items[4], items[0]]
    targeted = services.plan(selected, UserPreferences(difficulty=difficulty))
    repeated = services.generate(selected, targeted, previous)
    by_id = {pair.knowledge_id: pair for pair in previous.pairs}
    assert [pair.knowledge_id for pair in repeated.pairs] == [item.knowledge_id for item in selected]
    assert targeted.relationship_type == plan.relationship_type
    for pair in repeated.pairs:
        prior = by_id[pair.knowledge_id]
        assert pair.right != prior.right
        assert pair.source_ref == prior.source_ref
    again = services.generate(selected, targeted, repeated)
    assert all(a.right != b.right for a, b in zip(again.pairs, repeated.pairs, strict=True))


@pytest.mark.parametrize("field", ["pair_id", "knowledge_id", "left", "right"])
def test_internal_game_rejects_ambiguous_identifiers_or_card_text(field):
    game = demo_game().model_dump()
    pairs = game["pairs"]
    pairs[1][field] = pairs[0][field]
    if field in {"left", "right"}:
        pairs[0][field], pairs[1][field] = "Loss  function", "ＬＯＳＳ function "
    with pytest.raises(ValidationError, match="distinct"):
        GameConfigInternal.model_validate(game)


def test_invalid_controls_are_refused():
    with pytest.raises(ValidationError):
        UserPreferences(pair_count=1)
    with pytest.raises(ValidationError):
        MatchingPlan(title="Sample", difficulty="easy", knowledge_ids=["x", "x"])
    with pytest.raises(ValidationError):
        AttemptInput(event_id="e", left_id="l", right_id="r", is_correct=True)
    with pytest.raises(ValidationError):
        AttemptInput(event_id="a\nb", left_id="l", right_id="r")
    item = {"term": "T", "definition": "D", "source_ref": "p1", "knowledge_id": "k"}
    with pytest.raises(ValidationError):
        MaterialResult(knowledge=[item, item])


def test_adapter_boundary_revalidates_nested_model_instances():
    game = demo_game()
    game.pairs[0] = game.pairs[0].model_copy(update={"source_ref": " "})
    with pytest.raises(ValidationError):
        GameConfigInternal.model_validate(game)


def test_public_projection_hides_answers_and_keeps_consistent_server_keys():
    internal = demo_game()
    by_pair = {pair.pair_id: pair for pair in internal.pairs}
    schema = Path(__file__).resolve().parents[1] / "backend" / "schema.sql"
    with closing(sqlite3.connect(":memory:")) as conn:
        conn.executescript(schema.read_text(encoding="utf-8"))
        issued_cards: set[str] = set()
        for _ in range(2):
            game_id = store_game(conn, internal)
            raw_public, raw_map = conn.execute(
                "SELECT public_json,card_map_json FROM games WHERE id=?", (game_id,)
            ).fetchone()
            public, card_map = json.loads(raw_public), json.loads(raw_map)
            assert set(public) == {"game_id", "title", "left_cards", "right_cards"}
            assert public["game_id"] == game_id
            for side in ("left", "right"):
                cards = public[f"{side}_cards"]
                assert len(cards) == len(internal.pairs)
                assert set(card_map[side].values()) == set(by_pair)
                for card in cards:
                    assert set(card) == {"id", "text"}
                    assert card["id"] not in issued_cards
                    pair = by_pair[card_map[side][card["id"]]]
                    assert card["id"] not in {pair.knowledge_id, pair.pair_id}
                    assert card["text"] == getattr(pair, side)
                    issued_cards.add(card["id"])
