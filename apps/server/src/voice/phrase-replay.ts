import { providers } from "./provider-runtime.js";
import type { PhraseAudio, PhraseReplayRequest } from "../../../../packages/providers/dist/index.js";

export interface PhraseReplayService {
  replayPhrase(request: PhraseReplayRequest): Promise<PhraseAudio>;
}

export function createPhraseReplayService(environment: NodeJS.ProcessEnv = process.env): PhraseReplayService {
  if ((environment.LINGOFLOW_MODE ?? "offline") !== "live") return new providers.FakeVoiceProvider();
  return new providers.ElevenLabsPhraseReplayProvider({
    mode: "live",
    apiKey: environment.ELEVENLABS_API_KEY,
    voiceId: environment.ELEVENLABS_VOICE_ID,
    baseUrl: environment.ELEVENLABS_BASE_URL,
  });
}
