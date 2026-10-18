import { providers } from "./provider-runtime.js";
import type { AssessmentProvider } from "../../../../packages/providers/dist/index.js";

/** Assessment stays deterministic offline until a credentialed assessment adapter is selected. */
export function createAssessmentProvider(): AssessmentProvider {
  return new providers.FakeAssessmentProvider();
}
