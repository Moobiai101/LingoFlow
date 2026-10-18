import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  EvidenceEvent,
  LearningItem,
  LearningObjective,
  LearnerProfile,
  ReviewItem,
  Session,
  SkillState,
} from "../../../../packages/contracts/dist/index.js";
import { domain } from "../domain-runtime.js";
import { applyMigrations } from "./schema.js";

type SqlRow = Record<string, unknown>;

export interface CreateLearnerInput {
  readonly id: string;
  readonly nativeLanguage: string;
  readonly targetLanguage: string;
  readonly level: string;
  readonly isAdult: boolean;
  readonly timezone?: string;
  readonly displayName?: string;
  readonly roastOptIn?: boolean;
}

export interface CreateObjectiveInput {
  readonly id: string;
  readonly learnerId: string;
  readonly title: string;
  readonly description?: string;
  readonly skillIds?: readonly string[];
  readonly status?: LearningObjective["status"];
  readonly targetDate?: string;
}

export interface CreatePhraseInput {
  readonly id: string;
  readonly learnerId?: string;
  readonly skillId: string;
  readonly objectiveId?: string;
  readonly targetText: string;
  readonly translation?: string;
  readonly language: string;
  readonly context?: string;
  readonly difficulty?: number;
  readonly contentVersion?: string;
}

export interface CreateSessionInput {
  readonly id: string;
  readonly learnerId: string;
  readonly targetLanguage: string;
  readonly nativeLanguage: string;
  readonly status?: Session["status"];
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly objectiveId?: string;
}

export interface LearnerSummary {
  readonly learner: LearnerProfile;
  readonly skills: readonly SkillState[];
  readonly skillStates: readonly SkillState[];
  readonly evidenceCount: number;
  readonly sessionCount: number;
  readonly recentEvidence: readonly EvidenceEvent[];
}

export interface AppendEvidenceResult {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly event: EvidenceEvent;
}

export interface AppendVoiceEventResult {
  readonly accepted: boolean;
  readonly duplicate: boolean;
}

export class RepositoryNotFoundError extends Error {
  public readonly code = "NOT_FOUND";

  public constructor(resource: string, id: string) {
    super(`${resource} '${id}' was not found`);
    this.name = "RepositoryNotFoundError";
  }
}

export class RepositoryConflictError extends Error {
  public readonly code = "CONFLICT";

  public constructor(resource: string, id: string) {
    super(`${resource} '${id}' already exists`);
    this.name = "RepositoryConflictError";
  }
}

function rowString(row: SqlRow, key: string): string | undefined {
  const value = row[key];
  return typeof value === "string" ? value : value === null || value === undefined ? undefined : String(value);
}

function rowNumber(row: SqlRow, key: string): number | undefined {
  const value = row[key];
  return typeof value === "number" ? value : typeof value === "bigint" ? Number(value) : value === null || value === undefined ? undefined : Number(value);
}

function rowBoolean(row: SqlRow, key: string): boolean {
  return rowNumber(row, key) === 1;
}

function optionalText(row: SqlRow, key: string): string | undefined {
  const value = rowString(row, key);
  return value === undefined || value.length === 0 ? undefined : value;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function transaction(database: DatabaseSync, action: () => void): void {
  database.exec("BEGIN IMMEDIATE");
  try {
    action();
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function learnerFromRow(row: SqlRow): LearnerProfile {
  const timezone = optionalText(row, "timezone");
  const displayName = optionalText(row, "display_name");
  return {
    id: rowString(row, "id") ?? "",
    nativeLanguage: rowString(row, "native_language") ?? "",
    targetLanguage: rowString(row, "target_language") ?? "",
    level: rowString(row, "level") ?? "unknown",
    isAdult: rowBoolean(row, "is_adult"),
    ...(timezone ? { timezone } : {}),
    ...(displayName ? { displayName } : {}),
    roastOptIn: rowBoolean(row, "roast_opt_in"),
    createdAt: rowString(row, "created_at"),
    updatedAt: rowString(row, "updated_at"),
  };
}

function objectiveFromRow(row: SqlRow): LearningObjective {
  const description = optionalText(row, "description");
  const targetDate = optionalText(row, "target_date");
  return {
    id: rowString(row, "id") ?? "",
    learnerId: rowString(row, "learner_id") ?? "",
    title: rowString(row, "title") ?? "",
    ...(description ? { description } : {}),
    skillIds: parseJson<string[]>(rowString(row, "skill_ids_json"), []),
    status: (rowString(row, "status") ?? "active") as LearningObjective["status"],
    ...(targetDate ? { targetDate } : {}),
  };
}

function phraseFromRow(row: SqlRow): LearningItem & { readonly contentVersion: string } {
  const objectiveId = optionalText(row, "objective_id");
  const translation = optionalText(row, "translation");
  const context = optionalText(row, "context");
  const difficulty = rowNumber(row, "difficulty");
  return {
    id: rowString(row, "id") ?? "",
    skillId: rowString(row, "skill_id") ?? "",
    ...(objectiveId ? { objectiveId } : {}),
    targetText: rowString(row, "target_text") ?? "",
    ...(translation ? { translation } : {}),
    language: rowString(row, "language") ?? "",
    ...(context ? { context } : {}),
    ...(difficulty !== undefined ? { difficulty } : {}),
    contentVersion: rowString(row, "content_version") ?? "1",
  };
}

function sessionFromRow(row: SqlRow): Session {
  const endedAt = optionalText(row, "ended_at");
  const objectiveId = optionalText(row, "objective_id");
  return {
    id: rowString(row, "id") ?? "",
    learnerId: rowString(row, "learner_id") ?? "",
    targetLanguage: rowString(row, "target_language") ?? "",
    nativeLanguage: rowString(row, "native_language") ?? "",
    status: (rowString(row, "status") ?? "active") as Session["status"],
    startedAt: rowString(row, "started_at") ?? "",
    ...(endedAt ? { endedAt } : {}),
    ...(objectiveId ? { objectiveId } : {}),
  };
}

function evidenceFromRow(row: SqlRow): EvidenceEvent {
  const skillId = optionalText(row, "skill_id");
  const expected = optionalText(row, "expected");
  const observed = optionalText(row, "observed");
  return {
    id: rowString(row, "id") ?? "",
    learnerId: rowString(row, "learner_id") ?? "",
    sessionId: rowString(row, "session_id") ?? "",
    itemId: rowString(row, "item_id") ?? "",
    ...(skillId ? { skillId } : {}),
    type: rowString(row, "type") as EvidenceEvent["type"],
    ...(expected ? { expected } : {}),
    ...(observed ? { observed } : {}),
    outcome: rowString(row, "outcome") as EvidenceEvent["outcome"],
    confidence: rowNumber(row, "confidence") ?? 0,
    source: rowString(row, "source") as EvidenceEvent["source"],
    context: parseJson(rowString(row, "context_json"), {}),
    createdAt: rowString(row, "created_at") ?? "",
  };
}

export interface RepositoryOptions {
  readonly path?: string;
  readonly now?: () => string;
}

export class SqliteRepository {
  private readonly database: DatabaseSync;
  private readonly now: () => string;

  public constructor(options: RepositoryOptions = {}) {
    const path = options.path ?? process.env.LINGOFLOW_DB_PATH ?? "data/lingoflow.sqlite";
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path, { enableForeignKeyConstraints: true, timeout: 5_000 });
    this.now = options.now ?? (() => new Date().toISOString());
    applyMigrations(this.database, this.now());
  }

  public close(): void {
    if (this.database.isOpen) this.database.close();
  }

  public createLearner(input: CreateLearnerInput, objectives: readonly CreateObjectiveInput[] = [], phrases: readonly CreatePhraseInput[] = []): LearnerProfile {
    const timestamp = this.now();
    const learner: LearnerProfile = {
      id: input.id,
      nativeLanguage: input.nativeLanguage,
      targetLanguage: input.targetLanguage,
      level: input.level,
      isAdult: input.isAdult,
      ...(input.timezone ? { timezone: input.timezone } : {}),
      ...(input.displayName ? { displayName: input.displayName } : {}),
      roastOptIn: input.isAdult && input.roastOptIn === true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    transaction(this.database, () => {
      try {
        this.database.prepare("INSERT INTO learners (id, native_language, target_language, level, is_adult, timezone, display_name, roast_opt_in, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
          learner.id,
          learner.nativeLanguage,
          learner.targetLanguage,
          learner.level,
          learner.isAdult ? 1 : 0,
          learner.timezone ?? null,
          learner.displayName ?? null,
          learner.roastOptIn ? 1 : 0,
          timestamp,
          timestamp,
        );
      } catch (error) {
        if (String(error).includes("UNIQUE constraint failed: learners.id")) throw new RepositoryConflictError("Learner", learner.id);
        throw error;
      }
      for (const objective of objectives) this.insertObjective(objective);
      for (const phrase of phrases) this.insertPhrase({ ...phrase, learnerId: phrase.learnerId ?? learner.id });
    });
    return learner;
  }

  public getLearner(id: string): LearnerProfile | undefined {
    const row = this.database.prepare("SELECT * FROM learners WHERE id = ?").get(id) as SqlRow | undefined;
    return row ? learnerFromRow(row) : undefined;
  }

  public requireLearner(id: string): LearnerProfile {
    const learner = this.getLearner(id);
    if (!learner) throw new RepositoryNotFoundError("Learner", id);
    return learner;
  }

  public createObjective(input: CreateObjectiveInput): LearningObjective {
    transaction(this.database, () => this.insertObjective(input));
    return this.getObjective(input.id) as LearningObjective;
  }

  private insertObjective(input: CreateObjectiveInput): void {
    try {
      this.database.prepare("INSERT INTO objectives (id, learner_id, title, description, skill_ids_json, status, target_date) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
        input.id,
        input.learnerId,
        input.title,
        input.description ?? null,
        JSON.stringify(input.skillIds ?? []),
        input.status ?? "active",
        input.targetDate ?? null,
      );
    } catch (error) {
      if (String(error).includes("UNIQUE constraint failed: objectives.id")) throw new RepositoryConflictError("Objective", input.id);
      throw error;
    }
  }

  public getObjective(id: string): LearningObjective | undefined {
    const row = this.database.prepare("SELECT * FROM objectives WHERE id = ?").get(id) as SqlRow | undefined;
    return row ? objectiveFromRow(row) : undefined;
  }

  public listObjectives(learnerId: string): readonly LearningObjective[] {
    return (this.database.prepare("SELECT * FROM objectives WHERE learner_id = ? ORDER BY status = 'active' DESC, id ASC").all(learnerId) as SqlRow[]).map(objectiveFromRow);
  }

  public upsertPhrase(input: CreatePhraseInput): LearningItem & { readonly contentVersion: string } {
    transaction(this.database, () => this.insertPhrase(input, true));
    return this.getPhrase(input.id) as LearningItem & { readonly contentVersion: string };
  }

  private insertPhrase(input: CreatePhraseInput, replace = false): void {
    const sql = replace
      ? "INSERT INTO phrases (id, learner_id, skill_id, objective_id, target_text, translation, language, context, difficulty, content_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET learner_id=excluded.learner_id, skill_id=excluded.skill_id, objective_id=excluded.objective_id, target_text=excluded.target_text, translation=excluded.translation, language=excluded.language, context=excluded.context, difficulty=excluded.difficulty, content_version=excluded.content_version"
      : "INSERT INTO phrases (id, learner_id, skill_id, objective_id, target_text, translation, language, context, difficulty, content_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    try {
      this.database.prepare(sql).run(
        input.id,
        input.learnerId ?? null,
        input.skillId,
        input.objectiveId ?? null,
        input.targetText,
        input.translation ?? null,
        input.language,
        input.context ?? null,
        input.difficulty ?? null,
        input.contentVersion ?? "1",
      );
    } catch (error) {
      if (String(error).includes("UNIQUE constraint failed: phrases.id")) throw new RepositoryConflictError("Phrase", input.id);
      throw error;
    }
  }

  public getPhrase(id: string): (LearningItem & { readonly contentVersion: string }) | undefined {
    const row = this.database.prepare("SELECT * FROM phrases WHERE id = ?").get(id) as SqlRow | undefined;
    return row ? phraseFromRow(row) : undefined;
  }

  public createSession(input: CreateSessionInput): Session {
    const session: Session = {
      id: input.id,
      learnerId: input.learnerId,
      targetLanguage: input.targetLanguage,
      nativeLanguage: input.nativeLanguage,
      status: input.status ?? "active",
      startedAt: input.startedAt,
      ...(input.endedAt ? { endedAt: input.endedAt } : {}),
      ...(input.objectiveId ? { objectiveId: input.objectiveId } : {}),
    };
    transaction(this.database, () => {
      try {
        this.database.prepare("INSERT INTO sessions (id, learner_id, target_language, native_language, status, started_at, ended_at, objective_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
          session.id,
          session.learnerId,
          session.targetLanguage,
          session.nativeLanguage,
          session.status,
          session.startedAt,
          session.endedAt ?? null,
          session.objectiveId ?? null,
        );
      } catch (error) {
        if (String(error).includes("UNIQUE constraint failed: sessions.id")) throw new RepositoryConflictError("Session", session.id);
        throw error;
      }
    });
    return session;
  }

  public getSession(id: string): Session | undefined {
    const row = this.database.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SqlRow | undefined;
    return row ? sessionFromRow(row) : undefined;
  }

  public requireSession(id: string): Session {
    const session = this.getSession(id);
    if (!session) throw new RepositoryNotFoundError("Session", id);
    return session;
  }

  public appendEvidence(event: EvidenceEvent): AppendEvidenceResult {
    let output: AppendEvidenceResult | undefined;
    transaction(this.database, () => {
      const existingRow = this.database.prepare("SELECT * FROM evidence WHERE id = ?").get(event.id) as SqlRow | undefined;
      if (existingRow) {
        output = { accepted: false, duplicate: true, event: evidenceFromRow(existingRow) };
        return;
      }
      domain.validateEvidenceEvent(event);
      this.requireLearner(event.learnerId);
      this.requireSession(event.sessionId);
      this.database.prepare("INSERT INTO evidence (id, learner_id, session_id, item_id, skill_id, type, expected, observed, outcome, confidence, source, context_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
        event.id,
        event.learnerId,
        event.sessionId,
        event.itemId,
        event.skillId ?? null,
        event.type,
        event.expected ?? null,
        event.observed ?? null,
        event.outcome,
        event.confidence,
        event.source,
        JSON.stringify(event.context),
        event.createdAt,
      );
      output = { accepted: true, duplicate: false, event: { ...event, context: { ...event.context } } };
    });
    return output as AppendEvidenceResult;
  }

  public evidenceForLearner(learnerId: string): readonly EvidenceEvent[] {
    return (this.database.prepare("SELECT * FROM evidence WHERE learner_id = ? ORDER BY created_at ASC, id ASC").all(learnerId) as SqlRow[]).map(evidenceFromRow);
  }

  public getSummary(learnerId: string): LearnerSummary {
    const learner = this.requireLearner(learnerId);
    const events = this.evidenceForLearner(learnerId);
    const phrases = this.phrasesForLearner(learnerId);
    const skills = [...domain.projectSkills(events, phrases).values()];
    const countRow = this.database.prepare("SELECT COUNT(*) AS count FROM sessions WHERE learner_id = ?").get(learnerId) as SqlRow;
    const sessions = rowNumber(countRow, "count") ?? 0;
    return {
      learner,
      skills,
      skillStates: skills,
      evidenceCount: events.length,
      sessionCount: sessions,
      recentEvidence: events.slice(-10).reverse(),
    };
  }

  public phrasesForLearner(learnerId: string): readonly (LearningItem & { readonly contentVersion: string })[] {
    return (this.database.prepare("SELECT * FROM phrases WHERE learner_id = ? ORDER BY id ASC").all(learnerId) as SqlRow[]).map(phraseFromRow);
  }

  public getReviewQueue(learnerId: string, now = this.now()): readonly ReviewItem[] {
    this.requireLearner(learnerId);
    const events = this.evidenceForLearner(learnerId);
    const phrases = this.phrasesForLearner(learnerId);
    const itemBySkill = new Map<string, LearningItem>();
    for (const phrase of phrases) if (!itemBySkill.has(phrase.skillId)) itemBySkill.set(phrase.skillId, phrase);
    const items: ReviewItem[] = [];
    for (const state of domain.projectSkills(events, phrases).values()) {
      const related = events.filter((event) => (event.skillId ?? phrases.find((phrase) => phrase.id === event.itemId)?.skillId ?? event.itemId) === state.skillId);
      const latest = related.at(-1)?.createdAt ?? now;
      const signals = domain.reviewSignalsFromEvidence(related, now);
      const item = itemBySkill.get(state.skillId);
      items.push(domain.createReviewItem({
        id: `review:${learnerId}:${item?.id ?? state.skillId}`,
        learnerId,
        itemId: item?.id ?? state.skillId,
        skillId: state.skillId,
        now: latest,
        successfulReviews: state.successfulAttempts,
        failedTransfer: signals.failedTransfer,
        repeatedHighConfidenceError: signals.repeatedHighConfidenceError,
        longInactivity: signals.longInactivity,
        priority: state.priority,
        priorityScore: state.priorityScore,
      }));
    }
    return items.sort((left, right) => right.priorityScore - left.priorityScore || left.dueAt.localeCompare(right.dueAt) || left.id.localeCompare(right.id));
  }

  /** Persist only normalized provider events and a small safe metadata subset. */
  public appendVoiceEvent(event: { readonly id: string; readonly sessionId: string; readonly type: string; readonly state?: string; readonly text?: string; readonly language?: string; readonly occurredAt: string; readonly provider?: string; readonly metadata?: Readonly<Record<string, unknown>> }): AppendVoiceEventResult {
    const safeMetadata: Record<string, string | number | boolean | null> = {};
    for (const [key, value] of Object.entries(event.metadata ?? {})) {
      if (key === "provider_event_type" && (typeof value === "string" || value === null || typeof value === "number" || typeof value === "boolean")) safeMetadata[key] = value;
    }
    const result = this.database.prepare("INSERT OR IGNORE INTO voice_events (id, session_id, type, state, text, language, occurred_at, provider, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      event.id,
      event.sessionId,
      event.type,
      event.state ?? null,
      event.text ?? null,
      event.language ?? null,
      event.occurredAt,
      event.provider ?? null,
      JSON.stringify(safeMetadata),
    );
    return { accepted: Number(result.changes) > 0, duplicate: Number(result.changes) === 0 };
  }
}

export const SqliteLearningRepository = SqliteRepository;
