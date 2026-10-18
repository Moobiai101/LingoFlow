import { providers } from "./provider-runtime.js";

export const ELEVENLABS_AGENT_MODEL = providers.ELEVENLABS_AGENT_MODEL;
export const buildElevenLabsSessionContext = providers.buildElevenLabsSessionContext;
export const createElevenLabsSessionContext = providers.createElevenLabsSessionContext;
export type {
  ElevenLabsAgentContext,
  VoiceSessionContext,
  VoiceSessionContextInput,
} from "../../../../packages/providers/dist/index.js";
