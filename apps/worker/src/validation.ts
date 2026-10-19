export class WorkerInputError extends Error {
  public readonly code = "INVALID_INPUT";

  public constructor(message: string) {
    super(message);
    this.name = "WorkerInputError";
  }
}

export type JsonRecord = Record<string, unknown>;

export function asRecord(value: unknown): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new WorkerInputError("Request body must be a JSON object");
  }
  return value as JsonRecord;
}

export function optionalRecord(value: unknown): JsonRecord | undefined {
  if (value === undefined) return undefined;
  return asRecord(value);
}

export function requiredString(record: JsonRecord, key: string, maxLength = 500): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new WorkerInputError(`${key} must be a non-empty string`);
  }
  if (value.length > maxLength) throw new WorkerInputError(`${key} is too long`);
  return value.trim();
}

export function optionalString(record: JsonRecord, key: string, maxLength = 500): string | undefined {
  const value = record[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new WorkerInputError(`${key} must be a non-empty string when provided`);
  }
  if (value.length > maxLength) throw new WorkerInputError(`${key} is too long`);
  return value.trim();
}

export function requiredBoolean(record: JsonRecord, key: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") throw new WorkerInputError(`${key} must be a boolean`);
  return value;
}

export function booleanValue(record: JsonRecord, key: string, fallback = false): boolean {
  const value = record[key];
  if (value === undefined) return fallback;
  return requiredBoolean(record, key);
}

export function numberValue(record: JsonRecord, key: string, fallback?: number): number {
  const value = record[key];
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new WorkerInputError(`${key} must be a finite number`);
  }
  return value;
}

export function enumValue<T extends string>(record: JsonRecord, key: string, allowed: readonly T[], fallback?: T): T {
  const value = record[key];
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new WorkerInputError(`${key} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

export function isoDateValue(record: JsonRecord, key: string, fallback?: string): string {
  const value = optionalString(record, key, 80) ?? fallback;
  if (!value || Number.isNaN(Date.parse(value))) throw new WorkerInputError(`${key} must be an ISO date-time`);
  return new Date(value).toISOString();
}

export function stringArray(record: JsonRecord, key: string): readonly string[] {
  const value = record[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw new WorkerInputError(`${key} must be an array of strings`);
  }
  return value.map((item) => (item as string).trim());
}

export async function bodyRecord(request: Request): Promise<JsonRecord> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new WorkerInputError("Request body must be valid JSON");
  }
  return asRecord(value);
}

export function pathId(request: Request, name: string): string {
  const value = new URL(request.url).pathname.split("/").at(-1);
  if (!value) throw new WorkerInputError(`${name} must be a non-empty string`);
  return decodeURIComponent(value);
}
