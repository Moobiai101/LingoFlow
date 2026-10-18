import { loadEnvironment, validateEnvironment } from "./env.mjs";

loadEnvironment();

if (!validateEnvironment()) {
  process.exitCode = 1;
}
