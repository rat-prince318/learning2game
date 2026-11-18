"""Opt-in acceptance with real DeepSeek tool calls and authored material fixtures.

The test harness acts as the trusted host when confirming fixture plans. This is
automated API acceptance, not a claim that an actual learner played a game.
"""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
import pytest

from matching_agent import MatchingAgent, UserPreferences
from matching_agent.cli import demo_statistics, write
from matching_agent.errors import AgentError
from matching_agent.llm import DeepSeekClient
from matching_agent.models import KnowledgeBundle

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env", override=False)
ENABLED = os.getenv("MATCHING_RUN_LIVE") == "1" and bool(os.getenv("DEEPSEEK_API_KEY"))
pytestmark = [pytest.mark.live, pytest.mark.skipif(not ENABLED, reason="Requires MATCHING_RUN_LIVE=1 and local DEEPSEEK_API_KEY")]


@pytest.mark.parametrize("subject", ["computing", "biology", "geography"])
async def test_live_generation_feedback_and_practice(subject):
    output = ROOT / "runs" / ("live_" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "_" + subject + "_" + uuid4().hex[:6])
    output.mkdir(parents=True)
    bundle = KnowledgeBundle.model_validate_json((ROOT / f"examples/knowledge/{subject}.json").read_text(encoding="utf-8"))
    manifest = {"mode": "live", "material_provenance": "fixture", "statistics_provenance": "synthetic_D_fixture",
                "status": "running", "human_content_review": "pending", "subject": subject}
    write(output / "manifest.json", manifest)
    write(output / "knowledge.fixture.json", bundle)
    class FixtureEvidenceClient(DeepSeekClient):
        evidence_index = 0
        async def structured(self, task, system, payload, schema):
            result = await super().structured(task, system, payload, schema)
            self.evidence_index += 1
            # Full intermediate results are saved ONLY for these authored fixtures.
            write(output / f"step_{self.evidence_index:02}_{task}.json",
                  {"mode": "live", "material_provenance": "fixture", "task": task,
                   "input": payload, "output": result})
            return result
    client = FixtureEvidenceClient()
    def event(record):
        with (output / "events.jsonl").open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(record, ensure_ascii=False) + "\n")
    agent = MatchingAgent(client, on_event=event)
    try:
        prefs = UserPreferences()
        plan = await agent.prepare_plan(bundle, prefs)
        write(output / "plan.json", plan)
        confirmed = agent.confirm_plan(plan, bundle)
        write(output / "confirmation.json", confirmed)
        result = await agent.generate_game(bundle, confirmed)
        write(output / "generation.json", result)
        assert result.game is not None, "Live generation failed; inspect generation.json in run directory."
        write(output / "game.internal.json", result.game)
        stats = demo_statistics(result.game)
        write(output / "statistics.fixture.json", stats)
        feedback = await agent.generate_feedback(stats, bundle, result.game, prefs)
        write(output / "feedback.json", feedback)
        assert feedback.statistics.model_dump() == stats.model_dump()
        if subject == "computing":
            next_plan = await agent.prepare_plan(bundle, feedback.practice.preferences)
            write(output / "practice.plan.json", next_plan)
            assert set(stats.weak_knowledge_ids) <= set(next_plan.selected_knowledge_ids)
            practice = await agent.generate_game(bundle, agent.confirm_plan(next_plan, bundle), previous_game=result.game)
            write(output / "practice.generation.json", practice)
            assert practice.game is not None
        manifest["status"] = "completed"
    except AgentError as exc:
        manifest["status"] = "failed"
        write(output / "error.json", exc.as_dict())
        raise
    except Exception:
        manifest["status"] = "failed"
        raise
    finally:
        manifest.update(model=client.model, http_requests=client.request_count, usage=client.usage)
        write(output / "manifest.json", manifest)
        await client.close()
        print(f"Live evidence: {output}")


async def test_live_injected_duplicate_repair():
    output = ROOT / "runs" / ("live_" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "_repair_" + uuid4().hex[:6])
    output.mkdir(parents=True)
    bundle = KnowledgeBundle.model_validate_json((ROOT / "examples/knowledge/computing.json").read_text(encoding="utf-8"))
    write(output / "knowledge.fixture.json", bundle)
    manifest = {"mode": "live", "material_provenance": "fixture", "fault_injection": "duplicate_right_card",
                "status": "running", "human_content_review": "pending"}
    write(output / "manifest.json", manifest)
    class InjectedClient(DeepSeekClient):
        step = 0
        async def structured(self, task, system, payload, schema):
            result = await super().structured(task, system, payload, schema)
            self.step += 1
            write(output / f"step_{self.step:02}_{task}.json",
                  {"mode": "live", "task": task, "input": payload, "output": result})
            if task == "generate_matching_config":
                write(output / "before_injection.json", result)
                result["pairs"][1]["right"] = result["pairs"][0]["right"]
                write(output / "after_injection.json", result)
            return result
    client = InjectedClient()
    def event(record):
        with (output / "events.jsonl").open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(record, ensure_ascii=False) + "\n")
    try:
        agent = MatchingAgent(client, on_event=event)
        plan = await agent.prepare_plan(bundle)
        write(output / "plan.json", plan)
        result = await agent.generate_game(bundle, agent.confirm_plan(plan, bundle))
        write(output / "generation.json", result)
        assert result.game is not None and result.repair_count >= 1
        before = json.loads((output / "before_injection.json").read_text(encoding="utf-8"))
        previous_valid = {p["pair_id"]: p for p in before["pairs"][2:]}
        for p in result.game.pairs:
            if p.pair_id in previous_valid:
                assert p.model_dump() == previous_valid[p.pair_id]
        manifest["status"] = "completed"
    except AgentError as exc:
        manifest["status"] = "failed"
        write(output / "error.json", exc.as_dict())
        raise
    except Exception:
        manifest["status"] = "failed"
        raise
    finally:
        manifest.update(model=client.model, http_requests=client.request_count, usage=client.usage)
        write(output / "manifest.json", manifest)
        await client.close()
        print(f"Live repair evidence: {output}")
