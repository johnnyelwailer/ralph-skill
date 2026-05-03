import { describe, expect, test } from "bun:test";
import { SetupStore } from "./setup-store.ts";
import { listSetupRuns } from "./setup-handlers.ts";

describe("minimal", () => {
  test("store creates", () => {
    const store = new SetupStore({ stateDir: "/tmp/test-store" });
    expect(store).toBeDefined();
  });
});
