import { PermitRegistry, type EventWriter, type Permit } from "@aloop/state-sqlite";
import type {
  AcquirePermitInput,
  LimitsUpdateResult,
  PermitDecision,
  SchedulerConfigView,
} from "./decisions.ts";
import type { SchedulerProbes } from "./probes.ts";
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
      sessionId: permit.sessionId,
    });
    return true;
  }

  async expirePermits(nowIso: string = new Date().toISOString()): Promise<number> {
    const expired = this.permits.listExpired(nowIso);
    for (const permit of expired) {
      await appendPermitExpired(this.events, {
        permitId: permit.id,
        sessionId: permit.sessionId,
      });
    }
    return expired.length;
  }

}
