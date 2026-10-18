import type {
  AssessmentResult,
  LearningItem,
  LearningObjective,
  LearnerProfile,
  PronunciationAssessmentRequest,
  ReviewItem,
  VoiceSessionRequest,
} from "../../contracts/dist/index.js";

/** Values used to build a tutor session without exposing provider SDK types. */
export interface VoiceSessionContextInput {
  readonly request: VoiceSessionRequest;
  readonly learner: Pick<LearnerProfile, "level" | "displayName" | "isAdult">;
  readonly objective?: Pick<LearningObjective, "title" | "description">;
  readonly activeItem?: Pick<LearningItem, "targetText" | "translation" | "language">;
  readonly topErrorPatterns?: readonly string[];
  readonly reviewItem?: Pick<ReviewItem, "id" | "reason" | "priority">;
  readonly tutorPersonality?: string;
  readonly roastMode?: "off" | "friendly";
}

/** A provider-neutral context handed to a live voice adapter. */
export interface VoiceSessionContext {
  readonly sessionId: string;
  readonly learnerId: string;
  readonly modelId: string;
  readonly dynamicVariables: Readonly<Record<string, string>>;
  readonly systemPrompt: string;
}

export interface PhraseReplayRequest {
  readonly phraseId: string;
  readonly text: string;
  readonly language: string;
  readonly voiceId: string;
  readonly speed?: number;
  readonly contentVersion: string;
}

export interface PhraseAudio {
  readonly cacheKey: string;
  readonly audio: Uint8Array;
  readonly contentType: string;
  readonly modelId: string;
  readonly durationMs?: number;
}

export interface VoiceProvider {
  readonly mode: "offline" | "live";
  createSessionContext(input: VoiceSessionContextInput): VoiceSessionContext;
  replayPhrase(request: PhraseReplayRequest): Promise<PhraseAudio>;
}

export interface AssessmentProvider {
  assess(request: PronunciationAssessmentRequest): Promise<AssessmentResult>;
}

export interface VoiceSessionHandle {
  readonly signedUrl?: string;
  readonly context: VoiceSessionContext;
}

export interface LiveVoiceProvider extends VoiceProvider {
  connect(input: VoiceSessionContextInput): Promise<VoiceSessionHandle>;
}
