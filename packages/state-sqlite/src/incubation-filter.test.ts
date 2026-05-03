import { describe, expect, test } from "bun:test";
import { type IncubationItemFilter } from "@aloop/state-sqlite";

describe("IncubationItemFilter import", () => {
  test("can import IncubationItemFilter from state-sqlite", () => {
    const filter: IncubationItemFilter = {};
    expect(filter).toBeDefined();
  });
});
