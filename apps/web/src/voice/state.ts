import type { NormalizedVoiceEvent, VoiceSessionState } from "../../../../packages/contracts/dist/index.js";

export interface VoiceUiState {
  readonly state: VoiceSessionState;
  readonly lastEventId?: string;
  readonly transcript: readonly { readonly speaker: "learner" | "tutor"; readonly text: string }[];
  readonly error?: string;
}

export const initialVoiceUiState: VoiceUiState = {
  state: "idle",
  transcript: [],
};

export function reduceVoiceUiState(current: VoiceUiState, event: NormalizedVoiceEvent): VoiceUiState {
  if (current.lastEventId === event.id) return current;
  const transcript = event.type === "learner_turn" && event.text
    ? [...current.transcript, { speaker: "learner" as const, text: event.text }]
    : event.type === "tutor_turn" && event.text
      ? [...current.transcript, { speaker: "tutor" as const, text: event.text }]
      : current.transcript;
  return {
    state: event.state ?? stateForEvent(event, current.state),
    lastEventId: event.id,
    transcript,
    error: event.type === "provider_error" ? event.text ?? "Voice provider error" : current.error,
  };
}

function stateForEvent(event: NormalizedVoiceEvent, fallback: VoiceSessionState): VoiceSessionState {
  if (event.type === "session_started") return "listening";
  if (event.type === "learner_turn") return "learner_speaking";
  if (event.type === "tutor_turn") return "tutor_speaking";
  if (event.type === "interrupted") return "interrupted";
  if (event.type === "session_ended") return "session_complete";
  return fallback;
}

export function createVoiceEventHandler(
  dispatch: (state: VoiceUiState) => void,
  initialState: VoiceUiState = initialVoiceUiState,
): (event: NormalizedVoiceEvent) => VoiceUiState {
  let state = initialState;
  return (event) => {
    state = reduceVoiceUiState(state, event);
    dispatch(state);
    return state;
  };
}
