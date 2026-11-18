import json
from pathlib import Path

import pytest

from matching_agent.models import KnowledgeBundle
from matching_agent.offline import OfflineClient

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def bundle():
    return KnowledgeBundle.model_validate_json((ROOT / "examples/knowledge/computing.json").read_text(encoding="utf-8"))


@pytest.fixture
def variants():
    return json.loads((ROOT / "examples/offline_variants.json").read_text(encoding="utf-8"))


@pytest.fixture
def client(variants):
    return OfflineClient(variants)
