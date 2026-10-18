import type { DatabaseSync } from "node:sqlite";

/**
 * SQLite schema changes are deliberately kept as ordered migrations. The
 * server only stores normalized learning records; provider payloads and audio
 * blobs do not have a table in this schema.
 */
export const MIGRATIONS: readonly string[] = [
  `
    CREATE TABLE IF NOT EXISTS learners (
      id TEXT PRIMARY KEY,
      native_language TEXT NOT NULL,
      target_language TEXT NOT NULL,
      level TEXT NOT NULL,
      is_adult INTEGER NOT NULL DEFAULT 0 CHECK (is_adult IN (0, 1)),
      timezone TEXT,
      display_name TEXT,
      roast_opt_in INTEGER NOT NULL DEFAULT 0 CHECK (roast_opt_in IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS objectives (
      id TEXT PRIMARY KEY,
      learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      skill_ids_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active',
      target_date TEXT
    );

    CREATE TABLE IF NOT EXISTS phrases (
      id TEXT PRIMARY KEY,
      learner_id TEXT,
      skill_id TEXT NOT NULL,
      objective_id TEXT REFERENCES objectives(id) ON DELETE SET NULL,
      target_text TEXT NOT NULL,
      translation TEXT,
      language TEXT NOT NULL,
      context TEXT,
      difficulty REAL,
      content_version TEXT NOT NULL DEFAULT '1'
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
      target_language TEXT NOT NULL,
      native_language TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      started_at TEXT NOT NULL,
      ended_at TEXT,
      objective_id TEXT REFERENCES objectives(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS evidence (
      id TEXT PRIMARY KEY,
      learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL,
      skill_id TEXT,
      type TEXT NOT NULL,
      expected TEXT,
      observed TEXT,
      outcome TEXT NOT NULL,
      confidence REAL NOT NULL,
      source TEXT NOT NULL,
      context_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS voice_events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      state TEXT,
      text TEXT,
      language TEXT,
      occurred_at TEXT NOT NULL,
      provider TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_objectives_learner ON objectives(learner_id, status, id);
    CREATE INDEX IF NOT EXISTS idx_phrases_learner_skill ON phrases(learner_id, skill_id, id);
    CREATE INDEX IF NOT EXISTS idx_sessions_learner ON sessions(learner_id, started_at, id);
    CREATE INDEX IF NOT EXISTS idx_evidence_learner_time ON evidence(learner_id, created_at, id);
    CREATE INDEX IF NOT EXISTS idx_evidence_skill ON evidence(learner_id, skill_id, created_at, id);
    CREATE INDEX IF NOT EXISTS idx_voice_events_session ON voice_events(session_id, occurred_at, id);
  `,
];

export function applyMigrations(database: DatabaseSync, now = new Date().toISOString()): void {
  database.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);");
  const current = database.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations").get() as { version?: number } | undefined;
  const currentVersion = Number(current?.version ?? 0);

  for (let index = currentVersion; index < MIGRATIONS.length; index += 1) {
    const version = index + 1;
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(MIGRATIONS[index] ?? "");
      database.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(version, now);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
}
