"""Save reproducible offline evidence, including the full repair before/after case."""
import asyncio
import copy
import json
from pathlib import Path

from matching_agent import MatchingAgent, UserPreferences
from matching_agent.cli import demo_statistics, write
from matching_agent.errors import AgentError
from matching_agent.models import KnowledgeBundle
from matching_agent.offline import OfflineClient

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "evidence" / "offline"


class Recorder(OfflineClient):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.steps = []

    async def structured(self, task, system, payload, schema):
        result = await super().structured(task, system, payload, schema)
        # This script operates only on authored PUBLIC FIXTURES, never user uploads.
        self.steps.append({"task": task, "input": copy.deepcopy(payload), "output": copy.deepcopy(result)})
        return result


async def main():
    variants = json.loads((ROOT / "examples/offline_variants.json").read_text(encoding="utf-8"))
    results = []
    for subject in ("computing", "biology", "geography"):
        bundle = KnowledgeBundle.model_validate_json((ROOT / f"examples/knowledge/{subject}.json").read_text(encoding="utf-8"))
        for level in ("beginner", "familiar"):
            client = Recorder(variants)
            events = []
            agent = MatchingAgent(client, on_event=events.append)
            plan = await agent.prepare_plan(bundle, UserPreferences(level=level))
            result = await agent.generate_game(bundle, agent.confirm_plan(plan, bundle))
            assert result.game is not None
            feedback = await agent.generate_feedback(demo_statistics(result.game), bundle, result.game, plan.preferences)
            record = {"mode": "offline", "subject": subject, "level": level,
                      "model_validation_is_simulated": True, "plan": plan.model_dump(),
                      "generation": result.model_dump(), "feedback": feedback.model_dump(), "events": events}
            write(OUT / f"{subject}_{level}.json", record)
            results.append({"subject": subject, "level": level, "status": result.status,
                            "repair_count": result.repair_count})
    bundle = KnowledgeBundle.model_validate_json((ROOT / "examples/knowledge/computing.json").read_text(encoding="utf-8"))
    for fault in ("duplicate", "unsupported", "persistent_duplicate"):
        client = Recorder(variants, inject=fault)
        events = []
        agent = MatchingAgent(client, on_event=events.append)
        plan = await agent.prepare_plan(bundle)
        result = await agent.generate_game(bundle, agent.confirm_plan(plan, bundle))
        record = {"mode": "offline", "fault_injection": fault, "steps": client.steps,
                  "events": events, "result": result.model_dump()}
        write(OUT / f"repair_{fault}.json", record)
    bundle.knowledge = bundle.knowledge[:3]
    try:
        await MatchingAgent(OfflineClient(variants)).prepare_plan(bundle)
    except AgentError as exc:
        write(OUT / "insufficient_material.json", {"mode": "offline", "error": exc.as_dict()})
    write(OUT / "summary.json", {"mode": "offline", "live_api_called": False,
          "content_accuracy_measured": False, "runs": results,
          "note": "Offline control-flow evidence only. Not a measurement of DeepSeek generation accuracy."})
    print(f"Offline evidence: {OUT}")


if __name__ == "__main__":
    asyncio.run(main())

