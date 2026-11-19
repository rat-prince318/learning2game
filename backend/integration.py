"""Wire the team's extractor and game agents to the API."""

from .agent_adapter import AgentAdapter
from .material_adapter import extract_material
from .rpg.service import RPGService


class CourseServices(AgentAdapter):
    def __init__(self, *, live: bool):
        super().__init__(live=live)
        self.use_models = live
        self.rpg = RPGService(live=live)

    def extract(self, path):
        return extract_material(path, live=self.use_models)

    def extract_options(self, path, options):
        return extract_material(path, live=self.use_models, **options)

    def recommend_game_type(self, knowledge, preferences):
        return self.rpg.recommend_game_type(knowledge, preferences)

    def plan_rpg(self, knowledge, preferences, previous_report=None):
        return self.rpg.plan_rpg(knowledge, preferences, previous_report)

    def generate_rpg(self, knowledge, plan, previous=None):
        return self.rpg.generate_rpg(knowledge, plan, previous)

    def feedback_rpg(self, report, knowledge):
        return self.rpg.feedback_rpg(report, knowledge)
