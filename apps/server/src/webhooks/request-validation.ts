import { createHmac, timingSafeEqual } from "node:crypto";
import { IdempotencyStore } from "./idempotency.js";

type HeaderValue = string | undefined;
export type RequestHeaders = Readonly<Record<string, HeaderValue>> | Headers;

export interface SignedRequest {
  readonly rawBody: string | Uint8Array;
  readonly headers: RequestHeaders;
  readonly idempotencyKey?: string;
}

export interface WebhookValidationOptions {
  readonly secret?: string;
  readonly now?: () => number;
  readonly toleranceMs?: number;
  readonly idempotency?: IdempotencyStore;
}

export type WebhookValidationResult =
  | { readonly ok: true; readonly duplicate: boolean; readonly requestId: string }
  | { readonly ok: false; readonly reason: "missing_secret" | "missing_signature" | "invalid_signature" | "stale_signature" | "missing_idempotency_key"; readonly statusCode: 400 | 401 | 409 };

function header(headers: RequestHeaders, name: string): HeaderValue {
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  const wanted = name.toLowerCase();
  const found = Object.entries(headers).find(([key]) => key.toLowerCase() === wanted);
  return found?.[1];
}

function bodyText(rawBody: string | Uint8Array): string {
  return typeof rawBody === "string" ? rawBody : new TextDecoder().decode(rawBody);
}

function constantTimeHexEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createWebhookSignature(rawBody: string | Uint8Array, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const digest = createHmac("sha256", secret).update(`${timestamp}.${bodyText(rawBody)}`).digest("hex");
  return `t=${timestamp},v0=${digest}`;
}

export function verifyWebhookSignature(rawBody: string | Uint8Array, signatureHeader: string | undefined, secret: string, now = Date.now(), toleranceMs = 5 * 60_000): boolean {
  if (!signatureHeader || !secret) return false;
  const parts = new Map(signatureHeader.split(",").map((part) => {
    const [key, ...rest] = part.trim().split("=");
    return [key ?? "", rest.join("=")];
  }));
  const timestamp = parts.get("t");
  const signature = parts.get("v0") ?? parts.get("sha256") ?? (parts.size === 1 ? signatureHeader.trim() : undefined);
  if (!signature) return false;
  if (timestamp) {
    const timestampMs = Number(timestamp) * 1000;
    if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > toleranceMs) return false;
    const expected = createHmac("sha256", secret).update(`${timestamp}.${bodyText(rawBody)}`).digest("hex");
    return constantTimeHexEqual(signature.replace(/^sha256=/, ""), expected);
  }
  const expected = createHmac("sha256", secret).update(bodyText(rawBody)).digest("hex");
  return constantTimeHexEqual(signature.replace(/^sha256=/, ""), expected);
}

/** Validate an ElevenLabs-style signed webhook and atomically claim its delivery id. */
export function validateWebhookRequest(request: SignedRequest, options: WebhookValidationOptions): WebhookValidationResult {
  if (!options.secret?.trim()) return { ok: false, reason: "missing_secret", statusCode: 401 };
  const signature = header(request.headers, "elevenlabs-signature") ?? header(request.headers, "x-elevenlabs-signature") ?? header(request.headers, "x-signature");
  if (!signature) return { ok: false, reason: "missing_signature", statusCode: 401 };
  const now = options.now?.() ?? Date.now();
  if (!verifyWebhookSignature(request.rawBody, signature, options.secret, now, options.toleranceMs ?? 5 * 60_000)) {
    const parsedTimestamp = signature.match(/(?:^|,)\s*t=(\d+)/)?.[1];
    const stale = parsedTimestamp !== undefined && Math.abs(now - Number(parsedTimestamp) * 1000) > (options.toleranceMs ?? 5 * 60_000);
    return { ok: false, reason: stale ? "stale_signature" : "invalid_signature", statusCode: 401 };
  }
  const requestId = request.idempotencyKey ?? header(request.headers, "idempotency-key") ?? header(request.headers, "x-request-id");
  if (!requestId?.trim()) return { ok: false, reason: "missing_idempotency_key", statusCode: 400 };
  const accepted = options.idempotency?.claim(requestId, now) ?? true;
  return { ok: true, duplicate: !accepted, requestId };
}

export interface ToolRequest {
  readonly toolName: string;
  readonly requestId: string;
  readonly learnerId: string;
  readonly sessionId: string;
  readonly args?: Readonly<Record<string, unknown>>;
}

export interface ToolValidationOptions {
  readonly allowedTools?: readonly string[];
  readonly expectedLearnerId?: string;
  readonly expectedSessionId?: string;
  readonly idempotency?: IdempotencyStore;
}

export type ToolValidationResult =
  | { readonly ok: true; readonly duplicate: boolean; readonly request: ToolRequest }
  | { readonly ok: false; readonly reason: "invalid_request" | "unknown_tool" | "learner_mismatch" | "session_mismatch" | "duplicate_request"; readonly statusCode: 400 | 403 | 409 };

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Validate agent tool calls before they can mutate learner state. */
export function validateToolRequest(request: unknown, options: ToolValidationOptions = {}): ToolValidationResult {
  if (typeof request !== "object" || request === null) return { ok: false, reason: "invalid_request", statusCode: 400 };
  const candidate = request as Partial<ToolRequest>;
  if (!nonEmpty(candidate.toolName) || !nonEmpty(candidate.requestId) || !nonEmpty(candidate.learnerId) || !nonEmpty(candidate.sessionId)) {
    return { ok: false, reason: "invalid_request", statusCode: 400 };
  }
  const allowed = options.allowedTools ?? ["get_current_objective", "get_phrase_details", "record_learning_evidence", "request_phrase_practice", "mark_transfer_result"];
  if (!allowed.includes(candidate.toolName)) return { ok: false, reason: "unknown_tool", statusCode: 403 };
  if (options.expectedLearnerId && candidate.learnerId !== options.expectedLearnerId) return { ok: false, reason: "learner_mismatch", statusCode: 403 };
  if (options.expectedSessionId && candidate.sessionId !== options.expectedSessionId) return { ok: false, reason: "session_mismatch", statusCode: 403 };
  if (candidate.args !== undefined && (typeof candidate.args !== "object" || candidate.args === null || Array.isArray(candidate.args))) {
    return { ok: false, reason: "invalid_request", statusCode: 400 };
  }
  const requestId = candidate.requestId;
  const accepted = options.idempotency?.claim(requestId) ?? true;
  return { ok: true, duplicate: !accepted, request: { ...candidate, toolName: candidate.toolName, requestId, learnerId: candidate.learnerId, sessionId: candidate.sessionId } };
}

export const validateAuthenticatedToolRequest = validateToolRequest;
