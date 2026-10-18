import type { PhraseReplayRequest } from "./ports.js";
/**
 * The cache key includes every input that changes synthesized audio. Keeping
 * this function pure makes cache behavior easy to test and avoids accidental
 * reuse after a phrase is edited.
 */
export declare function createPhraseReplayCacheKey(input: Pick<PhraseReplayRequest, "phraseId" | "voiceId" | "language" | "speed" | "contentVersion"> & {
    readonly modelId?: string;
}): string;
export declare const buildPhraseReplayCacheKey: typeof createPhraseReplayCacheKey;
export declare class PhraseReplayCache {
    private readonly entries;
    get(key: string): PhraseAudioValue | undefined;
    set(value: PhraseAudioValue): void;
    has(key: string): boolean;
    clear(): void;
}
export interface PhraseAudioValue {
    readonly cacheKey: string;
    readonly audio: Uint8Array;
    readonly contentType: string;
    readonly modelId: string;
    readonly durationMs?: number;
}
