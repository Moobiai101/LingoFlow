import { loadEnvironment, validateEnvironment } from "./env.mjs";

loadEnvironment();

if (!validateEnvironment()) {
  process.exit(1);
}

const { start } = await import("../dist/server/index.js");
await start();
