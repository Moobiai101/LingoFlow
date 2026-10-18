import { providers } from "./provider-runtime.js";

export * from "./session-context.js";
export * from "./events.js";
export * from "./phrase-replay.js";
export * from "./assessment.js";

export const ELEVENLABS_DEFAULT_BASE_URL = providers.ELEVENLABS_DEFAULT_BASE_URL;
export const ELEVENLABS_PHRASE_MODEL = providers.ELEVENLABS_PHRASE_MODEL;
export const ElevenLabsAgentProvider = providers.ElevenLabsAgentProvider;
export const ElevenLabsPhraseReplayProvider = providers.ElevenLabsPhraseReplayProvider;
export const FakeAssessmentProvider = providers.FakeAssessmentProvider;
export const FakeVoiceProvider = providers.FakeVoiceProvider;
export const MissingProviderCredentialsError = providers.MissingProviderCredentialsError;
export const ProviderRequestError = providers.ProviderRequestError;
export const buildPhraseReplayCacheKey = providers.buildPhraseReplayCacheKey;
export const createPhraseReplayCacheKey = providers.createPhraseReplayCacheKey;
export const OfflineAssessmentProvider = providers.OfflineAssessmentProvider;
export const OfflineVoiceProvider = providers.OfflineVoiceProvider;
export const PhraseReplayCache = providers.PhraseReplayCache;

export type {
  AssessmentProvider,
  ElevenLabsAgentContext,
  ElevenLabsOptions,
  LiveVoiceProvider,
  PhraseAudio,
  PhraseReplayRequest,
  VoiceProvider,
  VoiceSessionContext,
  VoiceSessionContextInput,
} from "../../../../packages/providers/dist/index.js";
