import type {
  ElevenLabsAgentProvider,
  PhraseAudio,
  PhraseReplayRequest,
  VoiceProvider,
  VoiceSessionContext,
  VoiceSessionContextInput,
  VoiceSessionHandle,
} from "../../../../packages/providers/dist/index.js";
import { providers } from "./provider-runtime.js";
import type { SqliteRepository } from "../persistence/index.js";

export interface VoiceSessionServiceOptions {
  readonly repository: SqliteRepository;
  readonly environment?: NodeJS.ProcessEnv;
  readonly now?: () => string;
  readonly fetchImpl?: typeof fetch;
}

export interface VoiceConnectRequest {
  readonly sessionId: string;
  readonly learnerId: string;
  readonly objectiveId?: string;
  readonly itemId?: string;
  readonly tutorPersonality?: string;
  readonly roastMode?: "off" | "friendly";
  readonly connect?: boolean;
}

export interface VoiceFallback {
  readonly code: "missing_credentials" | "provider_unavailable" | "rate_limited";
  readonly message: string;
  readonly mode: "text_fallback";
}

export interface VoiceConnectResult {
  readonly mode: "offline" | "live";
  readonly status: "ready" | "text_fallback";
  readonly fallback: boolean;
  readonly context: VoiceSessionContext;
  readonly signedUrl?: string;
  readonly fallbackDetails?: VoiceFallback;
}

export interface VoiceReplayResult {
  readonly mode: "offline" | "live";
  readonly audio?: PhraseAudio;
  readonly fallback?: VoiceFallback;
}

export type VoiceReplayRequest = Omit<PhraseReplayRequest, "voiceId"> & { readonly voiceId?: string };

const TEXT_FALLBACK_MESSAGE = "Live voice is unavailable. Continue with text practice while voice is restored.";
const CREDENTIAL_FALLBACK_MESSAGE = "Live voice is not configured. Continue with text practice or configure ElevenLabs credentials.";

function modeOf(environment: NodeJS.ProcessEnv | undefined): "offline" | "live" {
  return (environment?.LINGOFLOW_MODE ?? process.env.LINGOFLOW_MODE ?? "offline") === "live" ? "live" : "offline";
}

function boundedEnvironmentNumber(
  environment: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(environment[key]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(parsed)));
}

function errorCode(error: unknown): VoiceFallback["code"] {
  if (error instanceof providers.ProviderRequestError && error.status === 429) return "rate_limited";
  return error instanceof providers.MissingProviderCredentialsError ? "missing_credentials" : "provider_unavailable";
}

function fallbackFor(error: unknown): VoiceFallback {
  const code = errorCode(error);
  return {
    code,
    mode: "text_fallback",
    message: code === "missing_credentials"
      ? CREDENTIAL_FALLBACK_MESSAGE
      : code === "rate_limited"
        ? "Live voice is temporarily rate-limited. Wait a moment, then try again or continue with text practice."
        : TEXT_FALLBACK_MESSAGE,
  };
}

function isVoiceContextInput(value: VoiceConnectRequest | VoiceSessionContextInput): value is VoiceSessionContextInput {
  return "request" in value;
}

/**
 * Provider-neutral voice orchestration. The service owns mode selection and
 * turns provider failures into a safe text fallback without returning provider
 * errors, request bodies, or credentials to callers.
 */
export class VoiceSessionService {
  public readonly mode: "offline" | "live";
  private readonly repository: SqliteRepository;
  private readonly environment: NodeJS.ProcessEnv;
  private readonly now: () => string;
  private readonly provider: Pick<VoiceProvider, "replayPhrase">;
  private readonly contextProvider: VoiceProvider | ElevenLabsAgentProvider;

  public constructor(options: VoiceSessionServiceOptions) {
    this.repository = options.repository;
    this.environment = options.environment ?? process.env;
    this.now = options.now ?? (() => new Date().toISOString());
    this.mode = modeOf(this.environment);
    const common = {
      mode: this.mode,
      fetchImpl: options.fetchImpl,
      apiKey: this.environment.ELEVENLABS_API_KEY,
      agentId: this.environment.ELEVENLABS_AGENT_ID,
      voiceId: this.environment.ELEVENLABS_VOICE_ID,
      baseUrl: this.environment.ELEVENLABS_BASE_URL,
      timeoutMs: boundedEnvironmentNumber(this.environment, "LINGOFLOW_PROVIDER_TIMEOUT_MS", 12_000, 1, 120_000),
      maxRetries: boundedEnvironmentNumber(this.environment, "LINGOFLOW_PROVIDER_RETRIES", 2, 0, 5),
    } as const;
    this.provider = this.mode === "live"
      ? new providers.ElevenLabsPhraseReplayProvider(common)
      : new providers.FakeVoiceProvider();
    this.contextProvider = this.mode === "live"
      ? new providers.ElevenLabsAgentProvider(common)
      : new providers.FakeVoiceProvider();
  }

  public createSessionContext(input: VoiceConnectRequest | VoiceSessionContextInput): VoiceSessionContext {
    return this.contextProvider.createSessionContext(isVoiceContextInput(input) ? input : this.buildContextInput(input));
  }

  public async connect(input: VoiceConnectRequest | VoiceSessionContextInput): Promise<VoiceConnectResult> {
    const contextInput = isVoiceContextInput(input) ? input : this.buildContextInput(input);
    const context = this.contextProvider.createSessionContext(contextInput);
    if (this.mode === "offline") {
      return { mode: "offline", status: "ready", fallback: false, context };
    }

    if (inputIsDisabled(input)) return { mode: "live", status: "ready", fallback: false, context };

    try {
      const handle = await (this.contextProvider as ElevenLabsAgentProvider).connect(contextInput);
      return this.successfulConnection(handle);
    } catch (error) {
      return { mode: "live", status: "text_fallback", fallback: true, context, fallbackDetails: fallbackFor(error) };
    }
  }

  public async replayPhrase(request: VoiceReplayRequest): Promise<VoiceReplayResult> {
    const providerRequest: PhraseReplayRequest = {
      ...request,
      voiceId: request.voiceId ?? (this.mode === "live" ? this.environment.ELEVENLABS_VOICE_ID ?? "" : "fake"),
    };
    try {
      return { mode: this.mode, audio: await this.provider.replayPhrase(providerRequest) };
    } catch (error) {
      if (this.mode !== "live") throw error;
      return { mode: "live", fallback: fallbackFor(error) };
    }
  }

  private successfulConnection(handle: VoiceSessionHandle): VoiceConnectResult {
    return {
      mode: "live",
      status: "ready",
      fallback: false,
      context: handle.context,
      ...(handle.signedUrl ? { signedUrl: handle.signedUrl } : {}),
    };
  }

  private buildContextInput(input: VoiceConnectRequest): VoiceSessionContextInput {
    const learner = this.repository.requireLearner(input.learnerId);
    const session = this.repository.requireSession(input.sessionId);
    if (session.learnerId !== learner.id) throw new Error("sessionId does not belong to learnerId");
    const objectiveId = input.objectiveId ?? session.objectiveId;
    const objective = objectiveId ? this.repository.getObjective(objectiveId) : undefined;
    const activeItem = input.itemId ? this.repository.getPhrase(input.itemId) : undefined;
    const queue = this.repository.getReviewQueue(input.learnerId, this.now());
    const reviewItem = queue.find((item) => item.itemId === input.itemId) ?? queue[0];
    const summary = this.repository.getSummary(input.learnerId);
    const topErrorPatterns = summary.skills
      .filter((skill) => skill.errorCount > 0)
      .sort((left, right) => right.priorityScore - left.priorityScore || left.skillId.localeCompare(right.skillId))
      .slice(0, 2)
      .map((skill) => skill.skillId);

    return {
      request: {
        sessionId: session.id,
        learnerId: learner.id,
        targetLanguage: session.targetLanguage,
        nativeLanguage: session.nativeLanguage,
        ...(objectiveId ? { objectiveId } : {}),
        ...(input.itemId ? { itemId: input.itemId } : {}),
      },
      learner: {
        level: learner.level,
        ...(learner.displayName ? { displayName: learner.displayName } : {}),
        isAdult: learner.isAdult,
      },
      ...(objective ? { objective: { title: objective.title, ...(objective.description ? { description: objective.description } : {}) } } : {}),
      ...(activeItem ? { activeItem: { targetText: activeItem.targetText, ...(activeItem.translation ? { translation: activeItem.translation } : {}), language: activeItem.language } } : {}),
      topErrorPatterns,
      ...(reviewItem ? { reviewItem } : {}),
      tutorPersonality: input.tutorPersonality ?? "patient mentor",
      roastMode: input.roastMode ?? "off",
    };
  }
}

function inputIsDisabled(input: VoiceConnectRequest | VoiceSessionContextInput): boolean {
  return !isVoiceContextInput(input) && input.connect === false;
}

export function createVoiceSessionService(options: VoiceSessionServiceOptions): VoiceSessionService {
  return new VoiceSessionService(options);
}
