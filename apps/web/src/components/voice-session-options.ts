export type VoiceSessionOptionsInput = {
  /** A short-lived token for the preferred WebRTC connection. */
  readonly conversationToken?: string;
  /** Legacy short-lived authorization for the WebSocket connection. */
  readonly signedUrl?: string;
  readonly learnerId: string;
  readonly dynamicVariables?: Readonly<Record<string, string>>;
};

export type VoiceSessionOptions = {
  readonly userId: string;
  readonly dynamicVariables?: Record<string, string>;
} & ({
  readonly conversationToken: string;
  readonly connectionType: "webrtc";
} | {
  readonly signedUrl: string;
  readonly connectionType: "websocket";
});

function isNonEmpty(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Empty and ellipsis-only provider transcripts are silence, not evidence. */
export function isPlaceholderTranscript(value: unknown): boolean {
  if (typeof value !== "string") return true;
  const transcript = value.trim();
  return transcript.length === 0 || /^[.\u2026\s]+$/u.test(transcript);
}

/**
 * Build the browser SDK options accepted by the configured ElevenLabs Agent.
 *
 * WebRTC conversation tokens are preferred because they are the production
 * browser transport. A signed URL is retained only as a compatibility path
 * for servers that have not started issuing tokens yet. The Agent owns its
 * prompt, so this helper deliberately sends dynamic variables only and never
 * adds an `overrides.agent.prompt` value.
 */
export function buildVoiceSessionOptions(input: VoiceSessionOptionsInput): VoiceSessionOptions {
  const context = input.dynamicVariables === undefined
    ? {}
    : { dynamicVariables: { ...input.dynamicVariables } };

  if (isNonEmpty(input.conversationToken)) {
    return {
      conversationToken: input.conversationToken,
      connectionType: "webrtc",
      userId: input.learnerId,
      ...context,
    };
  }

  if (isNonEmpty(input.signedUrl)) {
    return {
      signedUrl: input.signedUrl,
      connectionType: "websocket",
      userId: input.learnerId,
      ...context,
    };
  }

  throw new Error("Live voice requires a conversation token or signed URL");
}
