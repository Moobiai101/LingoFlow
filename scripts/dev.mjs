import { spawn } from "node:child_process";
import { loadEnvironment, validateEnvironment } from "./env.mjs";

loadEnvironment();

if (!validateEnvironment()) {
  process.exit(1);
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const children = [
  spawn(npm, ["run", "dev:server"], { env: process.env, stdio: "inherit" }),
  spawn(npm, ["run", "dev:web"], { env: process.env, stdio: "inherit" }),
];
let shuttingDown = false;

function stop() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill("SIGTERM");
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

await new Promise((resolve) => {
  for (const child of children) {
    child.on("exit", (code, signal) => {
      if (!shuttingDown && (code ?? 0) !== 0) {
        stop();
        process.exitCode = code ?? 1;
      }
      if (signal) process.exitCode = 1;
      resolve();
    });
  }
});
