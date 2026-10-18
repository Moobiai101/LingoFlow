/** A JSON value used by normalized provider boundaries. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { readonly [key: string]: JsonValue };

export type IsoDateTime = string;
export type LearnerId = string;
export type SessionId = string;
export type ObjectiveId = string;
export type LearningItemId = string;
export type SkillId = string;
export type EvidenceId = string;
export type ReviewItemId = string;
export type LanguageCode = string;

export type CEFRLevel = "a1" | "a2" | "b1" | "b2" | "c1" | "c2" | "unknown";

export interface LearnerProfile {
  readonly id: LearnerId;
  readonly nativeLanguage: LanguageCode;
  readonly targetLanguage: LanguageCode;
  readonly level: CEFRLevel | string;
  readonly isAdult: boolean;
  readonly timezone?: string;
  readonly displayName?: string;
  readonly roastOptIn?: boolean;
  readonly createdAt?: IsoDateTime;
  readonly updatedAt?: IsoDateTime;
}

export type ObjectiveStatus = "active" | "completed" | "paused";

export interface LearningObjective {
  readonly id: ObjectiveId;
  readonly learnerId: LearnerId;
  readonly title: string;
  readonly description?: string;
  readonly skillIds: readonly SkillId[];
  readonly status: ObjectiveStatus;
  readonly targetDate?: IsoDateTime;
}

export interface LearningItem {
  readonly id: LearningItemId;
  readonly skillId: SkillId;
  readonly objectiveId?: ObjectiveId;
  readonly targetText: string;
  readonly translation?: string;
  readonly language: LanguageCode;
  readonly context?: string;
  readonly difficulty?: number;
}

export type SessionStatus = "active" | "completed" | "cancelled";

export interface Session {
  readonly id: SessionId;
  readonly learnerId: LearnerId;
  readonly targetLanguage: LanguageCode;
  readonly nativeLanguage: LanguageCode;
  readonly status: SessionStatus;
  readonly startedAt: IsoDateTime;
  readonly endedAt?: IsoDateTime;
  readonly objectiveId?: ObjectiveId;
}

export type UtteranceSpeaker = "learner" | "tutor";

export interface Utterance {
  readonly id: string;
  readonly sessionId: SessionId;
  readonly speaker: UtteranceSpeaker;
  readonly text: string;
  readonly language: LanguageCode;
  readonly turnId: string;
  readonly createdAt: IsoDateTime;
}

export type EvidenceType =
  | "understood"
  | "attempted"
  | "corrected"
  | "recalled"
  | "pronunciation_assessed"
  | "hint_required"
  | "retry_success"
  | "transfer_success"
  | "transfer_failure";

/** The result of an observation. `correct`/`incorrect` are retained as wire-compatible aliases. */
export type EvidenceOutcome = "success" | "failure" | "uncertain" | "correct" | "incorrect";

export type EvidenceSource =
  | "conversation"
  | "assessment"
  | "review"
  | "transfer"
  | "system"
  | "import";

export interface EvidenceContext {
  readonly turnId?: string;
  readonly scenarioId?: string;
  readonly surface?: string;
  readonly intent?: string;
  readonly isTransfer?: boolean;
  readonly [key: string]: JsonValue | undefined;
}

export interface EvidenceEvent {
  readonly id: EvidenceId;
  readonly learnerId: LearnerId;
  readonly sessionId: SessionId;
  readonly itemId: LearningItemId;
  readonly skillId?: SkillId;
  readonly type: EvidenceType;
  readonly expected?: string;
  readonly observed?: string;
  readonly outcome: EvidenceOutcome;
  readonly confidence: number;
  readonly source: EvidenceSource;
  readonly context: EvidenceContext;
  readonly createdAt: IsoDateTime;
}

export type PersistenceState = "none" | "temporary" | "suspected" | "persistent";
export type ReviewPriority = "low" | "normal" | "high";

export interface SkillState {
  readonly skillId: SkillId;
  readonly evidenceCount: number;
  readonly successfulAttempts: number;
  readonly failedAttempts: number;
  readonly errorCount: number;
  readonly uncertainAttempts: number;
  readonly highConfidenceErrors: number;
  readonly distinctTurns: number;
  readonly distinctSessions: number;
  readonly successfulTransfers: number;
  readonly failedTransfers: number;
  readonly persistence: PersistenceState;
  readonly priority: ReviewPriority;
  readonly reviewPriority: ReviewPriority;
  readonly priorityScore: number;
  readonly lastEvidenceAt?: IsoDateTime;
  readonly lastErrorAt?: IsoDateTime;
}

export type ReviewReason =
  | "due_for_review"
  | "repeated_error"
  | "hint_required"
  | "transfer_not_demonstrated"
  | "failed_transfer"
  | "long_inactivity";

export interface ReviewItem {
  readonly id: ReviewItemId;
  readonly learnerId: LearnerId;
  readonly itemId: LearningItemId;
  readonly skillId: SkillId;
  readonly dueAt: IsoDateTime;
  readonly intervalDays: number;
  readonly successfulReviews: number;
  readonly priority: ReviewPriority;
  readonly priorityScore: number;
  readonly reason: ReviewReason;
}

export type VoiceSessionState =
  | "idle"
  | "requesting_microphone"
  | "connecting"
  | "listening"
  | "learner_speaking"
  | "tutor_thinking"
  | "tutor_speaking"
  | "interrupted"
  | "reconnecting"
  | "text_fallback"
  | "session_complete";

export type NormalizedVoiceEventType =
  | "session_started"
  | "state_changed"
  | "learner_turn"
  | "tutor_turn"
  | "interrupted"
  | "provider_error"
  | "session_ended";

export interface VoiceSessionRequest {
  readonly sessionId: SessionId;
  readonly learnerId: LearnerId;
  readonly targetLanguage: LanguageCode;
  readonly nativeLanguage: LanguageCode;
  readonly objectiveId?: ObjectiveId;
  readonly itemId?: LearningItemId;
}

export interface NormalizedVoiceEvent {
  readonly id: string;
  readonly sessionId: SessionId;
  readonly type: NormalizedVoiceEventType;
  readonly state?: VoiceSessionState;
  readonly text?: string;
  readonly language?: LanguageCode;
  readonly occurredAt: IsoDateTime;
  readonly provider?: string;
  readonly metadata?: Readonly<Record<string, JsonValue>>;
}

export type AssessmentStatus = "pending" | "complete" | "uncertain" | "failed";

export interface PronunciationAssessmentRequest {
  readonly id: string;
  readonly learnerId: LearnerId;
  readonly sessionId: SessionId;
  readonly itemId: LearningItemId;
  readonly expected: string;
  readonly observed: string;
  readonly language: LanguageCode;
  readonly capability: "pronunciation_assessment";
}

export interface PronunciationAssessment {
  readonly id: string;
  readonly requestId: string;
  readonly learnerId: LearnerId;
  readonly sessionId: SessionId;
  readonly itemId: LearningItemId;
  readonly expected: string;
  readonly observed: string;
  readonly status: AssessmentStatus;
  readonly confidence: number;
  /** Scores are optional; low-confidence results must not invent a score. */
  readonly score?: number;
  readonly feedback?: readonly string[];
  readonly evaluatedAt: IsoDateTime;
  readonly language: LanguageCode;
}

/** Provider-neutral name for a normalized assessment result. */
export type AssessmentResult = PronunciationAssessment;
export type NormalizedAssessment = PronunciationAssessment;

export type RoastSessionMode = "off" | "friendly";

export interface ConsentPolicy {
  readonly adultUser: boolean;
  readonly explicitOptIn: boolean;
  readonly sessionMode: RoastSessionMode;
  readonly noSafetyRestriction?: boolean;
}

export type RoastGateReason =
  | "allowed"
  | "not_adult"
  | "not_opted_in"
  | "session_off"
  | "safety_restricted"
  | "correction_missing"
  | "already_used"
  | "unsafe_content";

export interface RoastRequest {
  readonly correctionId: string;
  readonly attemptText: string;
  readonly correctionText: string;
  readonly requestedText?: string;
}

export interface RoastDecision {
  readonly allowed: boolean;
  readonly reason: RoastGateReason;
}

export type LanguageCapability =
  | "conversation"
  | "pronunciation_assessment"
  | "phrase_replay"
  | "transliteration"
  | "translation";
