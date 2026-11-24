"""Publish the built-in shooting practice with the same scoring and reporting as uploaded lessons."""

import json
from pathlib import Path

from .db import connection
from .games import store_game
from .models import GameConfigInternal, KnowledgeItem, MatchingPair, MatchingPlan, MaterialResult, UserPreferences


def warmup_game(app, language):
    plan_id = f"court-warmup-v1-{language}"
    prefs = UserPreferences(question_language=language, pair_count=4)
    with connection(app, write=True) as conn:
        row = conn.execute("SELECT game_id FROM plans WHERE id=?", (plan_id,)).fetchone()
        if row:
            return row["game_id"]
        if app.state.mode == "demo":
            # This mode's practice generator works with its own machine-learning handout.
            row = conn.execute(
                """SELECT m.id,m.result_json FROM games g JOIN plans p ON p.id=g.plan_id
                   JOIN materials m ON m.id=p.material_id WHERE g.id=?""", (app.state.demo_game_id,)
            ).fetchone()
            material_id = row["id"]
            knowledge = MaterialResult.model_validate_json(row["result_json"]).knowledge
            plan = app.state.services.plan(knowledge, prefs)
            game = app.state.services.generate(knowledge, plan)
        else:
            fixture = Path(__file__).with_name("fixtures") / f"court-{language}.json"
            sample = json.loads(fixture.read_text(encoding="utf-8"))
            material_id = f"court-handout-v1-{language}"
            path = app.state.upload_dir / f"{material_id}.txt"
            knowledge, pairs, paragraphs = [], [], []
            for index, item in enumerate(sample["shots"], 1):
                concept_id = f"{material_id}-{index}"
                ref = (f'{sample["title"]} / 第 {index} 段' if language == "zh"
                       else f'{sample["title"]} / paragraph {index}')
                paragraphs.append(f'{item["term"]}: {item["evidence"]}')
                knowledge.append(KnowledgeItem(knowledge_id=concept_id, term=item["term"],
                                               definition=item["evidence"], evidence=item["evidence"], source_ref=ref))
                pairs.append(MatchingPair(pair_id=f"shot-{index}", knowledge_id=concept_id, study_term=item["term"],
                                          left=item["ball"], right=item["hoop"], distractors=item["distractors"], hint=item["hint"],
                                          explanation=item["explanation"], source_ref=ref))
            path.write_text("\n\n".join(paragraphs), encoding="utf-8")
            conn.execute("INSERT INTO materials(id,original_name,path,media_type,result_json) VALUES (?,?,?,?,?)",
                         (material_id, sample["title"] + ".txt", str(path), "text/plain",
                          MaterialResult(knowledge=knowledge).model_dump_json()))
            plan = MatchingPlan(title=sample["title"], question_language=language, difficulty=prefs.difficulty,
                                knowledge_ids=[k.knowledge_id for k in knowledge])
            game = GameConfigInternal(title=plan.title, pairs=pairs)
        conn.execute("INSERT INTO plans(id,material_id,config_json,preferences_json,scope_json) VALUES (?,?,?,?,?)",
                     (plan_id, material_id, plan.model_dump_json(), prefs.model_dump_json(),
                      json.dumps(plan.knowledge_ids)))
        game_id = store_game(conn, game, plan_id=plan_id)
        conn.execute("UPDATE plans SET game_id=? WHERE id=?", (game_id, plan_id))
        return game_id
