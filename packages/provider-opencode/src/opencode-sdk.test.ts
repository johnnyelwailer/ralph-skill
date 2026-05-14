import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { __sdkTestHooks } from "./opencode-sdk";

const { addCachedServerForTest, cachedServerCount, resetCachedServers } = __sdkTestHooks;

describe("__sdkTestHooks", () => {
  beforeEach(async () => {
    await resetCachedServers();
  });

  afterEach(async () => {
    await resetCachedServers();
  });

  test("cachedServerCount returns 0 initially", () => {
    expect(cachedServerCount()).toBe(0);
  });

  test("addCachedServerForTest adds a server to the cache", () => {
    addCachedServerForTest("test-key-1", () => {});
    expect(cachedServerCount()).toBe(1);
  });

  test("addCachedServerForTest does not throw when adding multiple entries", () => {
    addCachedServerForTest("key-a", () => {});
    addCachedServerForTest("key-b", () => {});
    addCachedServerForTest("key-c", () => {});
    expect(cachedServerCount()).toBe(3);
  });

  test("resetCachedServers clears all cached servers", () => {
    addCachedServerForTest("key-1", () => {});
    addCachedServerForTest("key-2", () => {});
    expect(cachedServerCount()).toBe(2);

    resetCachedServers();

    expect(cachedServerCount()).toBe(0);
  });

  test("resetCachedServers tolerates being called when cache is empty", async () => {
    // Should not throw
    await resetCachedServers();
    expect(cachedServerCount()).toBe(0);
  });
});
