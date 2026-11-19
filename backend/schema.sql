PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS materials (
    id TEXT PRIMARY KEY, original_name TEXT NOT NULL, path TEXT NOT NULL UNIQUE,
    media_type TEXT NOT NULL, result_json TEXT, options_json TEXT NOT NULL DEFAULT '{}',
    delete_token_hash TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL, resource_id TEXT NOT NULL,
    game_type TEXT CHECK(game_type IN ('matching','rpg_quest')),
    result_json TEXT, error TEXT, stages_json TEXT NOT NULL DEFAULT '{}',
    tools_json TEXT NOT NULL DEFAULT '[]', mode TEXT NOT NULL DEFAULT 'unconfigured',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS jobs_by_resource ON jobs(kind,resource_id);
CREATE TABLE IF NOT EXISTS pending_file_deletions (filename TEXT PRIMARY KEY);

CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY, material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    game_type TEXT NOT NULL DEFAULT 'matching' CHECK(game_type IN ('matching','rpg_quest')),
    confirmed_at TEXT,
    config_json TEXT NOT NULL, preferences_json TEXT NOT NULL, scope_json TEXT NOT NULL,
    game_id TEXT REFERENCES games(id) ON DELETE SET NULL,
    game_job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
    practice_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS plans_by_material ON plans(material_id);

CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY, plan_id TEXT UNIQUE REFERENCES plans(id) ON DELETE CASCADE,
    game_type TEXT NOT NULL DEFAULT 'matching' CHECK(game_type IN ('matching','rpg_quest')),
    internal_json TEXT NOT NULL, public_json TEXT NOT NULL, card_map_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY, game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK(status IN ('active','finished')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), finished_at TEXT
);
CREATE INDEX IF NOT EXISTS sessions_by_game ON sessions(game_id);

CREATE TABLE IF NOT EXISTS events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('attempt','hint')),
    left_id TEXT NOT NULL, right_id TEXT, knowledge_id TEXT NOT NULL, correct INTEGER,
    result_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(session_id,event_id),
    CHECK((kind='attempt' AND right_id IS NOT NULL AND correct IS NOT NULL AND correct IN (0,1))
       OR (kind='hint' AND right_id IS NULL AND correct IS NULL))
);
CREATE INDEX IF NOT EXISTS events_by_session ON events(session_id,seq);
CREATE TABLE IF NOT EXISTS rpg_events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('enter_scene','accept_quest','attempt','hint')),
    payload_json TEXT NOT NULL, knowledge_id TEXT, correct INTEGER, result_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(session_id,event_id),
    CHECK((kind='attempt' AND knowledge_id IS NOT NULL AND correct IS NOT NULL AND correct IN (0,1))
       OR (kind='hint' AND knowledge_id IS NOT NULL AND correct IS NULL)
       OR (kind IN ('enter_scene','accept_quest') AND knowledge_id IS NULL AND correct IS NULL))
);
CREATE INDEX IF NOT EXISTS rpg_events_by_session ON rpg_events(session_id,seq);
CREATE TABLE IF NOT EXISTS reports (
    session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    stats_json TEXT NOT NULL, feedback TEXT
);
