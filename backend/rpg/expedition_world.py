"""Original expedition atlas. Its public codex is also the source of combat rules."""

from collections import Counter
from typing import Literal

from pydantic import Field

from ..models import Identifier, StrictModel
from .models import Description, ShortText

IntentId = Literal["strike", "heavy", "ward", "charge", "expose"]
Risk = Literal["normal", "elite", "boss"]
Sprite = Literal["sprout", "moth", "golem", "warden"]
Approach = Literal["steady", "daring"]
TraitId = Literal["ordinary", "root_latch", "tideglass", "copper_seam", "gale_sail",
                  "redline", "thin_ice", "echo_bell", "eclipse"]


class IntentSpec(StrictModel):
    id: IntentId
    name: ShortText
    telegraph: Description
    advice: Description


class EncounterSpec(StrictModel):
    id: Identifier
    name: ShortText
    tier: Risk
    sprite: Sprite
    description: Description
    intents: list[IntentId] = Field(min_length=1)
    enraged_intents: list[IntentId] = Field(min_length=1)
    shield: int = Field(ge=1, le=6)
    health_percent: int = Field(ge=80, le=200)
    trait_id: TraitId
    trait_name: ShortText
    trait_description: Description


class RegionSpec(StrictModel):
    id: Identifier
    name: ShortText
    arrival: Description
    objective: ShortText
    resolution: Description
    normal_encounters: list[Identifier]
    elite_encounters: list[Identifier]
    boss_id: Identifier
    relic_ids: list[Identifier]
    normal_paths: list[ShortText]
    elite_path: ShortText
    boss_paths: list[ShortText]


class RouteSpec(StrictModel):
    id: Identifier
    encounter_id: Identifier
    risk: Risk
    name: ShortText
    description: Description
    approach: Approach
    boss: bool


class RelicBonuses(StrictModel):
    attack: int = 0
    defense: int = 0
    guard: int = 0
    break_power: int = 0
    burst_percent: int = 0
    counter: int = 0
    opening_focus: int = 0
    heal_on_win: int = 0


class RelicSpec(StrictModel):
    id: Identifier
    name: ShortText
    description: Description
    max_stacks: int = Field(ge=1, le=2)
    bonuses: RelicBonuses


class TraitBonuses(StrictModel):
    """Incoming is power hitting the enemy. Outgoing is power leaving the enemy."""
    incoming: int = 0
    outgoing: int = 0
    break_power: int = 0


class ExpeditionCatalog(StrictModel):
    story_finale: EncounterSpec | None = None
    regions: list[RegionSpec]
    encounters: list[EncounterSpec]
    relics: list[RelicSpec]
    intents: list[IntentSpec]


_INTENTS = {item.id: item for item in (
    IntentSpec(id="strike", name="出击", telegraph="敌人压低身体，准备贴身出击。", advice="观察破势进度，选择进攻或格挡。"),
    IntentSpec(id="heavy", name="重击", telegraph="敌人稳住支点，将力量集中到这一击。", advice="用格挡作答接住重击，争取破势。"),
    IntentSpec(id="ward", name="架盾", telegraph="敌人收紧防线，护住了要害。", advice="有蓄力时可以考虑职业战技。"),
    IntentSpec(id="charge", name="蓄势", telegraph="敌人收拢能量，正在准备接下来的攻势。", advice="格挡作答干扰蓄势，也可抓紧这一拍进攻。"),
    IntentSpec(id="expose", name="露隙", telegraph="敌人的防线敞开，弱点进入射程。", advice="抓住机会攻击，可以在这一拍使用职业战技。"),
)}

_TRAITS = {
    "ordinary": ("巡守", "观察每回合的架势，寻找进攻机会。"),
    "root_latch": ("根须借力", "树心蓄势时，正确格挡额外削减 2 点架势。"),
    "tideglass": ("退潮线", "泵口露隙时承受的攻击威力额外增加 8 点。"),
    "copper_seam": ("热铆缝", "架盾时铆缝发亮，职业战技额外获得 6 点威力和 1 点破势。"),
    "gale_sail": ("满帆", "进入后半程后，重击威力额外增加 4 点。"),
    "redline": ("校准红线", "机芯蓄势时，普通攻击沿红线命中可额外获得 10 点威力。"),
    "thin_ice": ("镜面裂纹", "进入后半程后，格挡作答额外削减 1 点架势。"),
    "echo_bell": ("三响钟", "每第三拍是钟槌共鸣拍：出击或重击额外增加 4 点威力。"),
    "eclipse": ("日月交轨", "交轨前，格挡重击额外削减 1 点架势；交轨后，露隙时用职业战技额外获得 12 点威力。"),
}


def _foe(ident, name, tier, sprite, description, pattern, half_pattern, shield, hp, trait="ordinary"):
    trait_name, trait_description = _TRAITS[trait]
    return EncounterSpec(id=ident, name=name, tier=tier, sprite=sprite, description=description,
                         intents=pattern.split(), enraged_intents=half_pattern.split(), shield=shield,
                         health_percent=hp, trait_id=trait, trait_name=trait_name,
                         trait_description=trait_description)


# Each region contributes two road encounters, one optional elite and its own keeper.
_ENCOUNTERS = {entry.id: entry for entry in (
    _foe("reed_runner", "苇帽獭", "normal", "sprout", "河獭把芦苇编成宽帽，帽边一抖就要冲过木桥。",
         "strike expose", "strike ward expose", 1, 94),
    _foe("pollen_lantern", "浮灯蜉", "normal", "moth", "白天躲在灯芯里，入夜沿巡河人的灯影俯冲。",
         "charge strike expose", "charge heavy expose", 1, 98),
    _foe("ferry_ram", "渡口青角", "elite", "golem", "它用渡船的缆绳缠住双角，起步前河面会拉出两道水线。",
         "ward charge heavy expose", "charge heavy strike expose", 2, 122),
    _foe("willow_lock", "柳根闸主", "boss", "warden", "洪水困在柳堤内侧，枝冠下的闸轮每蓄势一次就露出根须。",
         "charge strike expose", "charge heavy ward expose", 4, 130, "root_latch"),

    _foe("salt_skate", "盐沫飞鳐", "normal", "moth", "它在晒盐池之间滑行，翻肚时盐晶落进水里。",
         "expose strike strike", "strike charge heavy", 1, 91),
    _foe("buoy_crab", "浮标钳蟹", "normal", "sprout", "两只钳子轮流托起旧浮标，潮绳落下前壳面会张开。",
         "ward strike expose", "ward heavy expose", 2, 100),
    _foe("reef_diver", "沉钟潜卫", "elite", "golem", "沉钟作头盔的潜卫拖着锚索，出拳前先将锚砸进礁石。",
         "charge heavy ward", "heavy expose charge heavy", 3, 126),
    _foe("tidal_engine", "逆潮司泵", "boss", "warden", "铜鲸让海水倒灌进港，退潮的一拍是泵叶转向的关口。",
         "ward strike expose heavy", "charge heavy expose strike", 3, 136, "tideglass"),

    _foe("ember_tick", "火屑跳蚤", "normal", "sprout", "火星沿熔炉导轨跃动，落地以后稍停一拍。",
         "strike strike expose", "charge strike expose", 1, 90),
    _foe("kiln_carrier", "砖壳送煤车", "normal", "golem", "车斗朝外倾斜时，炉砖就会滑落。",
         "ward heavy expose", "ward strike heavy", 2, 103),
    _foe("anvil_knight", "锻台骑偶", "elite", "warden", "炉门每开一次，骑偶就给盾牌钉一颗新铆钉。",
         "ward heavy strike expose", "ward charge heavy", 3, 128),
    _foe("copper_drake", "铆翼炉龙", "boss", "golem", "它把断轨熔成翼甲；收翼架盾时，翼根的铆缝反而烧得通红。",
         "ward charge heavy expose", "ward strike ward heavy expose", 4, 138, "copper_seam"),

    _foe("seed_glider", "籽翼飞狸", "normal", "moth", "乘风滑翔的飞狸叼着果园的风向袋。",
         "charge strike expose", "expose heavy strike", 1, 96),
    _foe("wicker_stag", "藤篮鹿", "normal", "sprout", "它用两只藤篮般的角从梯田间穿行。",
         "strike ward strike expose", "heavy expose strike", 2, 101),
    _foe("storm_thresher", "暴雨扬谷机", "elite", "golem", "风鼓遮住稻穗的摇摆声，木叶轮在降速时露出转轴。",
         "strike charge heavy expose", "heavy strike charge heavy expose", 2, 127),
    _foe("wind_schooner", "悬帆渡鸢", "boss", "moth", "鸢背上挂着失踪的帆船。风越急，帆骨反弹的力量越大。",
         "strike charge heavy expose", "heavy ward heavy expose", 3, 143, "gale_sail"),

    _foe("ink_nib", "走字笔尖", "normal", "sprout", "脱离自动抄写机后，它一路在地板上留下墨脚印。",
         "strike expose charge", "charge strike strike", 1, 95),
    _foe("shelf_tortoise", "合页书龟", "normal", "golem", "它背负整架书，合上书页时只留下窄窄的书脊。",
         "ward expose strike", "ward heavy expose strike", 2, 104),
    _foe("index_duelist", "索引剑偶", "elite", "warden", "剑偶在地砖上划出行格，再沿格线作长距离突刺。",
         "charge strike heavy", "charge heavy expose heavy", 3, 129),
    _foe("redline_scribe", "红线总校官", "boss", "warden", "装订机长出了六支红笔，笔尖蓄力时轨迹会写在地上。",
         "charge strike ward expose", "charge heavy charge strike", 3, 141, "redline"),

    _foe("snowmoth", "雪粉溜蛾", "normal", "moth", "它的双翅在薄冰上磨过，所到之处留下两排白痕。",
         "expose charge strike", "strike heavy expose", 1, 92),
    _foe("moraine_goat", "堆石岩羊", "normal", "sprout", "它脚边的碎石会先于冲锋滑入冰沟。",
         "ward strike charge", "charge heavy expose", 2, 102),
    _foe("crevasse_sentry", "冰隙测绘偶", "elite", "golem", "测绘偶伸出三脚标尺，重重敲击前方的冰层。",
         "heavy ward charge strike", "charge heavy expose heavy", 3, 130),
    _foe("mirror_lynx", "雪镜猞猁", "boss", "moth", "山口的镜像都随它一同跳跃，鏖战中镜面会生出细纹。",
         "strike ward heavy expose", "heavy charge strike expose", 4, 144, "thin_ice"),

    _foe("bronze_wren", "调音铜雀", "normal", "moth", "在屋檐排箫间跳跃的小铜雀会用鸟喙拨响试音簧。",
         "charge expose strike", "strike charge heavy expose", 1, 94),
    _foe("escapement", "擒纵石偶", "normal", "golem", "擒纵轮每转一格，就带动石偶迈出一步。",
         "ward strike expose heavy", "ward heavy strike", 2, 105),
    _foe("carillon_hand", "排钟左手", "elite", "warden", "悬在铜索上的木手会用两支钟槌打出错拍。",
         "strike heavy expose ward", "strike charge heavy heavy expose", 3, 132),
    _foe("bellfounder", "七桥铸钟师", "boss", "golem", "铸钟师把七座桥连成了共鸣箱。听到第三拍，就能判断重锤的落点。",
         "charge expose heavy strike", "ward strike heavy expose charge heavy", 4, 148, "echo_bell"),

    _foe("star_sieve", "星沙筛蝶", "normal", "moth", "银色沙粒从筛翅间漏下，拼出下一段航线。",
         "charge strike ward expose", "heavy strike expose", 2, 99),
    _foe("prism_sailor", "棱镜摆渡人", "normal", "sprout", "它在环形轨道上撑篙，水波沿棱镜折返。",
         "strike ward charge heavy", "expose heavy charge strike", 2, 107),
    _foe("broken_epicycle", "逆行星轮", "elite", "golem", "破损星轮每反转一次，就会从另一条轨道袭来。",
         "ward charge heavy expose strike", "charge heavy ward heavy expose", 4, 136),
    _foe("eclipse_lion", "日蚀巡天狮", "boss", "warden", "双环轨道围着观测台缓缓合拢，日月相交时它会换一套步法。",
         "heavy strike ward charge expose", "charge heavy expose ward strike", 4, 152, "eclipse"),
)}


def trait_bonuses(encounter_id: str, *, intent_id: IntentId, turn: int,
                  enraged: bool, skill: str) -> TraitBonuses:
    trait = encounter_for(encounter_id).trait_id
    if trait == "root_latch" and intent_id == "charge" and skill == "guard":
        return TraitBonuses(break_power=2)
    if trait == "tideglass" and intent_id == "expose":
        return TraitBonuses(incoming=8)
    if trait == "copper_seam" and intent_id == "ward" and skill == "burst":
        return TraitBonuses(incoming=6, break_power=1)
    if trait == "gale_sail" and enraged and intent_id == "heavy":
        return TraitBonuses(outgoing=4)
    if trait == "redline" and intent_id == "charge" and skill == "strike":
        return TraitBonuses(incoming=10)
    if trait == "thin_ice" and enraged and skill == "guard":
        return TraitBonuses(break_power=1)
    if trait == "echo_bell" and (turn + 1) % 3 == 0 and intent_id in {"strike", "heavy"}:
        return TraitBonuses(outgoing=4)
    if trait == "eclipse":
        if not enraged and intent_id == "heavy" and skill == "guard":
            return TraitBonuses(break_power=1)
        if enraged and intent_id == "expose" and skill == "burst":
            return TraitBonuses(incoming=12)
    return TraitBonuses()


def _relic(ident, name, description, limit=1, **bonuses):
    return RelicSpec(id=ident, name=name, description=description,
                     max_stacks=limit, bonuses=RelicBonuses(**bonuses))


_RELICS = {entry.id: entry for entry in (
    _relic("ferryman_knot", "渡工回绳结", "每次战斗获胜后恢复 4 点生命。", 2, heal_on_win=4),
    _relic("willow_pin", "柳木闸销", "格挡的保护效果增加 2 点。", 2, guard=2),
    _relic("brine_lens", "盐镜片", "职业战技倍率增加 18 个百分点，敌人的出招威力增加 1 点。", 2,
           burst_percent=18, counter=1),
    _relic("shell_tally", "贝壳计潮器", "开战时获得 1 格蓄力。", opening_focus=1),
    _relic("rivet_wedge", "偏心铆楔", "破势力增加 1 点，攻击力减少 1 点。", 2, break_power=1, attack=-1),
    _relic("kiln_glove", "炉壁石手套", "防御增加 3 点，职业战技倍率减少 8 个百分点。", 2,
           defense=3, burst_percent=-8),
    _relic("kite_spool", "返风线轴", "攻击力增加 3 点，敌人的出招威力增加 1 点。", 2, attack=3, counter=1),
    _relic("orchard_ration", "梯田果脯盒", "战斗获胜后恢复 6 点生命，格挡的保护效果减少 1 点。", 2,
           heal_on_win=6, guard=-1),
    _relic("margin_rule", "铜墨压尺", "攻击力增加 2 点，格挡的保护效果增加 1 点。", attack=2, guard=1),
    _relic("red_quill", "校勘红羽", "破势力增加 1 点，职业战技倍率增加 8 个百分点。", break_power=1, burst_percent=8),
    _relic("ice_chisel", "雪线冰凿", "破势力增加 2 点，敌人的出招威力增加 2 点。", break_power=2, counter=2),
    _relic("felt_boot", "冰沟毡靴", "防御增加 2 点，战斗获胜后恢复 2 点生命。", 2, defense=2, heal_on_win=2),
    _relic("striker_spring", "钟槌游丝", "开战时获得 1 格蓄力，职业战技倍率增加 10 个百分点，防御减少 2 点。",
           opening_focus=1, burst_percent=10, defense=-2),
    _relic("silent_clapper", "软木钟舌", "格挡的保护效果增加 4 点，攻击力减少 2 点。", 2, guard=4, attack=-2),
    _relic("epicycle", "星盘副轮", "攻击力增加 4 点，职业战技倍率减少 10 个百分点。", 2, attack=4, burst_percent=-10),
    _relic("dawn_prism", "晨光分束镜", "职业战技倍率增加 12 个百分点，获胜后恢复 3 点生命。",
           burst_percent=12, heal_on_win=3),
)}


def _region(ident, name, arrival, objective, resolution, enemies, relics, paths):
    first, second, elite, boss = enemies.split()
    near, far, side, camp, rush = paths
    return RegionSpec(id=ident, name=name, arrival=arrival, objective=objective, resolution=resolution,
                      normal_encounters=[first, second], elite_encounters=[elite], boss_id=boss,
                      relic_ids=relics.split(), normal_paths=[near, far], elite_path=side,
                      boss_paths=[camp, rush])


_REGIONS = (
    _region("willow_ferry", "烟柳渡", "河水漫过渡口的第三块石阶。船工把系缆绳递给你，柳堤里面还有一整村人在等船。",
            "沿巡河灯找到卡住的总闸", "柳根离开闸轮，第一艘渡船再次贴上青石台阶。船工在你的航图上盖了第一枚戳。",
            "reed_runner pollen_lantern ferry_ram willow_lock", "ferryman_knot willow_pin",
            ("河工木栈", "巡灯苇径", "双角缆桩", "堤头茶棚", "急流闸槽")),
    _region("salt_harbor", "白汐港", "海图上写着落潮，栈桥底下的潮水却正向码头倒流。盐工把空盐袋垒成了一道人墙。",
            "找出倒转的潮泵，给运盐船清出航道", "泵叶改向，盐袋上的湿线慢慢下降。港务员点燃绿灯，第一条驳船驶离堤岸。",
            "salt_skate buoy_crab reef_diver tidal_engine", "brine_lens shell_tally",
            ("晒盐石埂", "浮标滩道", "沉钟潜井", "灯塔背风台", "退潮泵口")),
    _region("copper_yard", "赤铆车场", "末班矿车悬在断桥上，炉龙将最后一段钢轨拖回了巢。扳道工还一直压着发车手柄。",
            "取回断轨，让夜班矿车驶回车场", "桥面传来最后一声铆响。矿车越过接缝时，炉工们把安全帽举向了空中。",
            "ember_tick kiln_carrier anvil_knight copper_drake", "rivet_wedge kiln_glove",
            ("碎煤支线", "炉砖斜坡", "重锻平台", "冷却水房", "熔轨侧门")),
    _region("sail_terraces", "悬帆梯田", "果农抬头看着云底的船影。悬帆渡鸢把满载种子的帆船一同卷上了山脊。",
            "牵回载种船，赶在春雨前给梯田补种", "缆绳套住了树桩，种子袋沿着绳索一包包落进田埂。雨雾里亮起了第一片嫩叶。",
            "seed_glider wicker_stag storm_thresher wind_schooner", "kite_spool orchard_ration",
            ("风向袋小径", "果篮吊桥", "风鼓高台", "山坳晒场", "帆索横渡")),
    _region("palimpsest", "复写馆", "馆员们打开新书，发现内页全是同一行红字。写完的页码仍在向装订房深处延伸。",
            "循红线抵达装订房，找回错换的原稿", "六支红笔回到笔槽，读者的名字重新出现在借书卡上。馆员给每册原稿贴回了书标。",
            "ink_nib shelf_tortoise index_duelist redline_scribe", "margin_rule red_quill",
            ("抄录长廊", "流动书架", "分栏校场", "馆员值班室", "装订传送带")),
    _region("mirror_pass", "镜雪山口", "路标在雪地里复制成了十几支，勘测队的脚印却都回到了原地。山风里响着一串木铃。",
            "追踪镜像的裂纹，将测量员带回营地", "山口露出一条结实的冰脊。测量员把木铃重新挂上路标，风声里只剩下一个方向。",
            "snowmoth moraine_goat crevasse_sentry mirror_lynx", "ice_chisel felt_boot",
            ("风蚀雪廊", "乱石山腰", "断层测绘点", "雪线火塘", "镜裂冰脊")),
    _region("bell_bridges", "七桥钟城", "早钟在深夜响起，抬桥和落桥的信号同时传遍两岸。送面包的小车困在了第三座桥上。",
            "校回铸钟台的节拍，让七桥按序落下", "第三声钟响得清亮。七座桥依次接回岸边，送面包的人赶在天亮前敲开了第一家门。",
            "bronze_wren escapement carillon_hand bellfounder", "striker_spring silent_clapper",
            ("铜雀屋脊", "钟表匠里巷", "排钟悬架", "调音亭", "钟槌横梁")),
    _region("orrery", "日轨天台", "天台下的城镇看了三遍日落。守台人指着互相追逐的两道光环，交班册上还停在昨天。",
            "把日月轨道接回中轴，替城镇找回清晨", "两道光环在正点相交，随后缓缓分开。山下的窗户一盏盏熄灭，真正的日出照上天台。",
            "star_sieve prism_sailor broken_epicycle eclipse_lion", "epicycle dawn_prism",
            ("漏沙栈桥", "棱镜引水渠", "逆行轨道", "观测员休息舱", "中轴日环")),
)


ASH_CROWN = _foe("ash_crown", "灰冠龙将", "boss", "warden", "黑铁王冠把八座烽台接成战阵。举爪蓄势时铠甲合拢，重击落空后胸炉暴露。",
                 "charge heavy expose ward", "ward heavy expose charge heavy expose", 4, 155, "eclipse")


def expedition_catalog() -> ExpeditionCatalog:
    return ExpeditionCatalog(story_finale=ASH_CROWN, regions=list(_REGIONS), encounters=list(_ENCOUNTERS.values()),
                             relics=list(_RELICS.values()), intents=list(_INTENTS.values()))


def region_at(index: int) -> RegionSpec:
    if not 0 <= index < len(_REGIONS):
        raise ValueError("区域序号超出远征范围。")
    return _REGIONS[index].model_copy(deep=True)


def encounter_for(encounter_id: str) -> EncounterSpec:
    if encounter_id == ASH_CROWN.id:
        return ASH_CROWN.model_copy(deep=True)
    return _ENCOUNTERS[encounter_id].model_copy(deep=True)


def intent_for(intent_id: IntentId) -> IntentSpec:
    return _INTENTS[intent_id].model_copy()


def relic_for(relic_id: str) -> RelicSpec:
    return _RELICS[relic_id].model_copy(deep=True)


def relic_bonuses(relic_ids: list[str]) -> RelicBonuses:
    totals = RelicBonuses().model_dump()
    for key, quantity in Counter(relic_ids).items():
        spec = _RELICS[key]
        quantity = min(quantity, spec.max_stacks)
        for name, value in spec.bonuses.model_dump().items():
            totals[name] += quantity * value
    return RelicBonuses(**totals)


def reward_relics(region_index: int, scene_index: int, owned_ids: list[str], count: int = 3) -> list[RelicSpec]:
    """Offer local finds first, rotate choices by chapter, and respect ownership caps."""
    region = region_at(region_index)
    if not 0 <= scene_index < 4 or count < 0:
        raise ValueError("请检查章节和奖励数量。")
    home = region.relic_ids
    home_offset = scene_index % len(home)
    others = [key for key in _RELICS if key not in home]
    offset = (region_index * 2 + scene_index * 3) % len(others)
    order = home[home_offset:] + home[:home_offset] + others[offset:] + others[:offset]
    owned = Counter(owned_ids)
    available = [key for key in order if owned[key] < _RELICS[key].max_stacks]
    return [relic_for(key) for key in available[:count]]


def route_encounter(region_index: int, scene_index: int, route: Risk) -> EncounterSpec:
    region = region_at(region_index)
    if not 0 <= scene_index < 4:
        raise ValueError("章节序号超出本区域范围。")
    if route == "boss":
        return encounter_for(region.boss_id)
    if route == "elite":
        return encounter_for(region.elite_encounters[0])
    if route != "normal":
        raise ValueError("请选择当前开放的路线。")
    return encounter_for(region.normal_encounters[scene_index % len(region.normal_encounters)])


def routes_for(region_index: int, stage_index: int, scene_count: int) -> list[RouteSpec]:
    """Terminal paths converge on the same boss, including a single-scene book."""
    region = region_at(region_index)
    if not 0 <= stage_index < scene_count <= 4:
        raise ValueError("章节序号超出本区域范围。")
    if stage_index == scene_count - 1:
        return [
            RouteSpec(id="boss_steady", encounter_id=region.boss_id, risk="boss", name=region.boss_paths[0],
                      description="在临战据点整队，恢复生命上限的三成并补充 1 格蓄力。",
                      approach="steady", boss=True),
            RouteSpec(id="boss_daring", encounter_id=region.boss_id, risk="boss", name=region.boss_paths[1],
                      description="沿近道直达首领，胜利后额外获得 2 枚钱币。",
                      approach="daring", boss=True),
        ]
    normal = route_encounter(region_index, stage_index, "normal")
    elite = route_encounter(region_index, stage_index, "elite")
    return [
        RouteSpec(id="normal", encounter_id=normal.id, risk="normal",
                  name=region.normal_paths[stage_index % len(region.normal_paths)],
                  description=normal.description, approach="steady", boss=False),
        RouteSpec(id="elite", encounter_id=elite.id, risk="elite", name=region.elite_path,
                  description=elite.description, approach="daring", boss=False),
    ]
