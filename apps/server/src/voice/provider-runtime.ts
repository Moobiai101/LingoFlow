import { createRequire } from "node:module";
import { resolve } from "node:path";
import type * as ProviderExports from "../../../../packages/providers/dist/index.js";

/** Resolve the provider package from the project root in both source and built server layouts. */
const require = createRequire(import.meta.url);
export const providers = require(resolve(process.cwd(), "packages/providers/dist/index.js")) as typeof ProviderExports;
