"""Run python -m scripts.export_rpg_schemas to refresh the RPG v1 wire schemas."""

import json
from pathlib import Path

from pydantic import TypeAdapter

from backend.rpg import models
from backend.rpg.battle_models import BattleAction, BattleView
from backend.rpg.battle_reports import BattleReport
from backend.rpg.hero_catalog import HeroCatalog
from backend.rpg.expedition import ExpeditionAction, ExpeditionReport, ExpeditionView
from backend.rpg.expedition_planning import ExpeditionOutline, OutlineRequest
from backend.rpg.expedition_routes import EncoreStart, ExpeditionStart
from backend.rpg.expedition_world import ExpeditionCatalog


SCHEMA_TYPES = {
    name: getattr(models, name) for name in (
        "GameRecommendation", "RPGPreferences", "RPGPlan", "RPGGameInternal", "RPGGamePublic",
        "RPGProgress", "RPGActionInput", "RPGActionResult", "RPGLearningReport",
        "RPGValidationReport", "RPGGenerationResult",
    )
}
SCHEMA_TYPES.update({"BattleAction": BattleAction, "BattleView": BattleView, "BattleReport": BattleReport,
                     "HeroCatalog": HeroCatalog})
SCHEMA_TYPES.update({"ExpeditionAction": ExpeditionAction, "ExpeditionView": ExpeditionView,
                     "ExpeditionReport": ExpeditionReport, "ExpeditionCatalog": ExpeditionCatalog,
                     "ExpeditionStart": ExpeditionStart, "ExpeditionOutline": ExpeditionOutline,
                     "OutlineRequest": OutlineRequest, "EncoreStart": EncoreStart})
OUTPUT = Path(__file__).resolve().parents[1] / "schemas" / "rpg"


def schema_for(name: str) -> dict:
    return {"$schema": "https://json-schema.org/draft/2020-12/schema",
            **TypeAdapter(SCHEMA_TYPES[name]).json_schema(), "title": name}


if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name in SCHEMA_TYPES:
        (OUTPUT / f"{name}.schema.json").write_text(
            json.dumps(schema_for(name), ensure_ascii=False, indent=2) + "\n", encoding="utf-8",
        )
