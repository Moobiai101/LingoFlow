import {
  createReviewItem,
  projectSkills,
  reviewSignalsFromEvidence,
  validateEvidenceEvent,
} from "../../../packages/domain/dist/index.js";
import type {
  EvidenceEvent,
  LearningItem,
  LearningObjective,
  LearnerProfile,
  ReviewItem,
  Session,
  SkillState,
} from "../../../packages/contracts/dist/index.js";
import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";
import type { D1Row } from "./types.js";

export interface WorkerCreateLearnerInput {
  readonly id: string;
  readonly nativeLanguage: string;
  readonly targetLanguage: string;
  readonly level: string;
  readonly isAdult: boolean;
  readonly timezone?: string;
  readonly displayName?: string;
  readonly roastOptIn?: boolean;
}

export interface WorkerCreateObjectiveInput {
  readonly id: string;
  readonly learnerId: string;
  readonly title: string;
  readonly description?: string;
  readonly skillIds?: readonly string[];
  readonly status?: LearningObjective["status"];
  readonly targetDate?: string;
}

export interface WorkerCreatePhraseInput {
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

export interface WorkerCreateSessionInput {
  readonly id: string;
  readonly learnerId: string;
  readonly targetLanguage: string;
  readonly nativeLanguage: string;
  readonly status?: Session["status"];
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly objectiveId?: string;
}

export interface WorkerSummary {
  readonly learner: LearnerProfile;
  readonly skills: readonly SkillState[];
  readonly skillStates: readonly SkillState[];
  readonly evidenceCount: number;
  readonly sessionCount: number;
  readonly recentEvidence: readonly EvidenceEvent[];
}

export interface WorkerAppendEvidenceResult {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly event: EvidenceEvent;
}

export class WorkerNotFoundError extends Error {
  public readonly code = "NOT_FOUND";

  public constructor(resource: string, id: string) {
    super(`${resource} '${id}' was not found`);
    this.name = "WorkerNotFoundError";
  }
}

export class WorkerConflictError extends Error {
  public readonly code = "CONFLICT";

  public constructor(resource: string, id: string) {
    super(`${resource} '${id}' already exists`);
    this.name = "WorkerConflictError";
  }
}

function text(row: D1Row, key: string): string | undefined {
  const value = row[key];
  return typeof value === "string" ? value : value === null || value === undefined ? undefined : String(value);
}

function number(row: D1Row, key: string): number | undefined {
  const value = row[key];
  return typeof value === "number" ? value : value === null || value === undefined ? undefined : Number(value);
}

function boolean(row: D1Row, key: string): boolean {
  return number(row, key) === 1;
}

function optionalText(row: D1Row, key: string): string | undefined {
  const value = text(row, key);
  return value === undefined || value.length === 0 ? undefined : value;
}

function json<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function learnerFromRow(row: D1Row): LearnerProfile {
  const timezone = optionalText(row, "timezone");
  const displayName = optionalText(row, "display_name");
  return {
    id: text(row, "id") ?? "",
    nativeLanguage: text(row, "native_language") ?? "",
    targetLanguage: text(row, "target_language") ?? "",
    level: text(row, "level") ?? "unknown",
    isAdult: boolean(row, "is_adult"),
    ...(timezone ? { timezone } : {}),
    ...(displayName ? { displayName } : {}),
    roastOptIn: boolean(row, "roast_opt_in"),
    createdAt: text(row, "created_at"),
    updatedAt: text(row, "updated_at"),
  };
}

function objectiveFromRow(row: D1Row): LearningObjective {
  const description = optionalText(row, "description");
  const targetDate = optionalText(row, "target_date");
  return {
    id: text(row, "id") ?? "",
    learnerId: text(row, "learner_id") ?? "",
    title: text(row, "title") ?? "",
    ...(description ? { description } : {}),
    skillIds: json<string[]>(text(row, "skill_ids_json"), []),
    status: (text(row, "status") ?? "active") as LearningObjective["status"],
    ...(targetDate ? { targetDate } : {}),
  };
}

function phraseFromRow(row: D1Row): LearningItem & { readonly contentVersion: string } {
  const objectiveId = optionalText(row, "objective_id");
  const translation = optionalText(row, "translation");
  const context = optionalText(row, "context");
  const difficulty = number(row, "difficulty");
  return {
    id: text(row, "id") ?? "",
    skillId: text(row, "skill_id") ?? "",
    ...(objectiveId ? { objectiveId } : {}),
    targetText: text(row, "target_text") ?? "",
    ...(translation ? { translation } : {}),
    language: text(row, "language") ?? "",
    ...(context ? { context } : {}),
    ...(difficulty !== undefined ? { difficulty } : {}),
    contentVersion: text(row, "content_version") ?? "1",
  };
}

function sessionFromRow(row: D1Row): Session {
  const endedAt = optionalText(row, "ended_at");
  const objectiveId = optionalText(row, "objective_id");
  return {
    id: text(row, "id") ?? "",
    learnerId: text(row, "learner_id") ?? "",
    targetLanguage: text(row, "target_language") ?? "",
    nativeLanguage: text(row, "native_language") ?? "",
    status: (text(row, "status") ?? "active") as Session["status"],
    startedAt: text(row, "started_at") ?? "",
    ...(endedAt ? { endedAt } : {}),
    ...(objectiveId ? { objectiveId } : {}),
  };
}

function evidenceFromRow(row: D1Row): EvidenceEvent {
  const skillId = optionalText(row, "skill_id");
  const expected = optionalText(row, "expected");
  const observed = optionalText(row, "observed");
  return {
    id: text(row, "id") ?? "",
    learnerId: text(row, "learner_id") ?? "",
    sessionId: text(row, "session_id") ?? "",
    itemId: text(row, "item_id") ?? "",
    ...(skillId ? { skillId } : {}),
    type: text(row, "type") as EvidenceEvent["type"],
    ...(expected ? { expected } : {}),
    ...(observed ? { observed } : {}),
    outcome: text(row, "outcome") as EvidenceEvent["outcome"],
    confidence: number(row, "confidence") ?? 0,
    source: text(row, "source") as EvidenceEvent["source"],
    context: json(text(row, "context_json"), {}),
    createdAt: text(row, "created_at") ?? "",
  };
}

export class D1Repository {
  public constructor(private readonly db: D1Database, private readonly now: () => string = () => new Date().toISOString()) {}

  public async getLearner(id: string): Promise<LearnerProfile | undefined> {
    const row = await this.db.prepare("SELECT * FROM learners WHERE id = ?").bind(id).first<D1Row>();
    return row ? learnerFromRow(row) : undefined;
  }

  public async requireLearner(id: string): Promise<LearnerProfile> {
    const learner = await this.getLearner(id);
    if (!learner) throw new WorkerNotFoundError("Learner", id);
    return learner;
  }

  public async createLearner(input: WorkerCreateLearnerInput, objectives: readonly WorkerCreateObjectiveInput[] = [], phrases: readonly WorkerCreatePhraseInput[] = []): Promise<LearnerProfile> {
    if (await this.getLearner(input.id)) throw new WorkerConflictError("Learner", input.id);
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
    const statements = [this.db.prepare("INSERT INTO learners (id, native_language, target_language, level, is_adult, timezone, display_name, roast_opt_in, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(
      learner.id, learner.nativeLanguage, learner.targetLanguage, learner.level, learner.isAdult ? 1 : 0, learner.timezone ?? null, learner.displayName ?? null, learner.roastOptIn ? 1 : 0, timestamp, timestamp,
    )];
    for (const objective of objectives) statements.push(this.objectiveInsert(objective));
    for (const phrase of phrases) statements.push(this.phraseUpsert({ ...phrase, learnerId: phrase.learnerId ?? input.id }));
    try {
      await this.db.batch(statements);
    } catch (error) {
      if (String(error).includes("UNIQUE")) throw new WorkerConflictError("Learner", input.id);
      throw error;
    }
    return learner;
  }

  private objectiveInsert(input: WorkerCreateObjectiveInput): D1PreparedStatement {
    return this.db.prepare("INSERT INTO objectives (id, learner_id, title, description, skill_ids_json, status, target_date) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(
      input.id, input.learnerId, input.title, input.description ?? null, JSON.stringify(input.skillIds ?? []), input.status ?? "active", input.targetDate ?? null,
    );
  }

  public async createObjective(input: WorkerCreateObjectiveInput): Promise<LearningObjective> {
    if (await this.getObjective(input.id)) throw new WorkerConflictError("Objective", input.id);
    await this.db.prepare("INSERT INTO objectives (id, learner_id, title, description, skill_ids_json, status, target_date) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(
      input.id, input.learnerId, input.title, input.description ?? null, JSON.stringify(input.skillIds ?? []), input.status ?? "active", input.targetDate ?? null,
    ).run();
    return (await this.getObjective(input.id)) as LearningObjective;
  }

  public async getObjective(id: string): Promise<LearningObjective | undefined> {
    const row = await this.db.prepare("SELECT * FROM objectives WHERE id = ?").bind(id).first<D1Row>();
    return row ? objectiveFromRow(row) : undefined;
  }

  public async listObjectives(learnerId: string): Promise<readonly LearningObjective[]> {
    const result = await this.db.prepare("SELECT * FROM objectives WHERE learner_id = ? ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, id ASC").bind(learnerId).all<D1Row>();
    return result.results.map(objectiveFromRow);
  }

  private phraseUpsert(input: WorkerCreatePhraseInput): D1PreparedStatement {
    return this.db.prepare("INSERT INTO phrases (id, learner_id, skill_id, objective_id, target_text, translation, language, context, difficulty, content_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET learner_id=excluded.learner_id, skill_id=excluded.skill_id, objective_id=excluded.objective_id, target_text=excluded.target_text, translation=excluded.translation, language=excluded.language, context=excluded.context, difficulty=excluded.difficulty, content_version=excluded.content_version").bind(
      input.id, input.learnerId ?? null, input.skillId, input.objectiveId ?? null, input.targetText, input.translation ?? null, input.language, input.context ?? null, input.difficulty ?? null, input.contentVersion ?? "1",
    );
  }

  public async upsertPhrase(input: WorkerCreatePhraseInput): Promise<LearningItem & { readonly contentVersion: string }> {
    await this.phraseUpsert(input).run();
    return (await this.getPhrase(input.id)) as LearningItem & { readonly contentVersion: string };
  }

  public async getPhrase(id: string): Promise<(LearningItem & { readonly contentVersion: string }) | undefined> {
    const row = await this.db.prepare("SELECT * FROM phrases WHERE id = ?").bind(id).first<D1Row>();
    return row ? phraseFromRow(row) : undefined;
  }

  public async phrasesForLearner(learnerId: string): Promise<readonly (LearningItem & { readonly contentVersion: string })[]> {
    const result = await this.db.prepare("SELECT * FROM phrases WHERE learner_id = ? ORDER BY id ASC").bind(learnerId).all<D1Row>();
    return result.results.map(phraseFromRow);
  }

  public async createSession(input: WorkerCreateSessionInput): Promise<Session> {
    if (await this.getSession(input.id)) throw new WorkerConflictError("Session", input.id);
    await this.db.prepare("INSERT INTO sessions (id, learner_id, target_language, native_language, status, started_at, ended_at, objective_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(
      input.id, input.learnerId, input.targetLanguage, input.nativeLanguage, input.status ?? "active", input.startedAt, input.endedAt ?? null, input.objectiveId ?? null,
    ).run();
    return (await this.getSession(input.id)) as Session;
  }

  public async getSession(id: string): Promise<Session | undefined> {
    const row = await this.db.prepare("SELECT * FROM sessions WHERE id = ?").bind(id).first<D1Row>();
    return row ? sessionFromRow(row) : undefined;
  }

  public async requireSession(id: string): Promise<Session> {
    const session = await this.getSession(id);
    if (!session) throw new WorkerNotFoundError("Session", id);
    return session;
  }

  public async evidenceForLearner(learnerId: string): Promise<readonly EvidenceEvent[]> {
    const result = await this.db.prepare("SELECT * FROM evidence WHERE learner_id = ? ORDER BY created_at ASC, id ASC").bind(learnerId).all<D1Row>();
    return result.results.map(evidenceFromRow);
  }

  public async appendEvidence(event: EvidenceEvent): Promise<WorkerAppendEvidenceResult> {
    validateEvidenceEvent(event);
    await this.requireLearner(event.learnerId);
    const session = await this.requireSession(event.sessionId);
    if (session.learnerId !== event.learnerId) throw new Error("sessionId does not belong to learnerId");
    const result = await this.db.prepare("INSERT OR IGNORE INTO evidence (id, learner_id, session_id, item_id, skill_id, type, expected, observed, outcome, confidence, source, context_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(
      event.id, event.learnerId, event.sessionId, event.itemId, event.skillId ?? null, event.type, event.expected ?? null, event.observed ?? null, event.outcome, event.confidence, event.source, JSON.stringify(event.context), event.createdAt,
    ).run();
    if ((result.meta.changes ?? 0) === 0) {
      const existing = await this.db.prepare("SELECT * FROM evidence WHERE id = ?").bind(event.id).first<D1Row>();
      if (existing) return { accepted: false, duplicate: true, event: evidenceFromRow(existing) };
    }
    return { accepted: true, duplicate: false, event: { ...event, context: { ...event.context } } };
  }

  public async getSummary(learnerId: string): Promise<WorkerSummary> {
    const learner = await this.requireLearner(learnerId);
    const events = await this.evidenceForLearner(learnerId);
    const phrases = await this.phrasesForLearner(learnerId);
    const skills = [...projectSkills(events, phrases).values()];
    const count = await this.db.prepare("SELECT COUNT(*) AS count FROM sessions WHERE learner_id = ?").bind(learnerId).first<D1Row>();
    return {
      learner,
      skills,
      skillStates: skills,
      evidenceCount: events.length,
      sessionCount: number(count ?? {}, "count") ?? 0,
      recentEvidence: events.slice(-10).reverse(),
    };
  }

  public async getReviewQueue(learnerId: string, now = this.now()): Promise<readonly ReviewItem[]> {
    await this.requireLearner(learnerId);
    const events = await this.evidenceForLearner(learnerId);
    const phrases = await this.phrasesForLearner(learnerId);
    const itemBySkill = new Map<string, LearningItem>();
    for (const phrase of phrases) if (!itemBySkill.has(phrase.skillId)) itemBySkill.set(phrase.skillId, phrase);
    const items: ReviewItem[] = [];
    for (const state of projectSkills(events, phrases).values()) {
      const related = events.filter((event) => (event.skillId ?? phrases.find((phrase) => phrase.id === event.itemId)?.skillId ?? event.itemId) === state.skillId);
      const latest = related.at(-1)?.createdAt ?? now;
      const signals = reviewSignalsFromEvidence(related, now);
      const item = itemBySkill.get(state.skillId);
      items.push(createReviewItem({
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
}
