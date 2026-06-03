import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TrackerRegistry } from "./registry.ts";

describe("TrackerRegistry", () => {
  let root: string;
  let registry: TrackerRegistry;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "aloop-tracker-registry-"));
    registry = new TrackerRegistry({ trackersRoot: root });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("default tracker is builtin and adapter is created on demand", async () => {
    expect(registry.getTrackerId("p1")).toBe("builtin");
    const adapter = await registry.getAdapter("p1");
    expect(adapter.id).toBe("builtin");
    const expectedDir = join(root, "p1", ".aloop", "tracker");
    void mkdirSync(expectedDir, { recursive: true });
    expect(existsSync(expectedDir)).toBe(true);
  });

  test("getAdapter caches the adapter instance per project", async () => {
    const a = await registry.getAdapter("p1");
    const b = await registry.getAdapter("p1");
    expect(a).toBe(b);
  });

  test("separate projects get separate adapter instances and roots", async () => {
    const a = await registry.getAdapter("p1");
    const b = await registry.getAdapter("p2");
    expect(a).not.toBe(b);
    void mkdirSync(join(root, "p1", ".aloop", "tracker"), { recursive: true });
    void mkdirSync(join(root, "p2", ".aloop", "tracker"), { recursive: true });
    expect(existsSync(join(root, "p1", ".aloop", "tracker"))).toBe(true);
    expect(existsSync(join(root, "p2", ".aloop", "tracker"))).toBe(true);
  });

  test("setTrackerId rejects unknown tracker id", () => {
    expect(() => registry.setTrackerId("p1", "github")).toThrow(/Unknown tracker_id/);
  });

  test("setTrackerId drops the cached adapter so the new one is created on next get", async () => {
    const before = await registry.getAdapter("p1");
    expect(before.id).toBe("builtin");
    const customFactory = () => ({ id: "fake" } as unknown as Awaited<ReturnType<typeof registry.getAdapter>>);
    const r2 = new TrackerRegistry({ trackersRoot: root, factories: { fake: customFactory as never } });
    r2.setTrackerId("p1", "fake");
    const after = await r2.getAdapter("p1");
    expect(after.id).toBe("fake");
  });

  test("invalidate forces a fresh adapter on next getAdapter", async () => {
    const a = await registry.getAdapter("p1");
    registry.invalidate("p1");
    const b = await registry.getAdapter("p1");
    expect(a).not.toBe(b);
  });

  test("listSupported lists builtin plus any extra factories", () => {
    expect([...registry.listSupported()]).toEqual(["builtin"]);
    const r2 = new TrackerRegistry({
      trackersRoot: root,
      factories: { ghost: () => ({ id: "ghost" } as never) },
    });
    expect([...r2.listSupported()].sort()).toEqual(["builtin", "ghost"]);
  });
});
