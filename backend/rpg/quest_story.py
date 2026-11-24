"""One irreversible decision per visited post; the campaign journal retains its witnesses."""

from .battle_rules import BattleError, player_stats
from .expedition_world import region_at

# The two paths have equally bounded rewards. The player can always finish the road.
CHOICES = {
    "willow_ferry": ("ferry_child", "ferry_decree"),
    "salt_harbor": ("harbor_choir", "harbor_bell"),
    "copper_yard": ("forge_knight", "forge_mask"),
    "sail_terraces": ("sail_seed", "sail_chart"),
    "palimpsest": ("archive_names", "archive_pact"),
    "mirror_pass": ("pass_echo", "pass_blade"),
    "bell_bridges": ("bell_feast", "bell_duel"),
    "orrery": ("star_girl", "star_key"),
}
ENDINGS = {"shatter_crown", "keep_watch", "wake_towns"}


def decide(state, choice: str):
    if not state.campaign_story:
        raise BattleError(409, "战地抉择属于灰冠战役。从远征标题页启程可参加。")
    if choice in ENDINGS:
        if state.phase != "victory" or state.story_ending is not None:
            raise BattleError(409, "这次旅程的结局只能在胜利后决定一次。")
        needed = 3 if state.eight_chapters else min(3, len(state.game_ids))
        if (
            choice == "wake_towns"
            and len(state.story_marks.keys() & set(state.field_signals)) < needed
        ):
            raise BattleError(
                409, "在沿途驿站完成当地抉择并修复地标，集齐见证后即可唤醒城镇。"
            )
        state.story_ending = choice
        return
    if state.phase != "route":
        raise BattleError(409, "回到地图与当地人相遇后可以作出抉择。")
    region = region_at(state.region_index).id
    if choice not in CHOICES[region]:
        raise BattleError(422, "请选择当前地区发生的事件。")
    if region in state.story_marks:
        raise BattleError(409, "这段经历已经记入旅程。")
    state.story_marks[region] = choice
    if choice == CHOICES[region][0]:
        maximum = player_stats(
            state.battle,
            relic_ids=state.relic_ids,
            edge_ranks=state.edge_ranks,
            plating_ranks=state.plating_ranks,
        ).max_hp
        state.battle.hp = min(maximum, state.battle.hp + 4)
    else:
        state.coins += 2
