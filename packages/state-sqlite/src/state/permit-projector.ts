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
};

type PermitRemovalEvent = {
  permit_id: string;
};

export class PermitProjector implements Projector {
  readonly name = "permits";

  apply(db: Database, event: EventEnvelope): void {
    if (event.topic === "scheduler.permit.grant") {
      const data = event.data as PermitGrantEvent;
      projectGrantedPermit(db, {
        permitId: data.permit_id,
        sessionId: data.session_id,
        providerId: data.provider_id,
        ttlSeconds: data.ttl_seconds,
        grantedAt: data.granted_at,
        expiresAt: data.expires_at,
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
