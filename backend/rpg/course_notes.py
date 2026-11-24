"""Field lessons carried by an expedition. Published answer keys stay private."""

from hashlib import sha256
from typing import Literal

from ..models import Count, Identifier, StrictModel
from .battle_content import active_exam, round_kind
from .models import Explanation, ReferenceText, TermText

NoteSpot = Literal["keeper", "site", "south-yard", "north-post", "east-court"]
NoteMode = Literal["campaign", "tower"]
TRAIL_SPOTS = ("south-yard", "north-post", "east-court")


class CollectNotes(StrictModel):
    action: Literal["collect_notes"]
    event_id: Identifier
    expected_revision: Count
    spot: NoteSpot


class CourseNote(StrictModel):
    id: Identifier
    title: TermText
    body: Explanation
    source_ref: ReferenceText
    region_index: Count


class CourseNotebook(StrictModel):
    notes: list[CourseNote]
    relevant_note_ids: list[Identifier]
    spot_note_ids: list[Identifier]
    spot_total: Count


def _authored(card):
    return card.lesson_authored and bool(card.study_term and card.study_definition)


def available(courses):
    return any(_authored(q) for game, _ in courses.values() for scene in game.scenes for q in scene.challenges)


def _note_id(game_id, knowledge_id):
    # Knowledge IDs are local to each uploaded material.
    return sha256(f"{game_id}\0{knowledge_id}".encode()).hexdigest()[:32]


def _scene_note_ids(game_id, scene):
    return list(dict.fromkeys(_note_id(game_id, q.knowledge_id) for q in scene.challenges if _authored(q)))


def cards_for_spot(state, path, courses, spot):
    # A story-only chapter previews the next battle's notes. Runs with few
    # topics can revisit a concept at more than one stop along the road.
    idx = state.region_index
    stops = path[idx] or next((group[:1] for group in path[idx + 1:] if group), [])
    groups = [_scene_note_ids(gid, courses[gid][0].scenes[stage]) for gid, stage in stops]
    if spot in ("keeper", "site"):
        offset = (1 if spot == "site" else 0) + (0 if path[idx] else idx)
        return list(dict.fromkeys(group[offset % len(group)] for group in groups if group))
    cards = list(dict.fromkeys(nid for group in groups for nid in group))
    if not cards:
        return []
    offset = TRAIL_SPOTS.index(spot)
    return cards[offset::len(TRAIL_SPOTS)] or [cards[offset % len(cards)]]


def acquire(state, ids):
    known = set(state.collected_note_ids)
    new = [nid for nid in dict.fromkeys(ids) if nid not in known]
    state.collected_note_ids.extend(new)
    return bool(new)


def briefing(battle, game):
    return _scene_note_ids(battle.game_id, game.scenes[battle.stage_index])


def _related(battle, course):
    exam = active_exam(battle, *course)
    if not exam or round_kind(battle, exam.question) == "tactics":
        return []
    return [_note_id(battle.game_id, q.knowledge_id) for q in exam.supporting or (exam.question,)]


def notebook(state, path, courses, mode, spot, tower_course=None):
    carried = set(state.collected_note_ids)
    relevant = []
    if mode == "tower" and tower_course and state.tower.phase in {"combat", "sidequest"}:
        battle = state.tower.battle
        carried.update(briefing(battle, tower_course[0]))
        relevant = _related(battle, tower_course)
    elif mode == "campaign" and state.phase in {"combat", "sidequest"}:
        battle = state.battle
        course = courses[battle.game_id]
        carried.update(briefing(battle, course[0]))
        relevant = _related(battle, course)
    site = cards_for_spot(state, path, courses, spot) if spot else []
    notes = []
    seen = set()
    for region, stops in enumerate(path):
        for gid, stage in stops:
            for q in courses[gid][0].scenes[stage].challenges:
                nid = _note_id(gid, q.knowledge_id)
                if nid in carried and nid not in seen and _authored(q):
                    notes.append(CourseNote(id=nid, title=q.study_term, body=q.study_definition,
                                            source_ref=q.source_ref, region_index=region))
                    seen.add(nid)
    return CourseNotebook(notes=notes, spot_total=len(site), spot_note_ids=[nid for nid in site if nid in seen],
                          relevant_note_ids=[nid for nid in dict.fromkeys(relevant) if nid in seen])
