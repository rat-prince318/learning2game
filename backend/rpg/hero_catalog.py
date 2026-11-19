"""Character, equipment and progression tables shared by gameplay and its public catalogue."""

from bisect import bisect_right
from typing import Literal

from ..models import Count, Identifier, StrictModel
from .models import Description, ShortText

ClassId = Literal["arcanist", "vanguard", "ranger"]
KitId = Literal["trail", "ward"]
Slot = Literal["weapon", "armor", "accessory"]

# Four chapter victories award 35 + 45 + 55 + 80 XP, including the final boss.
LEVEL_THRESHOLDS = (0, 30, 65, 105, 150, 205)


class Loadout(StrictModel):
    weapon: Identifier
    armor: Identifier | None = None
    accessory: Identifier | None = None


class Gear(StrictModel):
    id: Identifier
    name: ShortText
    tier: Count
    attack_bonus: Count = 0
    # Early battle saves stored only id, name, tier and attack_bonus for staves.
    slot: Slot = "weapon"
    class_id: ClassId | None = "arcanist"
    hp_bonus: Count = 0
    defense_bonus: Count = 0
    critical_interval_reduction: Count = 0


class HeroClass(StrictModel):
    id: ClassId
    name: ShortText
    description: Description
    burst_name: ShortText
    base_hp: Count
    base_attack: Count
    base_defense: Count
    hp_growth: Count
    attack_growth: Count
    defense_growth: Count
    crit_every: Count
    focus_max: Count
    burst_percent: Count
    weapon_ids: list[Identifier]


class StarterKit(StrictModel):
    id: KitId
    name: ShortText
    description: Description
    armor: Identifier
    accessory: Identifier


class HeroStats(StrictModel):
    max_hp: Count
    attack: Count
    defense: Count
    crit_every: Count
    focus_max: Count
    burst_percent: Count


class HeroCatalog(StrictModel):
    classes: list[HeroClass]
    kits: list[StarterKit]
    equipment: list[Gear]
    level_thresholds: list[Count]


_CLASSES = {
    "arcanist": HeroClass(
        id="arcanist", name="星纹术士", description="用法杖积攒星能，抓住首领的破绽释放高威力术式。",
        burst_name="坠星术", base_hp=30, base_attack=17, base_defense=0,
        hp_growth=4, attack_growth=3, defense_growth=1, crit_every=4, focus_max=2, burst_percent=210,
        weapon_ids=["twig_focus", "amber_focus", "rain_focus", "moon_focus", "dawn_focus"],
    ),
    "vanguard": HeroClass(
        id="vanguard", name="誓盾先锋", description="以重甲承受反击，持续蓄力后挥出破阵重斩。",
        burst_name="破阵斩", base_hp=42, base_attack=14, base_defense=4,
        hp_growth=6, attack_growth=2, defense_growth=2, crit_every=5, focus_max=3, burst_percent=185,
        weapon_ids=["camp_blade", "copper_blade", "tide_blade", "cliff_blade", "sun_blade"],
    ),
    "ranger": HeroClass(
        id="ranger", name="岚弓游侠", description="用快弓连续射击，频繁触发暴击和蓄力箭。",
        burst_name="穿云箭", base_hp=33, base_attack=18, base_defense=1,
        hp_growth=3, attack_growth=3, defense_growth=1, crit_every=3, focus_max=1, burst_percent=145,
        weapon_ids=["reed_bow", "elm_bow", "gale_bow", "cloud_bow", "comet_bow"],
    ),
}
_WEAPON_NAMES = {
    "arcanist": ["嫩枝法杖", "琥珀枝杖", "雨纹星杖", "月辉星杖", "曙光星杖"],
    "vanguard": ["营地短剑", "赤铜阔剑", "潮纹长剑", "断崖重剑", "曜日誓剑"],
    "ranger": ["青芦短弓", "榆木猎弓", "穿风长弓", "逐云角弓", "彗羽星弓"],
}
_WEAPON_ATTACK = (6, 11, 16, 21, 26)
_GEAR = {}
for hero in _CLASSES.values():
    for tier, (item_id, name) in enumerate(zip(hero.weapon_ids, _WEAPON_NAMES[hero.id], strict=True)):
        _GEAR[item_id] = Gear(id=item_id, name=name, tier=tier, slot="weapon",
                              class_id=hero.id, attack_bonus=_WEAPON_ATTACK[tier])

_GEAR.update({g.id: g for g in (
    Gear(id="trail_coat", name="巡途短衣", tier=0, slot="armor", class_id=None, attack_bonus=1),
    Gear(id="echo_charm", name="回声节拍坠", tier=0, slot="accessory", class_id=None,
         critical_interval_reduction=1),
    Gear(id="ward_vest", name="苔纹护甲", tier=0, slot="armor", class_id=None, hp_bonus=4, defense_bonus=3),
    Gear(id="hearth_charm", name="炉心护符", tier=0, slot="accessory", class_id=None,
         hp_bonus=5, defense_bonus=1),
)})
_KITS = {
    "trail": StarterKit(id="trail", name="巡途行装", description="短衣提升攻击，节拍坠缩短连击触发暴击的间隔。",
                        armor="trail_coat", accessory="echo_charm"),
    "ward": StarterKit(id="ward", name="守营行装", description="护甲与护符增加生命上限和防御，适合稳步推进。",
                       armor="ward_vest", accessory="hearth_charm"),
}


def catalog() -> HeroCatalog:
    return HeroCatalog(classes=list(_CLASSES.values()), kits=list(_KITS.values()), equipment=list(_GEAR.values()),
                       level_thresholds=list(LEVEL_THRESHOLDS))


def class_info(class_id: ClassId) -> HeroClass:
    return _CLASSES[class_id].model_copy(deep=True)


def equipment(item_id: str) -> Gear:
    try:
        return _GEAR[item_id].model_copy()
    except KeyError:
        raise ValueError("请使用图鉴中的装备。") from None


def initial_loadout(class_id: ClassId, kit: KitId = "trail") -> Loadout:
    pack = _KITS[kit]
    return Loadout(weapon=_CLASSES[class_id].weapon_ids[0], armor=pack.armor, accessory=pack.accessory)


def starter_inventory(class_id: ClassId, kit: KitId = "trail") -> list[str]:
    return list(initial_loadout(class_id, kit).model_dump(exclude_none=True).values())


def stage_rewards(class_id: ClassId, stage_number: int, kit: KitId = "trail") -> list[Gear]:
    """Chapters are one-based. The first clear unlocks both shared slot alternatives."""
    if not 1 <= stage_number <= 4:
        raise ValueError("章节超出战役范围。")
    items = [_CLASSES[class_id].weapon_ids[stage_number]]
    if stage_number == 1:
        other = _KITS["ward" if kit == "trail" else "trail"]
        items.extend([other.armor, other.accessory])
    return [equipment(i) for i in items]


def level_for_xp(xp: int) -> int:
    if xp < 0:
        raise ValueError("经验值须为零或正数。")
    return bisect_right(LEVEL_THRESHOLDS, xp)


def xp_to_next_level(xp: int) -> int:
    level = level_for_xp(xp)
    return LEVEL_THRESHOLDS[level] - xp if level < len(LEVEL_THRESHOLDS) else 0


def stats_for(class_id: ClassId, xp: int, loadout: Loadout) -> HeroStats:
    hero = _CLASSES[class_id]
    gained = level_for_xp(xp) - 1
    hp = hero.base_hp + gained * hero.hp_growth
    attack = hero.base_attack + gained * hero.attack_growth
    defense = hero.base_defense + gained * hero.defense_growth
    interval = hero.crit_every
    for slot, item_id in loadout.model_dump(exclude_none=True).items():
        item = equipment(item_id)
        if item.slot != slot or item.class_id not in (None, class_id):
            raise ValueError("请按职业和装备部位选择装备。")
        hp += item.hp_bonus
        attack += item.attack_bonus
        defense += item.defense_bonus
        interval -= item.critical_interval_reduction
    return HeroStats(max_hp=hp, attack=attack, defense=defense, crit_every=max(2, interval),
                     focus_max=hero.focus_max, burst_percent=hero.burst_percent)
