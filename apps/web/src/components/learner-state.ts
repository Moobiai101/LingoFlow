export type ConnectionMode = "connected" | "offline";

export type GoalId = "everyday" | "work" | "travel";
export type LevelId = "a1" | "a2" | "b1" | "b2";
export type PersonalityId = "patient" | "energetic" | "direct";

export type OnboardingProfile = {
  readonly displayName: string;
  readonly nativeLanguage: string;
  readonly targetLanguage: string;
  readonly goal: GoalId;
  readonly level: LevelId;
  readonly personality: PersonalityId;
  readonly roastOptIn: boolean;
};

export type ReviewItem = {
  readonly id: string;
  readonly itemId: string;
  readonly skillId: string;
  readonly reason: string;
  readonly priority: "low" | "normal" | "high";
};

export type SkillSummary = {
  readonly skillId: string;
  readonly errorCount: number;
  readonly priorityScore: number;
  readonly persistence?: string;
};

export type LearnerSession = {
  readonly learnerId: string;
  readonly sessionId: string;
  readonly objectiveId: string;
  readonly profile: OnboardingProfile;
  readonly connection: ConnectionMode;
  readonly reviewItems: readonly ReviewItem[];
  readonly skills: readonly SkillSummary[];
};

type ApiLearnerResponse = { readonly learner?: { readonly id?: string } };
type ApiSessionResponse = { readonly session?: { readonly id?: string } };
type ApiSummaryResponse = { readonly skills?: readonly SkillSummary[] };
type ApiReviewResponse = { readonly items?: readonly ReviewItem[] };

export type VoiceConnectResponse = {
  readonly mode: "offline" | "live";
  readonly status: "ready" | "text_fallback";
  readonly fallback: boolean;
  readonly signedUrl?: string;
  readonly context?: {
    readonly systemPrompt?: string;
    readonly dynamicVariables?: Readonly<Record<string, string>>;
  };
  readonly fallbackDetails?: {
    readonly code?: string;
    readonly message: string;
  };
};

export type PracticeResult = {
  readonly mode: "offline_transcript";
  readonly status: "complete" | "uncertain" | "failed";
  readonly confidence: number;
  readonly score?: number;
  readonly feedback?: readonly string[];
  readonly saved: boolean;
  readonly duplicate?: boolean;
};

export type PhraseReplayResult = {
  readonly mode: "offline" | "live";
  readonly played: boolean;
  readonly message: string;
};

const STORAGE_KEY = "lingoflow.learner-session.v1";
const LOCAL_LEARNER_ID = "learner-local-asha";
const LOCAL_SESSION_ID = "session-local-first";
const LOCAL_OBJECTIVE_ID = "objective-everyday-confidence";
const LOCAL_START = "2026-01-15T12:00:00.000Z";

const starterPhrases = (objectiveId: string) => [
  {
    id: "phrase-could-i",
    skillId: "polite questions",
    objectiveId,
    targetText: "Could I have water?",
    translation: "क्या मुझे पानी मिल सकता है?",
    language: "en",
    context: "A polite request at a cafe",
  },
  {
    id: "phrase-because",
    skillId: "connecting ideas",
    objectiveId,
    targetText: "because",
    translation: "क्योंकि",
    language: "en",
    context: "Connect an idea to a reason",
  },
];

export const defaultProfile: OnboardingProfile = {
  displayName: "Asha",
  nativeLanguage: "hi",
  targetLanguage: "en",
  goal: "everyday",
  level: "a2",
  personality: "patient",
  roastOptIn: false,
};

const fallbackReviewItems: readonly ReviewItem[] = [
  { id: "review-local-questions", itemId: "phrase-could-i", skillId: "polite questions", reason: "repeated_error", priority: "high" },
  { id: "review-local-connectors", itemId: "phrase-because", skillId: "connecting ideas", reason: "due_for_review", priority: "normal" },
];

const fallbackSkills: readonly SkillSummary[] = [
  { skillId: "polite questions", errorCount: 2, priorityScore: 4, persistence: "building" },
  { skillId: "connecting ideas", errorCount: 1, priorityScore: 2, persistence: "new" },
  { skillId: "confidence", errorCount: 0, priorityScore: 0, persistence: "steady" },
];

export const fallbackLearnerSession: LearnerSession = {
  learnerId: LOCAL_LEARNER_ID,
  sessionId: LOCAL_SESSION_ID,
  objectiveId: LOCAL_OBJECTIVE_ID,
  profile: defaultProfile,
  connection: "offline",
  reviewItems: fallbackReviewItems,
  skills: fallbackSkills,
};

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!response.ok) throw new Error(`API request failed (${response.status})`);
  return response.json() as Promise<T>;
}

function profileFromStorage(value: unknown): OnboardingProfile | undefined {
  if (!value || typeof value !== "object") return undefined;
  const profile = (value as { profile?: unknown }).profile;
  if (!profile || typeof profile !== "object") return undefined;
  const candidate = profile as Partial<OnboardingProfile>;
  if (typeof candidate.displayName !== "string" || typeof candidate.nativeLanguage !== "string" || typeof candidate.targetLanguage !== "string") return undefined;
  if (!candidate.goal || !candidate.level || !candidate.personality || typeof candidate.roastOptIn !== "boolean") return undefined;
  return {
    displayName: candidate.displayName,
    nativeLanguage: candidate.nativeLanguage,
    targetLanguage: candidate.targetLanguage,
    goal: candidate.goal,
    level: candidate.level,
    personality: candidate.personality,
    roastOptIn: candidate.roastOptIn,
  };
}

export function saveLearnerSession(state: LearnerSession): void {
  if (!hasWindow()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function readLearnerSession(): LearnerSession | undefined {
  if (!hasWindow()) return undefined;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const value = JSON.parse(raw) as unknown;
    const profile = profileFromStorage(value);
    const candidate = value as Partial<LearnerSession>;
    if (!profile || typeof candidate.learnerId !== "string" || typeof candidate.sessionId !== "string") return undefined;
    return {
      learnerId: candidate.learnerId,
      sessionId: candidate.sessionId,
      objectiveId: typeof candidate.objectiveId === "string" ? candidate.objectiveId : LOCAL_OBJECTIVE_ID,
      profile,
      connection: candidate.connection === "connected" ? "connected" : "offline",
      reviewItems: Array.isArray(candidate.reviewItems) ? candidate.reviewItems : fallbackReviewItems,
      skills: Array.isArray(candidate.skills) ? candidate.skills : fallbackSkills,
    };
  } catch {
    return undefined;
  }
}

function objectiveFor(profile: OnboardingProfile): { id: string; title: string; description: string; skillIds: string[] } {
  const goals: Record<GoalId, { title: string; description: string; skillIds: string[] }> = {
    everyday: { title: "Everyday conversation", description: "Speak with more ease in the moments you have every day.", skillIds: ["confidence", "polite questions"] },
    work: { title: "Work and meetings", description: "Share an idea clearly when the room moves quickly.", skillIds: ["clarity", "connecting ideas"] },
    travel: { title: "Travel with confidence", description: "Ask, answer, and explore without losing your thread.", skillIds: ["polite questions", "confidence"] },
  };
  return { id: `${LOCAL_OBJECTIVE_ID}-${profile.goal}`, ...goals[profile.goal] };
}

function fallbackFor(profile: OnboardingProfile): LearnerSession {
  const objective = objectiveFor(profile);
  return { ...fallbackLearnerSession, objectiveId: objective.id, profile };
}

async function ensureStarterContent(
  learnerId: string,
  objective: { readonly id: string; readonly title: string; readonly description: string; readonly skillIds: readonly string[] },
): Promise<void> {
  try {
    await request(`/api/learners/${learnerId}/objectives`, {
      method: "POST",
      body: JSON.stringify(objective),
    });
  } catch (error) {
    if (!String(error).includes("(409)")) throw error;
  }
  await Promise.all(starterPhrases(objective.id).map((phrase) => request(`/api/learners/${learnerId}/phrases`, {
    method: "POST",
    body: JSON.stringify(phrase),
  })));
}

export async function createOrHydrateLearner(profile: OnboardingProfile): Promise<LearnerSession> {
  const fallback = fallbackFor(profile);
  if (!hasWindow()) return fallback;
  try {
    const objective = objectiveFor(profile);
    let learnerId = LOCAL_LEARNER_ID;
    try {
      const learnerResponse = await request<ApiLearnerResponse>("/api/learners", {
        method: "POST",
        body: JSON.stringify({
          id: LOCAL_LEARNER_ID,
          nativeLanguage: profile.nativeLanguage,
          targetLanguage: profile.targetLanguage,
          level: profile.level,
          isAdult: true,
          displayName: profile.displayName,
          roastOptIn: profile.roastOptIn,
          objectives: [{ id: objective.id, title: objective.title, description: objective.description, skillIds: objective.skillIds }],
          phrases: starterPhrases(objective.id),
        }),
      });
      learnerId = learnerResponse.learner?.id ?? LOCAL_LEARNER_ID;
    } catch (error) {
      if (!String(error).includes("(409)")) throw error;
      await ensureStarterContent(learnerId, objective);
    }
    let sessionId = LOCAL_SESSION_ID;
    try {
      const sessionResponse = await request<ApiSessionResponse>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ id: LOCAL_SESSION_ID, learnerId, targetLanguage: profile.targetLanguage, nativeLanguage: profile.nativeLanguage, objectiveId: objective.id, startedAt: LOCAL_START }),
      });
      sessionId = sessionResponse.session?.id ?? LOCAL_SESSION_ID;
    } catch (error) {
      if (!String(error).includes("(409)")) throw error;
    }
    const [summary, review] = await Promise.all([
      request<ApiSummaryResponse>(`/api/learners/${learnerId}/summary`),
      request<ApiReviewResponse>(`/api/learners/${learnerId}/review-queue`),
    ]);
    const state: LearnerSession = {
      learnerId,
      sessionId,
      objectiveId: objective.id,
      profile,
      connection: "connected",
      reviewItems: review.items ?? fallback.reviewItems,
      skills: summary.skills ?? fallback.skills,
    };
    saveLearnerSession(state);
    return state;
  } catch {
    saveLearnerSession(fallback);
    return fallback;
  }
}

export async function hydrateSavedLearner(): Promise<LearnerSession | undefined> {
  const saved = readLearnerSession();
  if (!saved || !hasWindow()) return saved;
  try {
    const [summary, review] = await Promise.all([
      request<ApiSummaryResponse>(`/api/learners/${saved.learnerId}/summary`),
      request<ApiReviewResponse>(`/api/learners/${saved.learnerId}/review-queue`),
    ]);
    const refreshed: LearnerSession = { ...saved, connection: "connected", skills: summary.skills ?? saved.skills, reviewItems: review.items ?? saved.reviewItems };
    saveLearnerSession(refreshed);
    return refreshed;
  } catch {
    return { ...saved, connection: "offline" };
  }
}

/** Re-read deterministic projections after a new evidence event is stored. */
export async function refreshLearnerSession(state: LearnerSession): Promise<LearnerSession> {
  if (!hasWindow()) return state;
  try {
    const [summary, review] = await Promise.all([
      request<ApiSummaryResponse>(`/api/learners/${state.learnerId}/summary`),
      request<ApiReviewResponse>(`/api/learners/${state.learnerId}/review-queue`),
    ]);
    const refreshed: LearnerSession = {
      ...state,
      connection: "connected",
      skills: summary.skills ?? state.skills,
      reviewItems: review.items ?? state.reviewItems,
    };
    saveLearnerSession(refreshed);
    return refreshed;
  } catch {
    return state;
  }
}

/** Ask the server for a safe live/offline voice connection description. */
export async function connectVoice(state: LearnerSession, itemId = "phrase-could-i"): Promise<VoiceConnectResponse> {
  if (!hasWindow()) {
    return {
      mode: "offline",
      status: "text_fallback",
      fallback: true,
      fallbackDetails: { message: "Voice is available from the browser studio." },
    };
  }
  try {
    return await request<VoiceConnectResponse>("/api/voice/connect", {
      method: "POST",
      body: JSON.stringify({
        learnerId: state.learnerId,
        sessionId: state.sessionId,
        objectiveId: state.objectiveId,
        itemId,
        tutorPersonality: state.profile.personality,
        roastMode: state.profile.roastOptIn ? "friendly" : "off",
      }),
    });
  } catch {
    return {
      mode: "offline",
      status: "text_fallback",
      fallback: true,
      fallbackDetails: { message: "The conversation server is unavailable. Continue with local text practice." },
    };
  }
}

function localPracticeFallback(observed: string): PracticeResult {
  return {
    mode: "offline_transcript",
    status: observed.trim() ? "uncertain" : "failed",
    confidence: 0,
    feedback: [
      observed.trim()
        ? "The local studio could not save this attempt. Try again when the conversation server is available."
        : "No transcript was entered.",
    ],
    saved: false,
  };
}

/** Submit transcript practice and preserve an honest offline fallback. */
export async function assessPractice(
  state: LearnerSession,
  input: { readonly itemId: string; readonly observed: string; readonly requestId: string },
): Promise<PracticeResult> {
  if (!hasWindow()) return localPracticeFallback(input.observed);
  try {
    const response = await request<{
      readonly mode: "offline_transcript";
      readonly status: PracticeResult["status"];
      readonly confidence: number;
      readonly score?: number;
      readonly feedback?: readonly string[];
      readonly duplicate?: boolean;
    }>("/api/practice/assess", {
      method: "POST",
      body: JSON.stringify({
        learnerId: state.learnerId,
        sessionId: state.sessionId,
        itemId: input.itemId,
        observed: input.observed,
        requestId: input.requestId,
      }),
    });
    return { ...response, saved: true };
  } catch {
    return localPracticeFallback(input.observed);
  }
}

/** Replay a phrase through the provider route without exposing provider credentials. */
export async function replayPhrase(state: LearnerSession, itemId: string, text: string): Promise<PhraseReplayResult> {
  if (!hasWindow()) return { mode: "offline", played: false, message: "Phrase replay is available from the browser studio." };
  try {
    const response = await fetch("/api/voice/replay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phraseId: itemId, text, language: state.profile.targetLanguage, contentVersion: "1" }),
    });
    const mode = response.headers.get("x-lingoflow-mode") === "live" ? "live" : "offline";
    if (!response.ok) throw new Error(`Phrase replay failed (${response.status})`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("audio/")) {
      const body = await response.json() as { readonly message?: unknown };
      return { mode, played: false, message: typeof body.message === "string" ? body.message : "Phrase replay is in text fallback mode." };
    }
    if (mode === "offline") return { mode, played: false, message: "Offline mode keeps phrase replay text-only." };
    const audioUrl = URL.createObjectURL(await response.blob());
    const audio = new Audio(audioUrl);
    audio.addEventListener("ended", () => URL.revokeObjectURL(audioUrl), { once: true });
    await audio.play();
    return { mode, played: true, message: "Phrase replay started." };
  } catch {
    return { mode: "offline", played: false, message: "Phrase replay is unavailable. Continue with text practice." };
  }
}

export async function postEvidence(state: LearnerSession, payload: Record<string, unknown>): Promise<boolean> {
  if (!hasWindow()) return false;
  try {
    await request("/api/evidence", { method: "POST", body: JSON.stringify({ learnerId: state.learnerId, sessionId: state.sessionId, ...payload }) });
    return true;
  } catch {
    return false;
  }
}

export async function postTransfer(state: LearnerSession, payload: Record<string, unknown>): Promise<unknown> {
  if (!hasWindow()) return undefined;
  try {
    const result = await request<{ assessment?: unknown }>("/api/transfer-attempts", { method: "POST", body: JSON.stringify({ learnerId: state.learnerId, sessionId: state.sessionId, ...payload }) });
    return result.assessment;
  } catch {
    return undefined;
  }
}
