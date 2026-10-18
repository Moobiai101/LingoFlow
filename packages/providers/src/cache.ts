import type { PhraseReplayRequest } from "./ports.js";

/**
 * The cache key includes every input that changes synthesized audio. Keeping
 * this function pure makes cache behavior easy to test and avoids accidental
 * reuse after a phrase is edited.
 */
export function createPhraseReplayCacheKey(input: Pick<PhraseReplayRequest, "phraseId" | "voiceId" | "language" | "speed" | "contentVersion"> & { readonly modelId?: string }): string {
  const modelId = input.modelId ?? "eleven_v4";
  const speed = input.speed ?? 1;
  const fields = [input.phraseId, input.voiceId, modelId, input.language, String(speed), input.contentVersion];
  return `phrase-replay:${fields.map((value) => encodeURIComponent(value)).join(":")}`;
}

export const buildPhraseReplayCacheKey = createPhraseReplayCacheKey;

export class PhraseReplayCache {
  private readonly entries = new Map<string, PhraseAudioValue>();

  public get(key: string): PhraseAudioValue | undefined {
    const value = this.entries.get(key);
    return value ? { ...value, audio: value.audio.slice() } : undefined;
  }

  public set(value: PhraseAudioValue): void {
    this.entries.set(value.cacheKey, { ...value, audio: value.audio.slice() });
  }

  public has(key: string): boolean {
    return this.entries.has(key);
  }

  public clear(): void {
    this.entries.clear();
  }
}

export interface PhraseAudioValue {
  readonly cacheKey: string;
  readonly audio: Uint8Array;
  readonly contentType: string;
  readonly modelId: string;
  readonly durationMs?: number;
}
