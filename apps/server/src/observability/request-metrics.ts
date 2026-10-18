import type { FastifyInstance } from "fastify";

export interface RequestMetric {
  readonly method: string;
  readonly url: string;
  readonly statusCode: number;
  readonly durationMs: number;
}

/** Small in-process metrics sink for health/debugging without external services. */
export class RequestMetrics {
  private readonly entries: RequestMetric[] = [];
  private readonly maxEntries: number;

  public constructor(maxEntries = 500) {
    this.maxEntries = maxEntries;
  }

  public record(metric: RequestMetric): void {
    this.entries.push(metric);
    while (this.entries.length > this.maxEntries) this.entries.shift();
  }

  public snapshot(): readonly RequestMetric[] {
    return this.entries.slice();
  }
}

export function registerRequestObservability(app: FastifyInstance, metrics = new RequestMetrics()): RequestMetrics {
  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
    (request as typeof request & { lingoflowStartedAt?: number }).lingoflowStartedAt = Date.now();
  });
  app.addHook("onResponse", async (request, reply) => {
    const startedAt = (request as typeof request & { readonly lingoflowStartedAt?: number }).lingoflowStartedAt ?? Date.now();
    metrics.record({
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      durationMs: Math.max(0, Date.now() - startedAt),
    });
  });
  return metrics;
}
