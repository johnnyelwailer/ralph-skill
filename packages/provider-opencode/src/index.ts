export {
  __testHooks,
  createOpencodeAdapter,
} from "./opencode.ts";
export type {
  CreateOpencodeAdapterOptions,
  OpencodeRunInput,
  OpencodeRunResult,
  OpencodeRunTurn,
} from "./opencode-types.ts";
export { classifyOpencodeFailure, type ClassifiedFailure } from "./opencode-classify.ts";
