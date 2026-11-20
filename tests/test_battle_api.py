"""Exercise the battle HTTP contract using a real uploaded lecture and a published RPG."""

import json
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.db import connection
from backend.main import create_app
from rpg_play_scenario import job_result


@dataclass
class Campaign:
    client: TestClient
    stack: ExitStack
    receipt: dict
    game_id: str
    game: dict

    @property
    def entry(self):
        return f"/rpg/games/{self.game_id}/battles"

    def start(self, **body):
        response = self.client.post(self.entry, json=body) if body else self.client.post(self.entry)
        assert response.status_code == 201, response.text
        return response.json()


@pytest.fixture
def campaign(tmp_path, monkeypatch):
    monkeypatch.setenv("EDUGAME_MODE", "offline")
    monkeypatch.delenv("EDUGAME_SERVICE_FACTORY", raising=False)
    source = Path(__file__).resolve().parents[1] / "public" / "examples" / "cell-notes.txt"
    with ExitStack() as stack:
        client = stack.enter_context(TestClient(create_app(data_dir=tmp_path)))
        uploaded = client.post("/materials", files={"file": (source.name, source.read_bytes(), "text/plain")})
        job_result(client, uploaded, "completed")
        receipt = uploaded.json()
        plan = job_result(client, client.post("/rpg/plans", json={
            "material_id": receipt["material_id"], "preferences": {"challenge_count": 6, "scene_count": 3},
        }), "awaiting_confirmation")
        generated = job_result(client, client.post("/rpg/games", json={
            "plan_id": plan["plan_id"], "confirmed": True,
        }), "completed")
        gid = generated["game_id"]
        # This reference key belongs only to the test referee. The client sends
        # ordinary HTTP requests using IDs from its current public prompt.
        with connection(client.app) as db:
            row = db.execute("SELECT internal_json FROM games WHERE id=?", (gid,)).fetchone()
        yield Campaign(client, stack, receipt, gid, json.loads(row[0]))


def url(state):
    return "/rpg/battles/" + state["session_id"]


def command(state, action, **fields):
    return {"event_id": uuid4().hex, "expected_revision": state["revision"], "action": action, **fields}


def move(client, state, action, **fields):
    response = client.post(url(state) + "/actions", json=command(state, action, **fields))
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["revision"] == state["revision"] + 1
    return result


def test_start_is_idempotent_and_resources_are_isolated(campaign):
    c = campaign.client
    with ThreadPoolExecutor(max_workers=3) as pool:
        starts = list(pool.map(lambda _: campaign.start(request_id="book-opening"), range(3)))
    initial = starts[0]
    assert all(state == initial for state in starts)
    assert initial["revision"] == 0 and initial["phase"] == "combat"
    assert initial["player"]["hero_class"] == "arcanist" and initial["player"]["kit"] == "trail"
    other = campaign.start(hero_class="ranger", kit="ward", request_id="second-run")
    assert c.post(campaign.entry, json={"request_id": "second-run"}).json() == other
    assert c.post(campaign.entry, json={"request_id": "second-run", "hero_class": "vanguard"}).status_code == 409
    assert c.post(campaign.entry, json={"request_id": "second-run", "kit": "trail"}).status_code == 409
    assert c.post(campaign.entry, json={"hero_class": "unknown"}).status_code == 422
    assert c.post(campaign.entry, json={"kit": "unknown"}).status_code == 422
    old_client = campaign.start()
    assert old_client["session_id"] != initial["session_id"] and old_client["player"]["hero_class"] == "arcanist"
    legacy = c.post(f"/rpg/games/{campaign.game_id}/sessions").json()
    assert c.get("/rpg/sessions/" + legacy["session_id"]).status_code == 200
    assert c.get("/rpg/battles/" + legacy["session_id"]).status_code == 404
    assert c.get("/rpg/sessions/" + initial["session_id"]).status_code == 404
    assert c.get(url(initial) + "/report").status_code == 409
    assert c.post("/rpg/games/missing/battles").status_code == 404


def test_double_click_and_stale_events_cannot_duplicate_a_turn(campaign):
    c = campaign.client
    state = campaign.start()
    route = url(state) + "/actions"
    public = state["prompt"]
    attempt = command(state, "answer", prompt_id=public["prompt_id"], option_id=public["options"][0]["id"])
    assert c.post(route, json={**attempt, "xp": 500}).status_code == 422
    with ThreadPoolExecutor(max_workers=4) as pool:
        copies = list(pool.map(lambda _: c.post(route, json=attempt), range(4)))
    assert all(r.status_code == 200 and r.json() == copies[0].json() for r in copies)
    latest = c.get(url(state)).json()
    assert latest["revision"] == 1
    assert c.post(route, json={**attempt, "event_id": "another-click"}).status_code == 409
    stale_prompt = {**attempt, "event_id": "stale-prompt", "expected_revision": latest["revision"]}
    assert c.post(route, json=stale_prompt).status_code == 409
    assert c.post(route, json={**attempt, "option_id": public["options"][1]["id"]}).status_code == 409
    assert c.get(url(state)).json() == latest
    # Whichever independent tab wins, both cannot close the same active turn.
    commands = [command(latest, "retreat"), command(latest, "retreat")]
    with ThreadPoolExecutor(max_workers=2) as pool:
        result = list(pool.map(lambda body: c.post(route, json=body), commands))
    assert sorted(r.status_code for r in result) == [200, 409]
    assert c.get(url(state)).json()["phase"] == "retreated"
    assert c.post(route, json=attempt).json() == copies[0].json()
    assert c.get(url(state) + "/report").status_code == 200


def test_restarted_server_recovers_state_and_owner_deletion_removes_it(campaign, tmp_path):
    c = campaign.client
    state = campaign.start()
    body = command(state, "hint", prompt_id=state["prompt"]["prompt_id"])
    route = url(state) + "/actions"
    sent = c.post(route, json=body)
    assert sent.status_code == 200
    latest = c.get(url(state)).json()
    campaign.stack.close()
    with TestClient(create_app(data_dir=tmp_path)) as reopened:
        assert reopened.get(url(state)).json() == latest
        assert reopened.post(route, json=body).json() == sent.json()
        cancelled = move(reopened, latest, "retreat")
        assert cancelled["phase"] == "retreated"
        report = reopened.get(url(state) + "/report").json()
    with TestClient(create_app(data_dir=tmp_path)) as reopened:
        assert reopened.get(url(state) + "/report").json() == report
        endpoint = "/materials/" + campaign.receipt["material_id"]
        assert reopened.delete(endpoint).status_code == 403
        response = reopened.delete(endpoint, headers={"X-Material-Token": campaign.receipt["delete_token"]})
        assert response.status_code == 204
        assert reopened.get(url(state)).status_code == reopened.get(url(state) + "/report").status_code == 404
        assert reopened.post(route, json=body).status_code == 404
        with connection(reopened.app) as db:
            for table in ("battle_runs", "battle_events"):
                assert db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] == 0
            assert list(db.execute("PRAGMA foreign_key_check")) == []


def question_by_option(game, prompt):
    visible = {o["id"] for o in prompt["options"]}
    for scene in game["scenes"]:
        for q in scene["challenges"]:
            if visible == {o["id"] for o in q["options"]}:
                return q
    raise AssertionError("Combat prompt must be from the confirmed game")


def answer_main(client, game, state, *, correct, skill="strike"):
    prompt = state["prompt"]
    q = question_by_option(game, prompt)
    assert q in game["scenes"][state["stage"]["index"]]["challenges"]
    option = next(o for o in prompt["options"] if (o["id"] == q["correct_option_id"]) == correct)
    return move(client, state, "answer", prompt_id=prompt["prompt_id"], option_id=option["id"], skill=skill)


def win_encounter(client, game, state):
    for _ in range(24):
        if state["phase"] != "combat":
            assert state["enemy"]["hp"] == 0
            assert state["phase"] in ("stage_clear", "victory")
            return state
        old_hp = state["enemy"]["hp"]
        state = answer_main(client, game, state, correct=True)
        assert 0 <= state["enemy"]["hp"] < old_hp
    pytest.fail("An encounter should finish after the published questions are answered")


def test_stage_loot_changes_effective_damage_and_boss_has_a_persisted_ending(campaign):
    c = campaign.client
    initial = campaign.start()
    first = win_encounter(c, campaign.game, initial)
    assert first["phase"] == "stage_clear" and first["cleared_stages"] == 1
    assert first["player"]["xp"] > initial["player"]["xp"]
    primary_drop = first["last_event"]["loot"]
    assert primary_drop["slot"] == "weapon" and primary_drop["attack_bonus"] > 0
    earned_ids = {g["id"] for g in first["last_event"]["loot_items"]}
    assert primary_drop["id"] in earned_ids
    # Fight the same second-stage enemy in identical runs, changing only their equipped weapon.
    controls = win_encounter(c, campaign.game, campaign.start())
    starter = initial["player"]["equipped_id"]
    if controls["player"]["equipped_id"] != starter:
        controls = move(c, controls, "equip", item_id=starter)
    if first["player"]["equipped_id"] != primary_drop["id"]:
        first = move(c, first, "equip", item_id=primary_drop["id"])
    assert first["player"]["attack"] > controls["player"]["attack"]
    upgraded = move(c, first, "next_stage")
    plain = move(c, controls, "next_stage")
    enhanced_hit = answer_main(c, campaign.game, upgraded, correct=True)
    plain_hit = answer_main(c, campaign.game, plain, correct=True)
    assert upgraded["enemy"]["hp"] - enhanced_hit["enemy"]["hp"] > plain["enemy"]["hp"] - plain_hit["enemy"]["hp"]
    state = win_encounter(c, campaign.game, enhanced_hit)
    boss = move(c, state, "next_stage")
    assert boss["stage"]["boss"] and boss["enemy"]["boss"]
    final = win_encounter(c, campaign.game, boss)
    assert final["phase"] == "victory" and final["cleared_stages"] == 3
    assert final["player"]["level"] > initial["player"]["level"]
    report = c.get(url(final) + "/report").json()
    assert report["outcome"] == "victory" and report["completion_rate"] == 1
    assert report["combat_accuracy"] == 1 and report["review_accuracy"] is None
    assert report["xp"] == final["player"]["xp"]
    assert report["equipped_id"] == final["player"]["equipped_id"]
    starter_ids = {g["id"] for g in initial["player"]["inventory"]}
    assert report["drops"] == [g for g in final["player"]["inventory"] if g["id"] not in starter_ids]
    for field in ("hero_class", "kit", "loadout", "stats"):
        assert report[field] == final["player"][field]
    assert c.get(url(final)).json() == final
    assert c.post(url(final) + "/actions", json=command(final, "next_stage")).status_code == 409


def test_burst_requires_focus_and_an_enraged_boss_hits_harder(campaign):
    c = campaign.client
    state = campaign.start()
    prompt = state["prompt"]
    attempt = command(state, "answer", prompt_id=prompt["prompt_id"], option_id=prompt["options"][0]["id"], skill="burst")
    assert c.post(url(state) + "/actions", json=attempt).status_code == 409
    assert c.get(url(state)).json() == state

    first = win_encounter(c, campaign.game, state)
    second = move(c, first, "next_stage")
    assert second["player"]["burst_ready"]
    burst = answer_main(c, campaign.game, second, correct=True, skill="burst")
    assert burst["last_event"]["skill"] == "burst" and burst["last_event"]["damage_dealt"] > 0
    assert burst["player"]["focus"] == 0 and not burst["player"]["burst_ready"]

    boss = move(c, win_encounter(c, campaign.game, burst), "next_stage")
    assert boss["stage"]["boss"] and not boss["enemy"]["enraged"]
    quiet = answer_main(c, campaign.game, boss, correct=False)
    wounded = answer_main(c, campaign.game, quiet, correct=True)
    assert wounded["enemy"]["enraged"] and wounded["phase"] == "combat"
    counter = answer_main(c, campaign.game, wounded, correct=False)
    assert counter["last_event"]["damage_received"] > quiet["last_event"]["damage_received"]


def public_keys(value):
    if isinstance(value, dict):
        for key, item in value.items():
            yield key
            yield from public_keys(item)
    elif isinstance(value, list):
        for item in value:
            yield from public_keys(item)


def review_key(prompt, lesson):
    answers = [o for o in prompt["options"] if o["text"] in (lesson["term"], lesson["definition"])]
    assert len(answers) == 1, (prompt, lesson)
    return answers[0]["id"]


def test_defeat_opens_sourced_chapter_sidequest_then_rematch(campaign):
    c = campaign.client
    state = campaign.start()
    start = state
    secrets = {"correct_option_id", "correct_index", "is_correct", "knowledge_id", "answer_key"}
    assert secrets.isdisjoint(public_keys(start))
    assert c.post(url(start) + "/actions", json=command(start, "next_stage")).status_code == 409
    foreign = campaign.game["scenes"][2]["challenges"][0]["options"][0]["id"]
    bad = c.post(url(start) + "/actions", json=command(start, "answer", prompt_id=start["prompt"]["prompt_id"], option_id=foreign))
    assert bad.status_code == 422
    assert c.get(url(start)).json() == start

    missed = set()
    missed_ids = set()
    review_terms = set()
    for _ in range(12):
        if state["phase"] == "sidequest":
            break
        question = question_by_option(campaign.game, state["prompt"])
        missed.add(question["source_ref"])
        missed_ids.add(question["knowledge_id"])
        old_hp = state["player"]["hp"]
        state = answer_main(c, campaign.game, state, correct=False)
        assert state["player"]["hp"] < old_hp
    assert state["phase"] == "sidequest" and state["defeats"] == 1
    assert state["cleared_stages"] == 0 and state["player"]["xp"] == 0
    assert state["stage"]["scene_id"] == start["stage"]["scene_id"]

    count = state["sidequest"]["total"]
    deferred = None
    for step in range(count):
        lesson = state["sidequest"]["lesson"]
        if step == count - 1 and deferred is not None:
            assert lesson == deferred
        assert lesson["source_ref"] in missed
        review_terms.add(lesson["term"])
        assert state["sidequest"]["completed"] == step
        assert c.get(url(state)).json() == state
        prompt = state["prompt"]
        if step == 0:
            key = review_key(prompt, lesson)
            wrong = next(o for o in prompt["options"] if o["id"] != key)
            state = move(c, state, "answer", prompt_id=prompt["prompt_id"], option_id=wrong["id"])
            assert state["phase"] == "sidequest" and state["sidequest"]["completed"] == step
            deferred = lesson
            lesson = state["sidequest"]["lesson"]
            if count > 1:
                assert lesson != deferred
            review_terms.add(lesson["term"])
            assert state["last_event"]["kind"] == "review_wrong"
            assert state["player"]["xp"] == 0 and state["cleared_stages"] == 0
            prompt = state["prompt"]
        state = move(c, state, "answer", prompt_id=prompt["prompt_id"], option_id=review_key(prompt, lesson))
    assert state["phase"] == "combat" and state["stage"]["scene_id"] == start["stage"]["scene_id"]
    assert state["player"]["hp"] > 0 and state["enemy"]["hp"] > 0
    assert state["sidequests_completed"] == 1
    assert state["cleared_stages"] == 0
    for chapter in range(3):
        state = win_encounter(c, campaign.game, state)
        if chapter != 2:
            state = move(c, state, "next_stage")
    report = c.get(url(state) + "/report").json()
    assert report["outcome"] == "victory" and report["defeats"] == report["sidequests_completed"] == 1
    assert report["combat_accuracy"] < 1
    assert report["review_correct"] == count and report["review_attempts"] == count + 1
    assert report["review_accuracy"] == pytest.approx(count / (count + 1))
    assert set(report["weak_knowledge_ids"]) == missed_ids and report["untouched_knowledge_ids"] == []
    assert review_terms == {c["term"] for c in report["concepts"] if c["knowledge_id"] in missed_ids}


def test_character_selection_catalog_drives_each_class_through_its_level_curve(campaign):
    c = campaign.client
    response = c.get("/rpg/battle-catalog")
    assert response.status_code == 200
    catalog = response.json()
    contract = c.get("/openapi.json").json()["paths"]["/rpg/battle-catalog"]["get"]
    assert "$ref" in contract["responses"]["200"]["content"]["application/json"]["schema"]
    classes = {entry["id"]: entry for entry in catalog["classes"]}
    kits = {entry["id"]: entry for entry in catalog["kits"]}
    gear = {entry["id"]: entry for entry in catalog["equipment"]}
    thresholds = catalog["level_thresholds"]
    assert set(classes) == {"arcanist", "vanguard", "ranger"}
    assert set(kits) == {"trail", "ward"}
    assert thresholds == [0, 30, 65, 105, 150, 205]
    assert all(w["slot"] in {"weapon", "armor", "accessory"} for w in gear.values())

    first_hits = {}
    for key, job in classes.items():
        state = campaign.start(hero_class=key)
        player = state["player"]
        assert player["hero_class"] == key
        assert player["loadout"] == {"weapon": job["weapon_ids"][0], "armor": kits["trail"]["armor"],
                                      "accessory": kits["trail"]["accessory"]}
        assert set(player["loadout"].values()) == {item["id"] for item in player["inventory"]}
        assert all(item == gear[item["id"]] for item in player["inventory"])
        state = answer_main(c, campaign.game, state, correct=True)
        first_hits[key] = (state["last_event"]["damage_dealt"], state["player"]["burst_ready"])
        for index in range(3):
            old_level = player["level"]
            state = win_encounter(c, campaign.game, state)
            player = state["player"]
            level = sum(x <= player["xp"] for x in thresholds)
            to_next = thresholds[level] - player["xp"] if level < len(thresholds) else 0
            assert player["level"] == level > old_level
            assert player["xp_to_next_level"] == to_next
            assert state["last_event"]["levels_gained"] == level - old_level
            assert player["loadout"]["weapon"] == job["weapon_ids"][index + 1]
            if index < 2:
                state = move(c, state, "next_stage")
        report = c.get(url(state) + "/report").json()
        assert report["outcome"] == "victory" and report["hero_class"] == key
        assert report["loadout"] == player["loadout"] and report["stats"] == player["stats"]
    assert first_hits["ranger"][1] and not first_hits["vanguard"][1]
    assert len({damage for damage, _ in first_hits.values()}) > 1


def test_unlocked_armor_absorbs_real_counter_damage_without_healing(campaign):
    c = campaign.client
    kits = {entry["id"]: entry for entry in c.get("/rpg/battle-catalog").json()["kits"]}
    ward = kits["ward"]["armor"]
    state = campaign.start(hero_class="vanguard", kit="trail")
    assert c.post(url(state) + "/actions", json=command(state, "equip", item_id=ward)).status_code == 422
    first = win_encounter(c, campaign.game, state)
    assert ward in {item["id"] for item in first["last_event"]["loot_items"]}
    in_fight = move(c, first, "next_stage")
    bare_hit = answer_main(c, campaign.game, in_fight, correct=False)
    armored = move(c, bare_hit, "equip", item_id=ward)
    assert armored["player"]["loadout"]["armor"] == ward
    assert armored["player"]["hp"] == bare_hit["player"]["hp"]
    assert armored["player"]["stats"]["defense"] > bare_hit["player"]["stats"]["defense"]
    armored_hit = answer_main(c, campaign.game, armored, correct=False)
    assert 0 < armored_hit["last_event"]["damage_received"] < bare_hit["last_event"]["damage_received"]
    assert armored["player"]["hp"] - armored_hit["player"]["hp"] == armored_hit["last_event"]["damage_received"]


def test_pre_class_staff_only_save_report_and_event_survive_a_restart(campaign, tmp_path):
    c = campaign.client
    active = campaign.start()
    terminal = campaign.start()
    retreat = command(terminal, "retreat")
    route = url(terminal) + "/actions"
    finished = c.post(route, json=retreat).json()
    frozen_report = c.get(url(terminal) + "/report").json()
    # A version 1.0 battle owned a single staff, with no class, kit, or slot map.
    old_state_fields = {
        "session_id", "game_id", "camp_key", "phase", "revision", "stage_index", "cleared_stages", "enemy_hp",
        "xp", "equipped_id", "combo", "focus", "prompt_serial", "hinted", "pending", "finishing_turn",
        "missed_this_fight", "review_queue", "review_index", "defeats", "sidequests_completed", "concepts",
    }
    old_player_fields = {
        "hp", "max_hp", "level", "xp", "xp_to_next_level", "attack", "equipped_id", "combo", "focus",
        "focus_max", "burst_ready",
    }
    old_event_fields = {
        "kind", "message", "correct", "damage_dealt", "damage_received", "critical", "skill", "xp_gained",
        "levels_gained", "loot", "explanation", "source_ref",
    }
    old_report = {k: v for k, v in frozen_report.items() if k not in {"hero_class", "kit", "loadout", "stats"}}
    finished["schema_version"] = "1.0"
    finished["last_event"] = {k: v for k, v in finished["last_event"].items() if k in old_event_fields}
    old_player = {k: v for k, v in finished["player"].items() if k in old_player_fields}
    old_staff = next(item for item in finished["player"]["inventory"] if item["id"] == "twig_focus")
    old_player.update(hp=30, max_hp=30, attack=24, inventory=[{k: old_staff[k] for k in ("id", "name", "tier", "attack_bonus")}])
    finished["player"] = old_player
    with connection(c.app, write=True) as db:
        for state, event in ((active, None), (terminal, finished["last_event"])):
            row = db.execute("SELECT state_json FROM battle_runs WHERE id=?", (state["session_id"],)).fetchone()
            legacy = {k: v for k, v in json.loads(row[0]).items() if k in old_state_fields}
            legacy.update(schema_version="1.0", hp=30, inventory_ids=["twig_focus"], last_event=event)
            db.execute("UPDATE battle_runs SET state_json=? WHERE id=?", (json.dumps(legacy), state["session_id"]))
        db.execute("UPDATE battle_events SET result_json=? WHERE run_id=? AND event_id=?",
                   (json.dumps(finished), terminal["session_id"], retreat["event_id"]))
        db.execute("UPDATE battle_runs SET report_json=? WHERE id=?", (json.dumps(old_report), terminal["session_id"]))
    campaign.stack.close()
    with TestClient(create_app(data_dir=tmp_path)) as restored:
        state = restored.get(url(active)).json()
        player = state["player"]
        assert [item["id"] for item in player["inventory"]] == ["twig_focus"]
        assert player["hero_class"] == "arcanist" and player["loadout"]["weapon"] == "twig_focus"
        assert player["loadout"]["armor"] is None and player["loadout"]["accessory"] is None
        assert answer_main(restored, campaign.game, state, correct=True)["last_event"]["damage_dealt"] > 0
        replay = restored.post(route, json=retreat).json()
        assert replay["revision"] == finished["revision"] and replay["phase"] == "retreated"
        assert all(replay["player"][k] == v for k, v in old_player.items() if k != "inventory")
        report = restored.get(url(terminal) + "/report").json()
        assert all(report[k] == v for k, v in old_report.items())
