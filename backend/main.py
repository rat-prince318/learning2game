"""Application factory and the local classroom demonstration entry point."""

import importlib
import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from threading import BoundedSemaphore

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import materials, pipeline, sessions
from .cleanup import drain_file_deletions
from .db import connection, exclusive_store, initialize
from .games import store_game
from .models import GameConfigPublic, StrictModel, UserPreferences
from .services import DEMO_MATERIAL_TEXT, DemoServices, Services

log = logging.getLogger("uvicorn.error")
DEMO_MATERIAL = "sample-ai-concepts"
DEMO_PLAN = "sample-matching-plan"


class InvalidField(StrictModel):
    location: list[str | int]
    reason: str


class ErrorDetail(StrictModel):
    code: int
    message: str
    fields: list[InvalidField] | None = None


class APIError(StrictModel):
    error: ErrorDetail


def _demo_seed(app):
    """Store the sample once, with provenance so the shortcut also supports practice."""
    services = app.state.services
    with connection(app, write=True) as conn:
        row = conn.execute("SELECT id FROM games WHERE plan_id=?", (DEMO_PLAN,)).fetchone()
        if row:
            return row["id"]
        path = app.state.upload_dir / "sample-ai-concepts.txt"
        path.write_text(DEMO_MATERIAL_TEXT, encoding="utf-8")
        result = services.extract(path)
        prefs = UserPreferences()
        plan = services.plan(result.knowledge, prefs)
        conn.execute("INSERT INTO materials(id,original_name,path,media_type,result_json) VALUES (?,?,?,?,?)",
                     (DEMO_MATERIAL, path.name, str(path), "text/plain", result.model_dump_json()))
        conn.execute("INSERT INTO plans(id,material_id,config_json,preferences_json,scope_json) VALUES (?,?,?,?,?)",
                     (DEMO_PLAN, DEMO_MATERIAL, plan.model_dump_json(), prefs.model_dump_json(),
                      json.dumps(plan.knowledge_ids)))
        game_id = store_game(conn, services.generate(result.knowledge, plan), plan_id=DEMO_PLAN)
        conn.execute("UPDATE plans SET game_id=? WHERE id=?", (game_id, DEMO_PLAN))
        return game_id


def _load_services(spec: str):
    mod, sep, factory = spec.partition(":")
    if not sep or not mod or not factory:
        raise ValueError("EDUGAME_SERVICE_FACTORY must be a Python module:factory.")
    services = getattr(importlib.import_module(mod), factory)()
    for method in ("extract", "plan", "generate", "feedback"):
        if not callable(getattr(services, method, None)):
            raise ValueError(f"Service adapter must implement {method}().")
    return services


def create_app(*, data_dir: Path | str | None = None, demo: bool | None = None,
               services: Services | None = None, max_upload_bytes: int | None = None) -> FastAPI:
    # The old demo fixture remains available for existing D API clients.
    configured = os.getenv("EDUGAME_MODE", "").strip().lower()
    if demo is None:
        demo = services is None and (configured == "demo" or
               (not configured and os.getenv("EDUGAME_DEMO", "0").lower() in {"1", "yes", "true"}))
    spec = os.getenv("EDUGAME_SERVICE_FACTORY", "")
    if demo and (services is not None or spec):
        raise ValueError("Choose one service mode: explicit demo or an A/B adapter.")
    if demo:
        services = DemoServices()
        mode = "demo"
    elif services is not None:
        mode = "integrated"
    elif spec:
        services = _load_services(spec)
        mode = "integrated"
    else:
        mode = configured or "offline"
        if mode not in {"offline", "live", "unconfigured"}:
            raise ValueError("EDUGAME_MODE must be offline, live or demo.")
        if mode != "unconfigured":
            from .integration import CourseServices
            services = CourseServices(live=(mode == "live"))
    root = Path(data_dir or os.getenv("EDUGAME_DATA_DIR") or Path(".local", mode)).resolve()

    @asynccontextmanager
    async def lifespan(app):
        with exclusive_store(root):
            app.state.upload_dir.mkdir(parents=True, exist_ok=True)
            initialize(app)
            drain_file_deletions(root, app.state.db_path)
            if demo:
                app.state.demo_game_id = _demo_seed(app)
            log.info("EduGame backend ready (mode=%s)", mode)
            yield

    app = FastAPI(title="Learning2Game API", version="1.0.0", lifespan=lifespan,
                  responses={code: {"model": APIError} for code in (400, 403, 404, 409, 413, 415, 422, 500, 503)})
    app.state.data_dir = root
    app.state.db_path = root / "edugame.sqlite3"
    app.state.upload_dir = root / "uploads"
    app.state.mode = mode
    app.state.services = services
    app.state.service_slots = BoundedSemaphore(4)
    app.state.service_timeout = float(os.getenv("EDUGAME_SERVICE_TIMEOUT", "400" if mode == "live" else "60"))
    if not 0 < app.state.service_timeout <= 600:
        raise ValueError("EDUGAME_SERVICE_TIMEOUT must be positive and at most 600 seconds.")
    if max_upload_bytes is None:
        max_upload_bytes = int(os.getenv("EDUGAME_MAX_UPLOAD_BYTES", str(10 * 1024**2)))
    if not 1 <= max_upload_bytes <= 32 * 1024**2:
        raise ValueError("EDUGAME_MAX_UPLOAD_BYTES must be between 1 byte and 32 MiB.")
    app.state.max_upload_bytes = max_upload_bytes
    origins = os.getenv("EDUGAME_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    app.add_middleware(CORSMiddleware, allow_origins=[x.strip() for x in origins.split(",") if x.strip()],
                       allow_methods=["GET", "POST", "DELETE"], allow_headers=["Content-Type", "X-Material-Token"])

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request, exc):
        return JSONResponse({"error": {"code": exc.status_code, "message": exc.detail}},
                            status_code=exc.status_code, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def invalid_input(request, exc):
        fields = [{"location": e["loc"], "reason": e["type"]} for e in exc.errors()]
        return JSONResponse({"error": {"code": 422, "message": "Invalid request.", "fields": fields}},
                            status_code=422)

    @app.exception_handler(Exception)
    async def internal_error(request, exc):
        return JSONResponse({"error": {"code": 500, "message": "An internal server error occurred."}},
                            status_code=500)

    @app.get("/health", tags=["system"])
    def health():
        with connection(app) as conn:
            conn.execute("SELECT 1")
        return {"service": "learning2game", "status": "ok", "mode": mode, "external_models": mode in {"live", "integrated"},
                "max_upload_bytes": max_upload_bytes, "supported_extensions": list(materials.MEDIA)}

    @app.get("/demo/material", response_class=PlainTextResponse, tags=["demo"])
    def sample_material():
        if not demo:
            raise HTTPException(404, "Demo mode is disabled.")
        return PlainTextResponse(DEMO_MATERIAL_TEXT, headers={
            "Content-Disposition": 'attachment; filename="sample-ai-concepts.txt"'})

    @app.get("/demo/game", response_model=GameConfigPublic, tags=["demo"])
    def sample_game(request: Request):
        if not demo:
            raise HTTPException(404, "Demo mode is disabled.")
        return sessions.public_game(app.state.demo_game_id, request)

    app.include_router(materials.router)
    app.include_router(pipeline.router)
    app.include_router(sessions.router)
    app.mount("/", StaticFiles(directory=Path(__file__).resolve().parents[1] / "public", html=True),
              name="studio")
    return app


app = create_app()
