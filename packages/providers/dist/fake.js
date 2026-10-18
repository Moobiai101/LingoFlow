import { createPhraseReplayCacheKey } from "./cache.js";
function textValue(value) {
    return value?.trim() ?? "";
}
function fakeContext(input) {
    const { request, learner, objective, activeItem, topErrorPatterns = [], reviewItem } = input;
    const errors = [topErrorPatterns[0] ?? "", topErrorPatterns[1] ?? ""];
    return {
        sessionId: request.sessionId,
        learnerId: request.learnerId,
        modelId: "fake_voice_v1",
        dynamicVariables: {
            target_language: request.targetLanguage,
            native_language: request.nativeLanguage,
            learner_level: String(learner.level),
            current_objective: textValue(objective?.title),
            active_phrase: textValue(activeItem?.targetText),
            top_error_pattern_1: errors[0] ?? "",
            top_error_pattern_2: errors[1] ?? "",
            review_item: textValue(reviewItem?.id),
            tutor_personality: input.tutorPersonality ?? "patient mentor",
            roast_mode: input.roastMode ?? "off",
        },
        systemPrompt: "Offline fake tutor: use deterministic transcript events and clear correction feedback.",
    };
}
/** Deterministic voice adapter used by tests and the offline demo. */
export class FakeVoiceProvider {
    mode = "offline";
    contexts = [];
    replayRequests = [];
    createSessionContext(input) {
        const context = fakeContext(input);
        this.contexts.push(context);
        return context;
    }
    async replayPhrase(request) {
        this.replayRequests.push({ ...request });
        const cacheKey = createPhraseReplayCacheKey({ ...request, modelId: "fake_voice_v1" });
        const audio = new globalThis.TextEncoder().encode(`fake-audio:${request.language}:${request.text}`);
        return {
            cacheKey,
            audio,
            contentType: "audio/mock",
            modelId: "fake_voice_v1",
            durationMs: Math.max(250, request.text.length * 35),
        };
    }
}
/**
 * Offline pronunciation assessment intentionally reports no made-up score for
 * an uncertain attempt. Exact normalized matches are the only scored result.
 */
export class FakeAssessmentProvider {
    mode = "offline";
    requests = [];
    async assess(request) {
        this.requests.push({ ...request });
        const expected = request.expected.trim().toLocaleLowerCase();
        const observed = request.observed.trim().toLocaleLowerCase();
        const evaluatedAt = new Date().toISOString();
        if (!observed) {
            return {
                id: `fake-assessment:${request.id}`,
                requestId: request.id,
                learnerId: request.learnerId,
                sessionId: request.sessionId,
                itemId: request.itemId,
                expected: request.expected,
                observed: request.observed,
                status: "failed",
                confidence: 0,
                feedback: ["No spoken attempt was received."],
                evaluatedAt,
                language: request.language,
            };
        }
        if (expected === observed) {
            return {
                id: `fake-assessment:${request.id}`,
                requestId: request.id,
                learnerId: request.learnerId,
                sessionId: request.sessionId,
                itemId: request.itemId,
                expected: request.expected,
                observed: request.observed,
                status: "complete",
                confidence: 0.99,
                score: 1,
                feedback: ["Clear match."],
                evaluatedAt,
                language: request.language,
            };
        }
        return {
            id: `fake-assessment:${request.id}`,
            requestId: request.id,
            learnerId: request.learnerId,
            sessionId: request.sessionId,
            itemId: request.itemId,
            expected: request.expected,
            observed: request.observed,
            status: "uncertain",
            confidence: 0.55,
            feedback: ["The offline assessor could not confirm an exact match. Try once more."],
            evaluatedAt,
            language: request.language,
        };
    }
}
export const OfflineVoiceProvider = FakeVoiceProvider;
export const OfflineAssessmentProvider = FakeAssessmentProvider;
//# sourceMappingURL=fake.js.map