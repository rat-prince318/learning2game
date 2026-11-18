"""Wire the team's extractor and game agent to the API."""

from .agent_adapter import AgentAdapter
from .material_adapter import extract_material


class CourseServices(AgentAdapter):
    def __init__(self, *, live: bool):
        super().__init__(live=live)
        self.use_models = live

    def extract(self, path):
        return extract_material(path, live=self.use_models)

    def extract_options(self, path, options):
        return extract_material(path, live=self.use_models, **options)
