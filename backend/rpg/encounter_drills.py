"""Assemble finite main-story encounters while leaving course publications immutable."""

from hashlib import sha256
from itertools import zip_longest

from pydantic import TypeAdapter, ValidationError

from ..question_language import accepts
from .battle_models import EncounterDrill
from .encounter_cards import drill_card
from .expedition_world import encounter_for
from .fieldbook_drills import fieldbook_drills
from .models import ReferenceText
from .physics_drills import physics_drills
from .validation import challenge_key, key

_REFERENCE = TypeAdapter(ReferenceText)


def _glossary_cards(q, target, records, language):
    """Contrast a concept with distractors that have already appeared on its card."""
    en = language == "en"
    term = q.study_term or target.term
    definition = q.study_definition or target.definition
    board = {key(o.text) for o in q.options}
    peers = []
    terms, definitions = {key(term)}, {key(definition)}
    for item in records:
        if item.exam_question or item.knowledge_id == target.knowledge_id:
            continue
        name, meaning = key(item.term), key(item.definition)
        if not ({name, meaning} & board) or name in terms or meaning in definitions:
            continue
        if not all(accepts(s, language) for s in (item.term, item.definition)):
            continue
        terms.add(name)
        definitions.add(meaning)
        peers.append(item)
        if len(peers) == 2:
            break
    if len(peers) < 2 or not all(accepts(s, language) for s in (term, definition)):
        return []
    a, b = peers
    options = [term, a.term, b.term]
    cases = []
    example = target.example
    if (example and accepts(example, language) and key(example) not in key(q.prompt)
            and key(term) not in key(example) and key(example) != key(definition)):
        case = ("Which concept does this example illustrate?\n" if en else "这个例子用到了哪个概念？\n") + example
        cases.append(("example", case, options, q.hint, f"{term}: {definition}" if en else f"{term}：{definition}"))
    # Match both bindings; the two foils each keep one of the bindings correct.
    # The player must distinguish both terms, even after solving the original card.
    if all(key(name) not in key(meaning) for name, meaning in ((term, definition), (a.term, a.definition))):
        case = ("Which pair labels entries A and B in order?" if en else "把两条记录分别归类，甲和乙依次对应哪两个概念？")
        case += (f"\nA. {definition}\nB. {a.definition}" if en else f"\n甲：{definition}\n乙：{a.definition}")
        labels = [f"{first} / {last}" for first, last in [(term, a.term), (term, b.term), (b.term, a.term)]]
        cases.append(("contrast", case, labels,
                      "Check both descriptions separately." if en else "分别核对两条说明。",
                      f"{term}: {definition}\n{a.term}: {a.definition}"))
    cards = []
    for tag, prompt, values, hint, explanation in cases:
        try:
            card = drill_card(q, tag, prompt, values, hint, explanation)
            if tag == "contrast" and a.source_ref != q.source_ref:
                refs = q.source_ref + " / " + a.source_ref
                card.source_ref = _REFERENCE.validate_python(refs)
            cards.append(card)
        except ValidationError:
            # An old/custom extraction can exceed the size of a rendered card.
            continue
    return cards


def drill_key(card):
    prompt, answer = challenge_key(card)
    return sha256((prompt + "\0" + answer).encode("utf-8")).hexdigest()[:32]


def _tactics(q, language, edition):
    """Self-contained field exercises for sparse courses, excluded from academic reports."""
    en = language == "en"
    n = int.from_bytes(sha256(q.prompt.encode()).digest()[:4])
    hp = 30 + n % 49 + 2 * edition
    hit = 3 + n // 49 % 9
    heal = 6 + n // 441 % 8 + edition
    cases = [
        (f"A scout has {hp} HP. A hit deals {hit} damage after armor. How much HP remains?",
         f"斥候还剩 {hp} 点生命。护甲抵消了部分伤害，这次实际扣血 {hit} 点。斥候还剩多少点生命？",
         [hp-hit, hp, hp+hit], f"{hp} − {hit} = {hp-hit}."),
        (f"Your shield has {heal} points of poise. Each hit removes 2. How many hits will break it?",
         f"盾牌有 {heal} 点架势。每次命中削掉 2 点，打破架势至少要命中几次？",
         [(heal+1)//2, (heal+1)//2+1, heal], f"2 × {(heal+1)//2-1} < {heal} ≤ 2 × {(heal+1)//2}."),
        (f"A scout at {hp-hit} HP drinks a potion worth {hit+heal} HP. The limit is {hp}. How much healing takes effect?",
         f"斥候的生命为 {hp-hit}/{hp}。药剂能回复 {hit+heal} 点，实际能补回几点？",
         [hit, hit+heal, hp], f"{hp} − {hp-hit} = {hit}."),
        (f"You have {hp} coins and buy two repair kits at {heal} coins each. How much is left?",
         f"你有 {hp} 枚路币，两份修理材料每份 {heal} 枚。付完钱还剩多少？",
         [hp-2*heal, hp-heal, hp], f"{hp} − 2 × {heal} = {hp-2*heal}."),
    ]
    hints = [
        ("Use damage after armor.", "使用实际扣血量。"),
        ("A partial hit still takes a whole turn.", "余下一点架势也要用一次攻击。"),
        ("Check how much health is missing.", "先算生命上限与当前值的差。"),
        ("Work out the price of both kits.", "先算两份材料的总价。"),
    ]
    for i, (english, chinese, values, explanation) in enumerate(cases):
        card = drill_card(q, f"tactics{i}", english if en else chinese, [str(v) for v in values],
                          hints[i][0 if en else 1], explanation)
        card.source_ref = "Field tactics exercise" if en else "队伍战术演练"
        yield card


def build_drills(scene, knowledge, language, encounter_id, occupied=()):
    tier = encounter_for(encounter_id).tier
    minimum = 5 if encounter_id == "ash_crown" else 3 if tier == "normal" else 4
    seen = {drill_key(q) for q in scene.challenges}
    goal = max(0, minimum - len(seen))
    if not goal:
        return []
    seen.update(occupied)
    records = {k.knowledge_id: k for k in knowledge}
    lang = language or ("en" if accepts(scene.challenges[0].prompt, "en") else "zh")
    groups = []
    for q in scene.challenges:
        item = records.get(q.knowledge_id)
        if item is None:
            continue
        practice = (physics_drills(q, item, lang) if item.exam_question else
                    fieldbook_drills(q, item, lang) or _glossary_cards(q, item, knowledge, lang))
        groups.append(practice)
    deck = []
    for row in zip_longest(*groups):
        for card in row:
            if card and drill_key(card) not in seen:
                seen.add(drill_key(card))
                deck.append(EncounterDrill(kind="application", card=card))
                if len(deck) == goal:
                    return deck
    edition = 0
    while len(deck) < goal:
        for card in _tactics(scene.challenges[0], lang, edition):
            identity = drill_key(card)
            if identity not in seen:
                seen.add(identity)
                deck.append(EncounterDrill(kind="tactics", card=card))
                if len(deck) == goal:
                    break
        edition += 1
    return deck
