import copy
import json
import os
from pathlib import Path
import subprocess
import sys

import pytest

from matching_agent import MatchingAgent
from matching_agent.cli import demo_statistics
from matching_agent.errors import AgentError
from matching_agent.llm import ModelMessage, ToolCall
from matching_agent.models import UserPreferences
from matching_agent.offline import OfflineClient
from matching_agent.validation import deterministic_validate

ROOT = Path(__file__).resolve().parents[1]


async def test_b_image_adapter_required_before_extraction(bundle, variants):
    class B:
        calls = []
        async def read_material(self, material_id):
            self.calls.append("read")
            return {"text_blocks": [], "images": [{"image_id": "figure_a", "needs_analysis": True}]}
        async def analyze_image(self, material_id, image_id):
            self.calls.append("image")
            return {"image_id": image_id, "evidence": "A connected diagram", "uncertain": False}
        async def extract_knowledge(self, material_id, material, image_analyses):
            self.calls.append("extract")
            assert "figure_a" in image_analyses
            return bundle
    class Orchestrator(OfflineClient):
        tried_early = False
        async def choose(self, messages, tools):
            names = [t["function"]["name"] for t in tools]
            if "analyze_image" in names:
                tool_results = [json.loads(m["content"]) for m in messages if m["role"] == "tool"]
                analyzed = any(r.get("data", {}).get("image_id") == "figure_a" for r in tool_results)
                if self.tried_early and not analyzed:
                    return ModelMessage(tool_calls=[ToolCall("image_call", "analyze_image", '{"image_id":"figure_a"}')])
                self.tried_early = True
            return await super().choose(messages, tools)
    b = B()
    client = Orchestrator(variants)
    extracted, plan = await MatchingAgent(client).prepare_from_material(bundle.material_id, UserPreferences(), b)
    assert b.calls == ["read", "image", "extract"]
    assert extracted.material_id == bundle.material_id and plan.actual_pair_count == 6
    all_messages = json.dumps(client.conversations)
    assert "image_analysis_required" in all_messages


@pytest.mark.parametrize("field,value", [
    ("pairs", "not a list"), ("pairs", [None, 123, [], {}]),
    ("knowledge_id", {"bad": "id"}), ("pair_id", ["bad"]),
    ("source_refs", [["bad"]]), ("right", 123),
])
async def test_malformed_candidate_produces_report_not_crash(bundle, client, field, value):
    agent = MatchingAgent(client)
    plan = await agent.prepare_plan(bundle)
    result = await agent.generate_game(bundle, agent.confirm_plan(plan, bundle))
    raw = result.game.model_dump()
    if field == "pairs":
        raw[field] = value
    else:
        raw["pairs"][0][field] = value
    report = deterministic_validate(raw, plan, bundle)
    assert not report.passed


@pytest.mark.parametrize("attack", ["summary_number", "review_number", "foreign_source", "foreign_knowledge"])
async def test_feedback_hallucinations_not_returned(bundle, variants, attack):
    class BadFeedback(OfflineClient):
        async def structured(self, task, system, payload, schema):
            raw = await super().structured(task, system, payload, schema)
            if task == "generate_learning_feedback":
                if attack == "summary_number": raw["summary"] = "Your accuracy is 100%."
                if attack == "review_number": raw["reviews"][0]["explanation"] = "You made 100 errors."
                if attack == "foreign_source": raw["reviews"][0]["source_refs"] = ["foreign"]
                if attack == "foreign_knowledge": raw["reviews"][0]["knowledge_id"] = "foreign"
            return raw
    agent = MatchingAgent(BadFeedback(variants))
    plan = await agent.prepare_plan(bundle)
    result = await agent.generate_game(bundle, agent.confirm_plan(plan, bundle))
    with pytest.raises(AgentError) as exc:
        await agent.generate_feedback(demo_statistics(result.game), bundle, result.game)
    assert exc.value.code == "model_call_limit"


def cli(*args, input=None):
    env = os.environ.copy()
    env["PYTHONUTF8"] = "1"
    return subprocess.run([sys.executable, "-m", "matching_agent", *args], cwd=ROOT,
                          capture_output=True, text=True, encoding="utf-8", input=input, env=env, timeout=30)


def test_cli_demo_and_practice(tmp_path):
    output = tmp_path / "run"
    result = cli("demo", "--mode", "offline", "--yes", "--practice", "--output", str(output))
    assert result.returncode == 0, result.stderr
    assert (output / "game.internal.json").exists()
    assert (output / "practice.generation.json").exists()
    manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["status"] == "completed" and manifest["statistics_provenance"] == "synthetic_D_fixture"
    result2 = cli("demo", "--mode", "offline", "--yes", "--output", str(output))
    assert result2.returncode == 1 and "output_exists" in result2.stderr


def test_cli_cancel_never_generates(tmp_path):
    output = tmp_path / "run"
    result = cli("demo", "--mode", "offline", "--output", str(output), input="cancel\n")
    assert result.returncode == 0
    assert not (output / "game.internal.json").exists()
    events = (output / "events.jsonl").read_text(encoding="utf-8")
    assert "generate_matching_config" not in events


def test_cli_failure_only_exports_report(tmp_path):
    output = tmp_path / "run"
    result = cli("demo", "--mode", "offline", "--yes", "--inject", "persistent_duplicate", "--output", str(output))
    assert result.returncode == 1
    assert not (output / "game.internal.json").exists()
    assert json.loads((output / "generation.json").read_text(encoding="utf-8"))["game"] is None


def test_cli_edit_replans_and_confirms_new_count(tmp_path):
    output = tmp_path / "run"
    inputs = "EDIT\nfamiliar\ndistinguish\n4\n\n\nCONFIRM\n"
    result = cli("demo", "--mode", "offline", "--output", str(output), input=inputs)
    assert result.returncode == 0, result.stderr
    game = json.loads((output / "game.internal.json").read_text(encoding="utf-8"))
    assert len(game["pairs"]) == 4
    plan = json.loads((output / "plan.json").read_text(encoding="utf-8"))
    assert plan["preferences"]["level"] == "familiar"


def test_live_mode_never_accepts_offline_auto_confirmation(tmp_path):
    result = cli("demo", "--mode", "live", "--yes", "--output", str(tmp_path / "run"))
    assert result.returncode == 1 and "interactive_confirmation_required" in result.stderr
