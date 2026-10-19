import { useConversation, type MessagePayload } from "@elevenlabs/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  connectVoice,
  postEvidence,
  type LearnerSession,
} from "./learner-state.js";
import { buildVoiceSessionOptions, isPlaceholderTranscript } from "./voice-session-options.js";

export { isPlaceholderTranscript } from "./voice-session-options.js";

/** The small lifecycle surface a conversation studio needs from live voice. */
export type LiveVoicePhase = "idle" | "connecting" | "connected" | "ending" | "text_fallback";

export type LiveVoiceMessage = MessagePayload;

export type LiveVoiceMessageHandler = (message: LiveVoiceMessage) => void;

export interface UseLiveVoiceOptions {
  /** Current learner/session context used to request a server-issued token. */
  readonly state: LearnerSession;
  /** Optional active phrase sent to the server as context for the tutor. */
  readonly itemId?: string;
  /** Receives meaningful SDK transcript messages; silence placeholders are omitted. */
  readonly onMessage?: LiveVoiceMessageHandler;
}

export interface LiveVoiceControls {
  /** LingoFlow lifecycle state, including an honest text-only fallback. */
  readonly phase: LiveVoicePhase;
  /** Raw ElevenLabs SDK status for integrations that need transport detail. */
  readonly status: "disconnected" | "connecting" | "connected" | "error";
  /** User-facing status text suitable for the studio action dock. */
  readonly notice: string;
  readonly isSpeaking: boolean;
  readonly isListening: boolean;
  /** Starts a token-backed WebRTC session (or the signed-URL fallback). */
  readonly start: () => Promise<boolean>;
  /** Ends a pending or active session. Safe to call more than once. */
  readonly end: () => Promise<void>;
  /** Starts when idle, and ends when connecting/connected. */
  readonly toggle: () => Promise<boolean>;
  /** Sends text only when the SDK still has an open session. */
  readonly sendText: (text: string) => boolean;
}

const DEFAULT_FALLBACK_NOTICE = "Live voice is unavailable. Continue with text practice.";
const CLOSED_SESSION_NOTICE = "The live voice session is closed. Continue with text practice or reconnect.";
const CONNECTING_NOTICE = "Preparing the live conversation line…";
const CONNECTED_NOTICE = "Live voice connected. Speak naturally; the tutor will keep the next correction small.";
const ENDED_NOTICE = "Voice session ended. Reconnect any time, or continue with text practice.";
const MAX_SEEN_MESSAGES = 240;

function errorText(error: unknown): string | undefined {
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return undefined;
}

function fallbackNotice(reason?: unknown): string {
  const detail = errorText(reason);
  if (!detail) return DEFAULT_FALLBACK_NOTICE;
  if (/continue with text practice/i.test(detail)) return detail;
  return `Live voice unavailable: ${detail}. Continue with text practice.`;
}

function messageKey(message: LiveVoiceMessage): string {
  return `${String(message.event_id)}:${message.role}:${message.source}`;
}

function recordVoiceEvidence(state: LearnerSession, message: LiveVoiceMessage): void {
  void postEvidence(state, {
    id: `evidence-voice-${state.sessionId}-${message.event_id}`,
    itemId: "conversation-small-win",
    skillId: "confidence",
    type: "attempted",
    expected: "Share a small win",
    observed: message.message,
    outcome: "uncertain",
    confidence: 0.5,
    source: "conversation",
    context: { surface: "live_voice_transcript" },
    createdAt: new Date().toISOString(),
  });
}

/**
 * Connect LingoFlow's server-issued voice authorization to ElevenLabs.
 *
 * The SDK owns getUserMedia, microphone capture, WebRTC transport, and
 * speaker playback. This hook only coordinates the server token request and
 * exposes lifecycle state to the visual shell. Provider failures are shown as
 * text practice rather than being presented as a successful voice session.
 */
export function useLiveVoice({ state, itemId = "phrase-could-i", onMessage }: UseLiveVoiceOptions): LiveVoiceControls {
  const conversation = useConversation({
    onConnect: () => {
      if (!mountedRef.current || endingRef.current) return;
      setPhaseSafe("connected");
      setNoticeSafe(CONNECTED_NOTICE);
    },
    onDisconnect: (details) => {
      if (!mountedRef.current || endingRef.current) return;
      if (details.reason === "error") {
        setFallbackSafe(details.message);
      } else {
        setPhaseSafe("idle");
        setNoticeSafe(ENDED_NOTICE);
      }
    },
    onError: (message) => {
      if (!mountedRef.current || endingRef.current) return;
      setFallbackSafe(message);
    },
    onMessage: (message) => {
      if (!mountedRef.current || isPlaceholderTranscript(message.message)) return;

      const key = messageKey(message);
      if (seenMessagesRef.current.has(key)) return;
      seenMessagesRef.current.add(key);
      while (seenMessagesRef.current.size > MAX_SEEN_MESSAGES) {
        const oldest = seenMessagesRef.current.values().next().value;
        if (typeof oldest !== "string") break;
        seenMessagesRef.current.delete(oldest);
      }

      onMessageRef.current?.(message);
      if (message.role === "user" || message.source === "user") {
        // Placeholder transcripts are rejected above, before this write path.
        recordVoiceEvidence(stateRef.current, message);
      }
    },
    onStatusChange: ({ status }) => {
      if (!mountedRef.current || endingRef.current) return;
      if (status === "connecting") setPhaseSafe("connecting");
      if (status === "connected") setPhaseSafe("connected");
    },
  });

  const [phaseState, setPhaseState] = useState<LiveVoicePhase>("idle");
  const [notice, setNotice] = useState("");
  const phaseRef = useRef<LiveVoicePhase>("idle");
  const statusRef = useRef(conversation.status);
  const mountedRef = useRef(true);
  const endingRef = useRef(false);
  const operationRef = useRef(0);
  const startPromiseRef = useRef<Promise<boolean> | null>(null);
  const endPromiseRef = useRef<Promise<void> | null>(null);
  const stateRef = useRef(state);
  const itemIdRef = useRef(itemId);
  const onMessageRef = useRef(onMessage);
  const seenMessagesRef = useRef<Set<string>>(new Set());

  // Keep callback data current without re-registering SDK listeners for every
  // render. `useConversation` itself also keeps callback references stable.
  stateRef.current = state;
  itemIdRef.current = itemId;
  onMessageRef.current = onMessage;
  statusRef.current = conversation.status;

  function setPhaseSafe(next: LiveVoicePhase): void {
    if (!mountedRef.current) return;
    phaseRef.current = next;
    setPhaseState(next);
  }

  function setNoticeSafe(next: string): void {
    if (mountedRef.current) setNotice(next);
  }

  function setFallbackSafe(reason?: unknown): void {
    if (!mountedRef.current) return;
    endingRef.current = false;
    setPhaseSafe("text_fallback");
    setNoticeSafe(fallbackNotice(reason));
  }

  const end = useCallback(async (): Promise<void> => {
    if (endPromiseRef.current) return endPromiseRef.current;

    const operation = ++operationRef.current;
    endingRef.current = true;
    if (mountedRef.current) {
      phaseRef.current = "ending";
      setPhaseState("ending");
    }

    const pendingStart = startPromiseRef.current;
    const endTask = (async () => {
      // Invalidating the operation before awaiting means a token response that
      // arrives during an end can never start a new SDK session.
      if (pendingStart) await pendingStart.catch(() => false);
      try {
        conversation.endSession();
      } catch {
        // Ending an already closed SDK session is a safe no-op for the shell.
      }
      if (mountedRef.current && operation === operationRef.current) {
        endingRef.current = false;
        setPhaseSafe("idle");
        setNoticeSafe(ENDED_NOTICE);
      }
    })();
    endPromiseRef.current = endTask;
    try {
      await endTask;
    } finally {
      if (endPromiseRef.current === endTask) endPromiseRef.current = null;
    }
  }, [conversation.endSession]);

  const start = useCallback(async (): Promise<boolean> => {
    if (!mountedRef.current) return false;
    if (phaseRef.current === "connected" && statusRef.current === "connected") return true;
    if (startPromiseRef.current) return startPromiseRef.current;
    if (endPromiseRef.current) await endPromiseRef.current;
    if (!mountedRef.current) return false;
    if (phaseRef.current === "connected" && statusRef.current === "connected") return true;

    const operation = ++operationRef.current;
    endingRef.current = false;
    setPhaseSafe("connecting");
    setNoticeSafe(CONNECTING_NOTICE);

    const startTask = (async () => {
      let result;
      try {
        result = await connectVoice(stateRef.current, itemIdRef.current);
      } catch (error) {
        if (operation === operationRef.current) setFallbackSafe(error);
        return false;
      }

      if (!mountedRef.current || operation !== operationRef.current || endingRef.current) return false;
      if (result.mode !== "live" || result.fallback) {
        setFallbackSafe(result.fallbackDetails?.message);
        return false;
      }

      try {
        conversation.startSession(buildVoiceSessionOptions({
          conversationToken: result.conversationToken,
          signedUrl: result.signedUrl,
          learnerId: stateRef.current.learnerId,
          dynamicVariables: result.context?.dynamicVariables,
        }));
        return true;
      } catch (error) {
        if (operation === operationRef.current) setFallbackSafe(error);
        return false;
      }
    })();

    startPromiseRef.current = startTask;
    try {
      return await startTask;
    } finally {
      if (startPromiseRef.current === startTask) startPromiseRef.current = null;
    }
  }, [conversation.startSession]);

  const toggle = useCallback(async (): Promise<boolean> => {
    if (phaseRef.current === "connected" || phaseRef.current === "connecting" || startPromiseRef.current) {
      await end();
      return false;
    }
    return start();
  }, [end, start]);

  const sendText = useCallback((text: string): boolean => {
    const message = text.trim();
    if (!message) return false;
    if (phaseRef.current !== "connected" || statusRef.current !== "connected") {
      setNoticeSafe(CLOSED_SESSION_NOTICE);
      return false;
    }
    try {
      conversation.sendUserMessage(message);
      return true;
    } catch {
      setFallbackSafe(CLOSED_SESSION_NOTICE);
      return false;
    }
  }, [conversation.sendUserMessage]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      ++operationRef.current;
      endingRef.current = true;
      try {
        conversation.endSession();
      } catch {
        // The SDK also cleans up from ConversationProvider; this is defensive
        // for a session that closed between render and unmount.
      }
    };
  }, [conversation.endSession]);

  useEffect(() => {
    if (conversation.status === "connected" && phaseRef.current !== "ending") setPhaseSafe("connected");
    if (conversation.status === "connecting" && phaseRef.current !== "ending") setPhaseSafe("connecting");
    if (conversation.status === "error" && phaseRef.current !== "ending") setFallbackSafe();
    if (conversation.status === "disconnected" && phaseRef.current === "connected") {
      setPhaseSafe("idle");
      setNoticeSafe(ENDED_NOTICE);
    }
  }, [conversation.status]);

  return {
    phase: phaseState,
    status: conversation.status,
    notice,
    isSpeaking: conversation.isSpeaking,
    isListening: conversation.isListening,
    start,
    end,
    toggle,
    sendText,
  };
}
