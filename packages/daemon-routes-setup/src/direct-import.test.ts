import { describe, expect, test } from "bun:test";
import { parseJsonBody } from "@aloop/daemon-routes";

describe("parseJsonBody import test", () => {
  test("can import parseJsonBody from daemon-routes", () => {
    expect(typeof parseJsonBody).toBe("function");
  });
});
