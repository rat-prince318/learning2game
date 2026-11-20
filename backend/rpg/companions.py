"""Travel companions share an expedition save, including optional tower excursions."""

from typing import Literal

from ..models import Count, StrictModel

CompanionId = Literal["reed", "flint", "lumen"]
RECRUIT_AFTER = {"reed": 0, "flint": 1, "lumen": 2}
BOND_LEVELS = (0, 2, 5, 10)


class CompanionView(StrictModel):
    id: CompanionId
    available: bool
    wins_required: Count = 0
    joined: bool
    active: bool
    bond: Count
    level: Count
    next_level_bond: Count | None


class PartnerAssist(StrictModel):
    companion_id: CompanionId
    effect: Literal["guard", "strike", "focus"]
    level: Count
    amount: Count


def level(bond):
    return sum(bond >= limit for limit in BOND_LEVELS)


def roster(state):
    victories = len(state.journal) + state.tower.best_floor
    rows = []
    for ident, required in RECRUIT_AFTER.items():
        bond = state.bonds.get(ident, 0)
        joined = ident in state.bonds
        rank = level(bond) if joined else 0
        rows.append(CompanionView(id=ident, available=victories >= required, wins_required=required, joined=joined,
                                  active=state.active_companion == ident, bond=bond, level=rank,
                                  next_level_bond=BOND_LEVELS[rank] if 0 < rank < len(BOND_LEVELS) else None))
    return rows


def set_companion(state, action):
    from .battle_rules import BattleError

    slot = next(partner for partner in roster(state) if partner.id == action.companion_id)
    if action.action == "recruit_companion":
        if slot.joined or not slot.available:
            raise BattleError(409, "请在伙伴可结交时与其交谈。")
        state.bonds[slot.id] = 0
        if state.active_companion is None:
            state.active_companion = slot.id
    else:
        if not slot.joined:
            raise BattleError(409, "与这位伙伴结交后即可同行。")
        state.active_companion = slot.id


def bond_on_win(state, fight):
    ident = fight.expedition.companion_id
    if ident:
        state.bonds[ident] += 1
