import type { Database } from "bun:sqlite";
import type { EventEnvelope } from "@aloop/core";
import type { Projector } from "./projector.ts";
import { projectGrantedPermit, projectPermitRemoval } from "./permits.ts";

type PermitGrantEvent = {
  permit_id: string;
  session_id: string;
  provider_id: string;
  ttl_seconds: number;
  granted_at: string;
  expires_at: string;
  /** Estimated USD cents for this permit's turn. */
  estimated_cost_usd_cents?: number;
};

type PermitRemovalEvent = {
  permit_id: string;
};

export class PermitProjector implements Projector {
  readonly name = "permits";

  apply(db: Database, event: EventEnvelope): void {
    if (event.topic === "scheduler.permit.grant") {
      const data = event.data as PermitGrantEvent;
      const metadata = event.metadata as Record<string, unknown> | undefined;
      projectGrantedPermit(db, {
        permitId: data.permit_id,
        sessionId: data.session_id,
        projectId: (metadata?.project_id as string | undefined) ?? null,
        providerId: data.provider_id,
        ttlSeconds: data.ttl_seconds,
        grantedAt: data.granted_at,
        expiresAt: data.expires_at,
        estimatedCostUsdCents: data.estimated_cost_usd_cents,
      });
      return;
    }

    if (
      event.topic === "scheduler.permit.release" ||
      event.topic === "scheduler.permit.expired"
    ) {
      projectPermitRemoval(db, (event.data as PermitRemovalEvent).permit_id);
    }
  }
}
