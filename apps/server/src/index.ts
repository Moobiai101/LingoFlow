import Fastify, { type FastifyInstance } from "fastify";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "0.0.0.0";
const mode = process.env.LINGOFLOW_MODE ?? "offline";

export const app: FastifyInstance = Fastify({ logger: false });

app.get("/health", async () => ({
  status: "ok",
  mode,
}));

app.get("/", async () => ({
  name: "LingoFlow",
  status: "ready",
  mode,
}));

export async function start(): Promise<void> {
  await app.listen({ host, port });
}
