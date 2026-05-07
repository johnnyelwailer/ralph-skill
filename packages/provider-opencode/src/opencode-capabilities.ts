import type { Capabilities } from "@aloop/provider";

export const OPENCODE_CAPABILITIES: Capabilities = {
  streaming: true,
  vision: true,
  toolUse: true,
  reasoningEffort: true,
  quotaProbe: false,
  sessionResume: true,
  costReporting: true,
  maxContextTokens: null,
};