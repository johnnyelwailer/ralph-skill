import { describe, expect, test } from "bun:test";
import { SetupStore } from "./setup-store.ts";

describe("minimal", () => {
  test("store creates", () => {
    const store = new SetupStore({ stateDir: "/tmp/test-store" });
    expect(store).toBeDefined();
  });
});
