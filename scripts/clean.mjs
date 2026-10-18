import { rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await rm("apps/server/tsconfig.tsbuildinfo", { force: true });
await rm("apps/web/tsconfig.tsbuildinfo", { force: true });
