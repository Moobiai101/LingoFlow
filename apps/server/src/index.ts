import { createRequire } from "node:module";
import type FastifyFactory from "fastify";
import type { FastifyInstance } from "fastify";
import { registerApiRoutes } from "./http/routes.js";
import { registerPracticeRoutes } from "./http/practice-routes.js";
import { registerVoiceRoutes } from "./http/voice-routes.js";
import { SqliteRepository } from "./persistence/repository.js";
import { registerRequestObservability, type RequestMetrics } from "./observability/request-metrics.js";

// Fastify is CommonJS. Resolve it through createRequire so the built ESM
// server and the source test runner use the same constructor path.
const require = createRequire(import.meta.url);
const Fastify = require("fastify") as typeof FastifyFactory;

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "0.0.0.0";

export interface AppOptions {
  readonly repository?: SqliteRepository;
  readonly environment?: NodeJS.ProcessEnv;
  readonly now?: () => string;
}

export interface LingoFlowApp extends FastifyInstance {
  readonly repository: SqliteRepository;
  readonly metrics: RequestMetrics;
}

export function createApp(options: AppOptions = {}): LingoFlowApp {
  const environment = options.environment ?? process.env;
  const repository = options.repository ?? new SqliteRepository({ path: environment.LINGOFLOW_DB_PATH, now: options.now });
  const app = Fastify({ logger: false }) as unknown as LingoFlowApp;
  // Keep the exact JSON bytes available to signed provider webhooks. Every
  // normal API handler parses this string through bodyJson after validation.
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => {
    done(null, body);
  });
  Object.defineProperty(app, "repository", { value: repository, enumerable: false });
  Object.defineProperty(app, "metrics", { value: registerRequestObservability(app), enumerable: false });

  registerApiRoutes(app, {
    repository,
    environment,
    now: options.now,
  });
  registerVoiceRoutes(app, {
    repository,
    environment,
    now: options.now,
  });
  registerPracticeRoutes(app, {
    repository,
    now: options.now,
  });

  // Keep the foundation endpoint for existing clients while exposing the
  // versioned API health contract used by the application.
  app.get("/health", async () => ({
    status: "ok",
    mode: environment.LINGOFLOW_MODE ?? "offline",
  }));
  app.get("/", async () => ({
    name: "LingoFlow",
    status: "ready",
    mode: environment.LINGOFLOW_MODE ?? "offline",
  }));

  app.addHook("onClose", async () => {
    repository.close();
  });
  return app;
}

export const app = createApp();

export async function start(): Promise<void> {
  await app.listen({ host, port });
}
