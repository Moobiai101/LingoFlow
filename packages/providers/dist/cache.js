/**
 * The cache key includes every input that changes synthesized audio. Keeping
 * this function pure makes cache behavior easy to test and avoids accidental
 * reuse after a phrase is edited.
 */
export function createPhraseReplayCacheKey(input) {
    const modelId = input.modelId ?? "eleven_v4";
    const speed = input.speed ?? 1;
    const fields = [input.phraseId, input.voiceId, modelId, input.language, String(speed), input.contentVersion];
    return `phrase-replay:${fields.map((value) => encodeURIComponent(value)).join(":")}`;
}
export const buildPhraseReplayCacheKey = createPhraseReplayCacheKey;
export class PhraseReplayCache {
    entries = new Map();
    get(key) {
        const value = this.entries.get(key);
        return value ? { ...value, audio: value.audio.slice() } : undefined;
    }
    set(value) {
        this.entries.set(value.cacheKey, { ...value, audio: value.audio.slice() });
    }
    has(key) {
        return this.entries.has(key);
    }
    clear() {
        this.entries.clear();
    }
}
//# sourceMappingURL=cache.js.map