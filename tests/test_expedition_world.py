"""Ensure the playable map, public codex and published numeric rules agree."""

from itertools import product

import pytest

from backend.rpg import expedition_world as world


def test_atlas_cross_references_and_distinct_encounter_behaviors():
    atlas = world.expedition_catalog()
    regions = atlas.regions
    assert len(regions) == len({r.id for r in regions}) == 8
    assert len(set(r.objective for r in regions)) == len(regions)
    assert all(r.arrival != r.resolution for r in regions)
    expected = [i for r in regions for i in [*r.normal_encounters, *r.elite_encounters, r.boss_id]]
    assert len(expected) == len(set(expected)) == len(atlas.encounters) == 32
    assert set(expected) == {e.id for e in atlas.encounters}
    assert {rid for r in regions for rid in r.relic_ids} == {r.id for r in atlas.relics}
    intents = {i.id for i in atlas.intents}
    assert all(set(e.intents + e.enraged_intents) <= intents for e in atlas.encounters)
    bosses = [world.encounter_for(r.boss_id) for r in regions]
    assert len({e.trait_id for e in bosses}) == len(bosses)
    assert len({(tuple(e.intents), tuple(e.enraged_intents)) for e in bosses}) == len(bosses)
    assert all(e.intents != e.enraged_intents for e in bosses)
    # The public JSON is safe to reuse by callers that annotate their local copy.
    atlas.regions[0].normal_paths.clear()
    atlas.encounters[0].intents.clear()
    atlas.relics[0].bonuses.heal_on_win = 999
    untouched = world.expedition_catalog()
    assert untouched.regions[0].normal_paths and untouched.encounters[0].intents
    assert untouched.relics[0].bonuses.heal_on_win != 999


def test_routes_offer_an_actual_choice_for_every_book_size_and_converge_at_the_boss():
    for region_index, length in product(range(8), range(1, 5)):
        region = world.region_at(region_index)
        for scene in range(length):
            routes = world.routes_for(region_index, scene, length)
            assert len(routes) == len({r.id for r in routes}) == 2
            assert {r.approach for r in routes} == {"steady", "daring"}
            for route in routes:
                assert world.route_encounter(region_index, scene, route.risk).id == route.encounter_id
                assert world.encounter_for(route.encounter_id).tier == route.risk
            if scene == length - 1:
                assert [route.encounter_id for route in routes] == [region.boss_id] * 2
                assert all(route.boss for route in routes)
            else:
                assert len({route.encounter_id for route in routes}) == 2
                assert all(not route.boss for route in routes)
    for invalid in [(-1, 0, 1), (8, 0, 1), (0, -1, 1), (0, 2, 2), (0, 5, 5)]:
        with pytest.raises(ValueError):
            world.routes_for(*invalid)


def test_region_finds_preserve_provenance_and_cap_stacks():
    atlas = world.expedition_catalog()
    for index, region in enumerate(atlas.regions):
        first = world.reward_relics(index, 0, [])
        second = world.reward_relics(index, 1, [])
        assert [r.id for r in first[:2]] == region.relic_ids
        assert [r.id for r in second[:2]] == list(reversed(region.relic_ids))
        copies = [first[0].id] * first[0].max_stacks
        assert first[0].id not in [r.id for r in world.reward_relics(index, 0, copies)]
        assert world.relic_bonuses(copies) == world.relic_bonuses(copies + [first[0].id])
    owned = [r.id for r in atlas.relics for _ in range(r.max_stacks)]
    assert world.reward_relics(7, 3, owned) == []
    assert world.reward_relics(0, 0, [], 0) == []
    combined = world.relic_bonuses(["rivet_wedge", "brine_lens", "shell_tally", "ferryman_knot"])
    assert combined.attack == -1 and combined.break_power == 1 and combined.burst_percent == 18
    assert combined.counter == 1 and combined.opening_focus == 1 and combined.heal_on_win == 4


@pytest.mark.parametrize("boss,intent,skill,turn,late,bonuses", [
    ("willow_lock", "charge", "guard", 0, False, {"break_power": 2}),
    ("tidal_engine", "expose", "strike", 0, True, {"incoming": 8}),
    ("copper_drake", "ward", "burst", 0, False, {"incoming": 6, "break_power": 1}),
    ("wind_schooner", "heavy", "strike", 1, True, {"outgoing": 4}),
    ("redline_scribe", "charge", "strike", 0, False, {"incoming": 10}),
    ("mirror_lynx", "strike", "guard", 0, True, {"break_power": 1}),
    ("bellfounder", "heavy", "strike", 2, False, {"outgoing": 4}),
    ("eclipse_lion", "heavy", "guard", 0, False, {"break_power": 1}),
    ("eclipse_lion", "expose", "burst", 0, True, {"incoming": 12}),
])
def test_boss_trait_has_a_real_trigger_and_a_neutral_turn(boss, intent, skill, turn, late, bonuses):
    assert world.trait_bonuses(boss, turn=turn, enraged=late, intent_id=intent,
                               skill=skill) == world.TraitBonuses(**bonuses)
    assert world.trait_bonuses(boss, turn=0, enraged=False, intent_id="strike",
                               skill="strike") == world.TraitBonuses()
