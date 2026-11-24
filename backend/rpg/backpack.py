"""Carried provisions and field inventory commands for the main expedition."""

from typing import TYPE_CHECKING, Annotated, Literal

from pydantic import Field

from ..models import Count, Identifier, StrictModel
from .battle_rules import BattleError, equipment, player_stats

if TYPE_CHECKING:
    from .expedition_models import ExpeditionState


SupplyId = Literal["field_bandage", "focus_tea"]


class SupplyPouch(StrictModel):
    field_bandage: Count = 2
    focus_tea: Count = 1


class HeldSupply(StrictModel):
    id: SupplyId
    quantity: Count
    heal: Count = 0
    focus: Count = 0


def supply_stacks(pouch: SupplyPouch) -> list[HeldSupply]:
    return [HeldSupply(id="field_bandage", quantity=pouch.field_bandage, heal=12),
            HeldSupply(id="focus_tea", quantity=pouch.focus_tea, focus=1)]


class PackCommand(StrictModel):
    event_id: Identifier
    expected_revision: Count
    item_id: Identifier


class UseItem(PackCommand):
    action: Literal["use_item"]
    item_id: SupplyId


class DiscardItem(PackCommand):
    action: Literal["discard_item"]
    quantity: Annotated[int, Field(strict=True, gt=0)]


class Unequip(PackCommand):
    action: Literal["unequip"]


def manage_pack(state: "ExpeditionState", action: UseItem | DiscardItem | Unequip) -> None:
    if state.phase not in {"route", "reward"}:
        raise BattleError(409, "返回地图或营地后即可整理行囊。")
    fight = state.battle
    item = action.item_id
    if isinstance(action, UseItem):
        supply = next(s for s in supply_stacks(state.supplies) if s.id == item)
        if supply.quantity < 1:
            raise BattleError(409, "这份补给已经用完。")
        stats = player_stats(fight, relic_ids=state.relic_ids, edge_ranks=state.edge_ranks,
                             plating_ranks=state.plating_ranks)
        if supply.heal:
            if fight.hp >= stats.max_hp:
                raise BattleError(409, "生命已经回满。")
            fight.hp = min(stats.max_hp, fight.hp + supply.heal)
        else:
            if fight.focus >= stats.focus_max:
                raise BattleError(409, "蓄力已经充满。")
            fight.focus = min(stats.focus_max, fight.focus + supply.focus)
        setattr(state.supplies, item, supply.quantity - 1)
        return
    if isinstance(action, DiscardItem):
        if item in SupplyPouch.model_fields:
            have = getattr(state.supplies, item)
            if action.quantity > have:
                raise BattleError(409, "行囊里的数量少于要丢弃的数量。")
            setattr(state.supplies, item, have - action.quantity)
            return
        if item not in fight.inventory_ids or action.quantity != 1:
            raise BattleError(422, "请选择持有的一件装备。")
        if item in fight.loadout.model_dump().values():
            raise BattleError(409, "先换下这件装备，再从行囊中丢弃。")
        fight.inventory_ids.remove(item)
        return
    worn = equipment(item)
    if getattr(fight.loadout, worn.slot) != item:
        raise BattleError(409, "请选择身上已穿戴的装备。")
    if worn.slot == "weapon":
        raise BattleError(409, "在行囊里选择另一把武器即可更换。")
    setattr(fight.loadout, worn.slot, None)
    new_stats = player_stats(fight, relic_ids=state.relic_ids, edge_ranks=state.edge_ranks,
                             plating_ranks=state.plating_ranks)
    fight.hp = min(fight.hp, new_stats.max_hp)
