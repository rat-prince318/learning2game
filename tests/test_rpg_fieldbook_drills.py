from ast import literal_eval
from pathlib import Path
from types import SimpleNamespace

import pytest

from backend.material_adapter import extract_material
from backend.rpg.encounter_drills import build_drills, drill_key
from backend.rpg.expedition_world import route_encounter
from backend.rpg.fieldbook_drills import fieldbook_drills
from backend.rpg.models import RPGChallengeInternal, RPGOption


def fieldbook(tmp_path, language):
    # The shipped pocket notes are a literal array shared by the browser's two
    # text-file exports. Use it here so curriculum changes surface in this test.
    asset = Path(__file__).resolve().parents[1] / "public/rpg/world/fieldbook.js"
    literal = asset.read_text(encoding="utf8").split("const notes = ", 1)[1].split(";\n", 1)[0]
    offset = 2 if language == "en" else 0
    lines = [row[offset] + "：" + row[offset+1] for row in literal_eval(literal)]
    f = tmp_path / f"lantern-fieldbook-{language}.txt"
    f.write_text("\n".join(lines), encoding="utf8")
    return extract_material(f).knowledge


def published(item):
    return RPGChallengeInternal(
        challenge_id="question-" + item.knowledge_id, knowledge_id=item.knowledge_id,
        prompt="Choose the term for this observation.", correct_option_id="a",
        options=[RPGOption(id="a", text=item.term), RPGOption(id="b", text="Another label"),
                 RPGOption(id="c", text="Last label")],
        hint="Find the measured quantity.", explanation=item.definition, source_ref=item.source_ref,
        evidence=item.evidence, success_text="Done.", remediation_text="Try again.")


def correct(card):
    return next(o.text for o in card.options if o.id == card.correct_option_id)


@pytest.mark.parametrize("edition", ["zh", "en"])
def test_full_courier_fieldbook_has_localized_subject_applications(tmp_path, edition):
    material = fieldbook(tmp_path, edition)
    assert len(material) == 32
    prompts = {"zh": set(), "en": set()}
    for number, item in enumerate(material, start=1):
        q = published(item)
        target = 4 if number == 32 else 3
        for language in ("zh", "en"):
            cards = fieldbook_drills(q, item, language)
            assert len(cards) == len({c.challenge_id for c in cards}) == target
            assert len({c.prompt for c in cards} - prompts[language]) == target
            prompts[language].update(c.prompt for c in cards)
            for c in cards:
                assert c.knowledge_id == item.knowledge_id and c.source_ref == item.source_ref
                assert len({o.text for o in c.options}) == len({o.id for o in c.options}) == 3
                assert c.prompt != q.prompt and c.hint != c.explanation
                localized = " ".join([c.prompt, c.hint, c.explanation, *(o.text for o in c.options)])
                assert any("\u3400" <= char <= "\u9fff" for char in localized) == (language == "zh")
    assert len(prompts["zh"]) == len(prompts["en"]) == 97


@pytest.mark.parametrize("language", ["zh", "en"])
def test_all_elite_routes_can_draw_from_their_own_subject(tmp_path, language):
    material = fieldbook(tmp_path, language)
    occupied = set()
    for index, item in enumerate(material):
        region, stage = divmod(index, 4)
        route = "boss" if stage == 3 else "elite"
        encounter = "ash_crown" if index == 31 else route_encounter(region, stage, route).id
        scene = SimpleNamespace(challenges=[published(item)])
        cards = build_drills(scene, material, language, encounter, occupied)
        assert len(cards) == (4 if index == 31 else 3)
        assert all(d.kind == "application" and d.card.knowledge_id == item.knowledge_id for d in cards)
        occupied.update(drill_key(d.card) for d in cards)
    assert len(occupied) == 97


def test_worked_answers_and_receipts_match_the_original_course(tmp_path):
    material = fieldbook(tmp_path, "en")
    examples = {
        "Stack": ["D", "Riverbank", "]"], "Mean": ["7", "7", "5"], "Median": ["7 kg", "7", "5"],
        "Linked list": ["B", "A.next=X, X.next=B", "P.next=R"],
        "Resistance": ["20 Ω", "0.1 A", "A"], "Period": ["3 s", "4.8 s", "2.0 s"],
        "Transaction": ["Both return to pre-transfer amounts", "Commit once after both writes", "14"],
        "Angular velocity": ["3 rad/s", "3 rad", "4", "Clockwise at 2 rad/s"],
    }
    for item in material:
        if item.term in examples:
            assert [correct(c) for c in fieldbook_drills(published(item), item, "en")] == examples[item.term]

    item = material[0]
    q = published(item)
    for change in ({"source_ref": "custom.txt / line 1"}, {"source_ref": "lantern-fieldbook-en.txt / line 2"},
                   {"evidence": "Stack: A stack of coins is worth five dollars."}, {"knowledge_id": "other"}):
        assert fieldbook_drills(q, item.model_copy(update=change), "en") == []
