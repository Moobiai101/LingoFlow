export type VoiceSessionOptionsInput = {
  readonly signedUrl: string;
  readonly learnerId: string;
  readonly dynamicVariables?: Readonly<Record<string, string>>;
};

/**
 * Build the browser SDK options accepted by the configured ElevenLabs Agent.
 *
 * The Agent does not allow prompt overrides, so the browser must not send the
 * server-generated system prompt as `overrides.agent.prompt`. Learner context
 * is carried through the supported dynamic variables instead.
 */
export function buildVoiceSessionOptions(input: VoiceSessionOptionsInput): {
  readonly signedUrl: string;
  readonly connectionType: "websocket";
  readonly userId: string;
  readonly dynamicVariables?: Readonly<Record<string, string>>;
} {
  return {
    signedUrl: input.signedUrl,
    connectionType: "websocket",
    userId: input.learnerId,
    ...(input.dynamicVariables ? { dynamicVariables: input.dynamicVariables } : {}),
  };
}
