export { createOpencodeAdapter, type CreateOpencodeAdapterOptions } from "./opencode.ts";
export { classifyOpencodeFailure, type ClassifiedFailure } from "./opencode-classify.ts";
export {
  runOpencodeCli,
  sanitizeProviderEnvironment,
  type OpencodeRunInput,
  type OpencodeRunResult,
  type OpencodeRunTurn,
} from "./opencode-runner.ts";
