import type { AssessmentResult, PronunciationAssessmentRequest } from "../../contracts/dist/index.js";
import type { AssessmentProvider, PhraseAudio, PhraseReplayRequest, VoiceProvider, VoiceSessionContext, VoiceSessionContextInput } from "./ports.js";
/** Deterministic voice adapter used by tests and the offline demo. */
export declare class FakeVoiceProvider implements VoiceProvider {
    readonly mode: "offline";
    readonly contexts: VoiceSessionContext[];
    readonly replayRequests: PhraseReplayRequest[];
    createSessionContext(input: VoiceSessionContextInput): VoiceSessionContext;
    replayPhrase(request: PhraseReplayRequest): Promise<PhraseAudio>;
}
/**
 * Offline pronunciation assessment intentionally reports no made-up score for
 * an uncertain attempt. Exact normalized matches are the only scored result.
 */
export declare class FakeAssessmentProvider implements AssessmentProvider {
    readonly mode: "offline";
    readonly requests: PronunciationAssessmentRequest[];
    assess(request: PronunciationAssessmentRequest): Promise<AssessmentResult>;
}
export declare const OfflineVoiceProvider: typeof FakeVoiceProvider;
export declare const OfflineAssessmentProvider: typeof FakeAssessmentProvider;
