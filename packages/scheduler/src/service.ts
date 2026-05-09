import { PermitRegistry, type EventWriter, type Permit } from "@aloop/state-sqlite";
import type {
  AcquirePermitInput,
  LimitsUpdateResult,
  PermitDecision,
  PermitOwner,
  SchedulerConfigView,
} from "./decisions.ts";
import type { SchedulerProbes } from "@aloop/scheduler-gates";
import { acquirePermitDecision } from "./acquire.ts";
import {
  appendPermitExpired,
  appendPermitRelease,
} from "./permit-events.ts";

export class SchedulerService {
  constructor(
    private readonly permits: PermitRegistry,
    private readonly config: SchedulerConfigView,
    private readonly events: EventWriter,
    private readonly probes: SchedulerProbes = {},
  ) {}

  listPermits(): Permit[] {
    return this.permits.list();
  }

  currentLimits() {
    return this.config.scheduler();
  }

  async updateLimits(rawPatch: Record<string, unknown>): Promise<LimitsUpdateResult> {
    return this.config.updateLimits(rawPatch);
  }

  async acquirePermit(input: AcquirePermitInput): Promise<PermitDecision> {
    return acquirePermitDecision({
      permits: this.permits,
      config: this.config,
      events: this.events,
      probes: this.probes,
    }, input);
  }

  async releasePermit(id: string): Promise<boolean> {
    const permit = this.permits.get(id);
    if (!permit) return false;
    await appendPermitRelease(this.events, {
      permitId: permit.id,
      owner: ownerFromPermit(permit),
    });
    return true;
  }

  async expirePermits(nowIso: string = new Date().toISOString()): Promise<number> {
    const expired = this.permits.listExpired(nowIso);
    for (const permit of expired) {
      await appendPermitExpired(this.events, {
        permitId: permit.id,
        owner: ownerFromPermit(permit),
      });
    }
    return expired.length;
  }

}

function ownerFromPermit(permit: Permit): PermitOwner {
  if (permit.sessionId) return { sessionId: permit.sessionId };
  if (permit.composerTurnId) return { composerTurnId: permit.composerTurnId };
  if (permit.controlSubagentRunId) return { controlSubagentRunId: permit.controlSubagentRunId };
  throw new Error(`permit has no owner: ${permit.id}`);
}
