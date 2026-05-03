import { describe, expect, test } from "bun:test";
import { type IncubationItemFilter } from "@aloop/state-sqlite";
import { type SetupDeps } from "./setup-handlers.ts";

describe("combined import", () => {
  test("import both IncubationItemFilter and SetupDeps", () => {
    const deps: SetupDeps = { store: null as any, eventsDir: "" };
    expect(deps.eventsDir).toBe("");
  });
});
