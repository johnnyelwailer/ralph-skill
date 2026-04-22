import type { ProviderFailureClass } from "@aloop/provider";

export type QuotaProbeFailureHttp = {
  status: number;
  code: string;
};

export function quotaProbeFailureHttp(classification: ProviderFailureClass): QuotaProbeFailureHttp {
  switch (classification) {
    case "auth":
      return { status: 401, code: "provider_auth_failed" };
    case "rate_limit":
      return { status: 429, code: "provider_rate_limited" };
    case "timeout":
      return { status: 504, code: "provider_probe_timeout" };
    case "concurrent_cap":
      return { status: 409, code: "provider_concurrent_cap" };
    case "unknown":
      return { status: 502, code: "quota_probe_failed" };
  }
}
