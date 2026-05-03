import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SetupStore } from "./setup-store.ts";
import { listSetupRuns } from "./setup-handlers.ts";

describe("minimal", () => {
  test("store creates", () => {
    const tmp = mkdtempSync(join(tmpdir(), "aloop-minimal4-"));
    try {
      const store = new SetupStore({ stateDir: join(tmp, "state") });
      expect(store).toBeDefined();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
