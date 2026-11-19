"""Offline balance sweep. Run python -m scripts.check_battle_balance after tuning a class."""

from itertools import product
from pathlib import Path
from types import SimpleNamespace

from backend.material_adapter import extract_material
from backend.rpg.battle_content import active_exam
from backend.rpg.battle_models import Answer, Equip, NextStage
from backend.rpg.battle_reports import build_report
from backend.rpg.battle_rules import advance, new_battle, view
from backend.rpg.hero_catalog import catalog
from backend.rpg.models import RPGPreferences
from backend.rpg.service import RPGService


def simulate(game, knowledge, hero_class, kit, strategy):
    state = new_battle("balance-run", "example", game, knowledge, hero_class=hero_class, kit=kit)
    starter = state.equipped_id
    for _ in range(200):
        public = view(state, game, knowledge)
        fields = {"expected_revision": state.revision, "event_id": f"input-{state.revision}"}
        if state.phase == "victory":
            report = build_report(state, game, knowledge)
            assert report.cleared_stages == len(game.scenes)
            assert all(c.combat_correct >= 1 for c in report.concepts)
            assert report.defeats == report.sidequests_completed == int(strategy == "recover")
            assert len([gear for gear in report.drops if gear.slot == "weapon"]) == len(game.scenes)
            return report
        if state.phase == "stage_clear":
            if strategy == "starter" and state.equipped_id != starter:
                action = Equip(action="equip", item_id=starter, **fields)
            else:
                action = NextStage(action="next_stage", **fields)
        else:
            exam = active_exam(state, game, knowledge)
            option = exam.answer_id
            if strategy == "recover" and state.defeats == 0:
                option = next(o.id for o in exam.prompt.options if o.id != exam.answer_id)
            burst = strategy != "starter" and public.player.burst_ready and state.phase == "combat"
            action = Answer(action="answer", prompt_id=exam.prompt.prompt_id, option_id=option,
                            skill="burst" if burst else "strike", **fields)
        state = advance(state, action, game, knowledge)
    raise AssertionError(f"Campaign exceeded 200 commands: {hero_class}, {kit}, {strategy}, {state.phase}")


def main():
    source = Path(__file__).resolve().parents[1] / "public" / "examples" / "cell-notes.txt"
    knowledge = extract_material(source).knowledge
    service = RPGService()
    roster = catalog()
    configurations = [(job.id, kit.id) for job, kit in product(roster.classes, roster.kits)]
    completed = dict.fromkeys(configurations, 0)
    layouts = recoveries = 0
    for count in range(1, 9):
        # One- and two-concept games are published by the targeted practice route.
        previous = None
        if count < 3:
            previous = SimpleNamespace(weak_knowledge_ids=[k.knowledge_id for k in knowledge[:count]])
        for stages, difficulty in product(range(1, min(count, 4) + 1), ("easy", "medium", "hard")):
            prefs = RPGPreferences(challenge_count=count, scene_count=stages, difficulty=difficulty)
            game = service.generate_rpg(knowledge, service.plan_rpg(knowledge, prefs, previous))
            assert len(game.scenes) == stages and sum(len(s.challenges) for s in game.scenes) == count
            layouts += 1
            for hero_class, kit in configurations:
                for strategy in ("starter", "burst", "recover"):
                    report = simulate(game, knowledge, hero_class, kit, strategy)
                    recoveries += report.sidequests_completed
                    completed[hero_class, kit] += 1
    for (hero_class, kit), wins in completed.items():
        print(f"{hero_class:10} {kit:5}  {wins:3} campaigns won")
    print(f"{layouts} layouts, {sum(completed.values())} victories, {recoveries} defeats followed by recovery.")


if __name__ == "__main__":
    main()
