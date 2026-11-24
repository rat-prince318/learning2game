import json
from pathlib import Path

import pytest

from backend.court_choices import CourtChoicesUnavailable, prepare_choices


def card(left, right, **kwargs):
    return dict(left=left, right=right, **kwargs)


@pytest.mark.parametrize("language", ["zh", "en"])
def test_warmups_offer_four_comparable_answers_and_grade_velocity_direction(language):
    fixture = Path(__file__).parents[1] / "backend" / "fixtures" / f"court-{language}.json"
    items = json.loads(fixture.read_text(encoding="utf-8"))["shots"]
    assert len(items) == 4
    for item in items:
        result = prepare_choices(
            card(item["ball"], item["hoop"], distractors=item["distractors"]), language=language
        )
        assert result == (item["ball"], item["hoop"], item["distractors"])
        assert len(set([result[1], *result[2]])) == 4
    velocity = [items[2]["hoop"], *items[2]["distractors"]]
    assert all("m/s" in v for v in velocity)
    assert sum(("west" if language == "en" else "向西") in v for v in velocity) == 2
    assert sum("48" in v for v in velocity) == 2


def test_exam_preserves_prompt_and_key_for_the_selected_language():
    file = dict(
        exam_question=dict(
            correct_index=2,
            en=dict(
                prompt="Which organelle reads messenger RNA?", options=["Chloroplast", "Nucleus", "Ribosome"]
            ),
            zh=dict(prompt="哪个细胞结构读取信使 RNA 的信息？", options=["叶绿体", "细胞核", "核糖体"]),
        )
    )
    prompt, answer, wrong = prepare_choices(card("outdated prompt", "old answer"), file, "zh")
    assert (prompt, answer, wrong) == ("哪个细胞结构读取信使 RNA 的信息？", "核糖体", ["叶绿体", "细胞核"])


def test_exam_supplements_three_numeric_choices_without_reintroducing_equivalent_units():
    source = dict(
        exam_question=dict(
            correct_index=1,
            en=dict(
                prompt="How far does a cart travel in 2 seconds at 2 m/s?",
                options=["2 m", r"\(4\,\mathrm{m}\)", "8 m"],
            ),
        )
    )
    prompt, answer, wrong = prepare_choices(card("ignored", "ignored"), source, "en")
    assert answer == r"\(4\,\mathrm{m}\)" and wrong[:2] == ["2 m", "8 m"]


def test_exam_keeps_a_sound_foil_and_repairs_an_unrelated_quantity_and_an_equivalent_choice():
    source = dict(
        exam_question=dict(
            correct_index=1,
            en=dict(
                prompt="What is the distance travelled by a cart moving at 2 m/s for 2 s?",
                options=["2 m", "4 m", "400 cm", "8 J"],
            ),
        )
    )
    _, answer, wrong = prepare_choices(card("old", "old"), source, "en")
    assert answer == "4 m" and wrong[0] == "2 m"
    assert len(wrong) == 3 and all(option.endswith(" m") for option in wrong)
    assert len(wrong) == 3 and "m" in wrong[2]
    with pytest.raises(CourtChoicesUnavailable):
        prepare_choices(
            card("How far does the cart travel?", "4 m", distractors=["400 cm", "0.004 km", "7 m"]),
            language="en",
        )


@pytest.mark.parametrize(
    ("correct", "unit"),
    [
        (r"$-2.5\,\mathrm{m/s}$ east", r"\mathrm{m/s}$ east"),
        (r"\(4\,\mathrm{rad/s^2}\)", r"\mathrm{rad/s^2}"),
        ("Increases by 60 J", " J"),
        ("0 J", " J"),
        ("0.5", ""),
    ],
)
def test_scalar_calculations_retain_quantities_directions_and_equation_format(correct, unit):
    _, right, wrong = prepare_choices(card("What is the measured value?", correct), language="en")
    assert len({right, *wrong}) == 4 and all(unit in v for v in wrong)
    if "east" in correct:
        assert all(v.startswith("$-") and v.endswith(" east") for v in wrong)


def test_probabilities_stay_in_range_and_set_valued_prompts_do_not_make_multiple_keys():
    _, _, options = prepare_choices(card("What is the probability of success?", "1"))
    assert all(0 <= float(s) < 1 for s in options)
    with pytest.raises(CourtChoicesUnavailable):
        prepare_choices(card("Give an example of a prime number.", "5"))


def test_distinct_terms_within_the_subject_have_priority_over_the_general_word_bank():
    peers = [
        dict(term="线粒体", definition="进行有氧呼吸，为生命活动供能。"),
        dict(term="核糖体", definition="利用信使 RNA 合成蛋白质。"),
        dict(term="秒表", definition="测量一段时间。"),
    ]
    q, right, wrong = prepare_choices(
        card("细胞膜", "选择性地控制物质进出细胞。"), language="zh", peers=peers
    )
    assert right == "细胞膜" and "物质进出" in q and wrong[:2] == ["线粒体", "核糖体"] and "秒表" not in wrong
    _, right, wrong = prepare_choices(
        card("测量液体的冷热程度，该使用哪件仪器？", "温度计", study_term="温度计"), language="zh"
    )
    assert right == "温度计" and set(wrong) <= {"天平", "秒表", "流量计", "压力计", "湿度计"}


def test_saved_formula_lesson_keeps_real_algebra_on_every_board():
    _, right, wrong = prepare_choices(
        card("Mean", r"The average is given by \(\bar{x}=\frac{1}{n}\sum_i x_i\).")
    )
    assert all(v.startswith("$") and v.endswith("$") for v in [right, *wrong])
    assert r"\frac{1}{n}" in right and len(set([right, *wrong])) == 4


def test_glossary_siblings_need_shared_technical_evidence_and_separate_meanings():
    topic = dict(
        term="Arbor tensioner", definition="Regulates the drive belt tension on the winding spindle."
    )
    peers = [
        dict(term="Brake shoe", definition="Stops the winding spindle by friction."),
        dict(term="Feed guide", definition="Aligns the yarn with the winding spindle."),
        dict(term="Mitochondrion", definition="Produces ATP in the cell."),
    ]
    result = prepare_choices(card(topic["term"], topic["definition"]), topic, "en", peers)
    assert set(result[2]) == {"Brake shoe", "Feed guide"}
    with pytest.raises(CourtChoicesUnavailable):
        prepare_choices(card(topic["term"], topic["definition"]), topic, "en", [peers[0], peers[-1]])


def test_missing_evidence_images_and_bare_letters_fail_explicitly():
    for pair in [
        card("What kind of tool is it?", "Xyloframe"),
        card("Which value is shown in Figure 2?", "3 m"),
        card("Which component performs the operation?", "A", distractors=["B", "C", "D"]),
    ]:
        with pytest.raises(CourtChoicesUnavailable):
            prepare_choices(pair, language="en")


def test_homonyms_do_not_receive_wrong_subject_options_and_stack_is_a_real_trace():
    with pytest.raises(CourtChoicesUnavailable):
        prepare_choices(card("Root", "Takes up water from the soil."), language="en")
    q, correct, wrong = prepare_choices(card("Stack", "A last-in, first-out structure."), language="en")
    assert "Pop" in q and correct == "[9, 7, 2]"
    assert all(v.startswith("[") and v.endswith("]") for v in wrong)
