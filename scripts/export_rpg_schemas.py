"""Run python -m scripts.export_rpg_schemas to refresh the RPG v1 wire schemas."""

import json
from pathlib import Path

from pydantic import TypeAdapter

from backend.rpg import models


SCHEMA_TYPES = {
    name: getattr(models, name) for name in (
        "GameRecommendation", "RPGPreferences", "RPGPlan", "RPGGameInternal", "RPGGamePublic",
        "RPGProgress", "RPGActionInput", "RPGActionResult", "RPGLearningReport",
        "RPGValidationReport", "RPGGenerationResult",
    )
}
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
