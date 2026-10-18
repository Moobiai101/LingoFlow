import { existsSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnvironment() {
  const envPath = resolve(process.cwd(), ".env");

  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

export function validateEnvironment() {
  const mode = process.env.LINGOFLOW_MODE ?? "offline";

  if (mode !== "offline" && mode !== "live") {
    console.error(
      `Invalid LINGOFLOW_MODE=${mode}. Use LINGOFLOW_MODE=offline or LINGOFLOW_MODE=live.`,
    );
    return false;
  }

  if (mode === "live" && !process.env.ELEVENLABS_API_KEY) {
    console.error(
      "Missing ELEVENLABS_API_KEY for live mode. Set it in .env or use LINGOFLOW_MODE=offline.",
    );
    return false;
  }

  if (mode === "offline") {
    console.log("LingoFlow offline mode enabled; live provider credentials are not required.");
  }

  return true;
}
