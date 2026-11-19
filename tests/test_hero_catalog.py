"""Progression and equipment invariants independent of the battle transport."""

import pytest

from backend.rpg.hero_catalog import (
    LEVEL_THRESHOLDS, Gear, Loadout, catalog, class_info, equipment, initial_loadout,
    level_for_xp, stage_rewards, starter_inventory, stats_for, xp_to_next_level,
)


def test_level_boundaries_match_total_xp_and_max_level():
    assert LEVEL_THRESHOLDS == (0, 30, 65, 105, 150, 205)
    for level, threshold in enumerate(LEVEL_THRESHOLDS, start=1):
        assert level_for_xp(threshold) == level
        if threshold:
            assert level_for_xp(threshold - 1) == level - 1
            assert xp_to_next_level(threshold - 1) == 1
        if level < len(LEVEL_THRESHOLDS):
            assert xp_to_next_level(threshold) == LEVEL_THRESHOLDS[level] - threshold
    assert level_for_xp(215) == level_for_xp(10_000) == 6
    assert xp_to_next_level(205) == xp_to_next_level(215) == 0
    with pytest.raises(ValueError):
        level_for_xp(-1)


@pytest.mark.parametrize("class_id", ["arcanist", "vanguard", "ranger"])
@pytest.mark.parametrize("kit", ["trail", "ward"])
def test_loadouts_first_clear_sidegrades_and_all_four_weapon_drops(class_id, kit):
    hero = class_info(class_id)
    worn = initial_loadout(class_id, kit)
    inventory = starter_inventory(class_id, kit)
    assert set(inventory) == {worn.weapon, worn.armor, worn.accessory}
    assert set(equipment(i).slot for i in inventory) == {"weapon", "armor", "accessory"}
    previous_attack = stats_for(class_id, 0, worn).attack
    for number in range(1, 5):
        rewards = stage_rewards(class_id, number, kit)
        weapon = rewards[0]
        assert weapon.id == hero.weapon_ids[number] and weapon.class_id == class_id and weapon.tier == number
        assert set(g.id for g in rewards).isdisjoint(inventory)
        inventory.extend(g.id for g in rewards)
        if number == 1:
            assert [g.slot for g in rewards] == ["weapon", "armor", "accessory"]
            assert {g.id for g in catalog().equipment if g.class_id is None} <= set(inventory)
        else:
            assert len(rewards) == 1
        worn = worn.model_copy(update={"weapon": weapon.id})
        attack = stats_for(class_id, 0, worn).attack
        assert attack > previous_attack
        previous_attack = attack


def test_each_class_and_equipment_slot_changes_combat_parameters():
    mage, tank, bow = (stats_for(k, 0, initial_loadout(k)) for k in ("arcanist", "vanguard", "ranger"))
    assert tank.max_hp > bow.max_hp > mage.max_hp
    assert tank.defense > bow.defense > mage.defense
    assert mage.burst_percent > tank.burst_percent > bow.burst_percent
    assert bow.crit_every < mage.crit_every < tank.crit_every
    assert bow.focus_max < mage.focus_max < tank.focus_max
    for hero in catalog().classes:
        fast = initial_loadout(hero.id, "trail")
        ward = initial_loadout(hero.id, "ward")
        full_ward = stats_for(hero.id, 0, ward)
        mixed = stats_for(hero.id, 0, fast.model_copy(update={"armor": ward.armor}))
        full_fast = stats_for(hero.id, 0, fast)
        assert full_ward.max_hp > mixed.max_hp > full_fast.max_hp
        assert full_ward.defense > mixed.defense > full_fast.defense
        assert full_fast.attack > mixed.attack and mixed.crit_every < full_ward.crit_every
        promoted = stats_for(hero.id, 30, fast)
        assert (promoted.max_hp - full_fast.max_hp, promoted.attack - full_fast.attack,
                promoted.defense - full_fast.defense) == (hero.hp_growth, hero.attack_growth, hero.defense_growth)
        assert stats_for(hero.id, 1_000, fast) == stats_for(hero.id, 205, fast)


def test_catalogue_copies_and_legacy_weapon_objects():
    response = catalog()
    assert len({g.id for g in response.equipment}) == len(response.equipment) == 19
    response.classes[0].weapon_ids.clear()
    response.equipment[0].name = "临时值"
    assert catalog().classes[0].weapon_ids[0] == "twig_focus"
    assert equipment("twig_focus").name == "嫩枝法杖"
    old = Gear.model_validate({"id": "amber_focus", "name": "琥珀枝杖", "attack_bonus": 11, "tier": 1})
    assert old == equipment("amber_focus")
    with pytest.raises(ValueError):
        stats_for("arcanist", 0, Loadout(weapon="camp_blade"))
    with pytest.raises(ValueError):
        stats_for("arcanist", 0, Loadout(weapon="ward_vest"))
    with pytest.raises(ValueError):
        stats_for("arcanist", 0, Loadout(weapon="unknown"))
