import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadOverridesConfig,
  OVERRIDES_DEFAULT,
  parseOverridesConfig,
  saveOverridesConfig,
} from "./overrides.ts";

describe("parseOverridesConfig", () => {
  test("empty / null / undefined → all-null defaults", () => {
    expect(parseOverridesConfig(null)).toEqual({ ok: true, value: OVERRIDES_DEFAULT });
    expect(parseOverridesConfig(undefined)).toEqual({ ok: true, value: OVERRIDES_DEFAULT });
    expect(parseOverridesConfig({})).toEqual({ ok: true, value: OVERRIDES_DEFAULT });
  });

  test("allow whitelist parsed", () => {
    const r = parseOverridesConfig({ allow: ["opencode", "copilot"] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.allow).toEqual(["opencode", "copilot"]);
  });

  test("deny blacklist parsed", () => {
    const r = parseOverridesConfig({ deny: ["claude"] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.deny).toEqual(["claude"]);
  });

  test("force pinned to a single provider ref", () => {
    const r = parseOverridesConfig({ force: "claude/opus@4.7" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.force).toBe("claude/opus@4.7");
  });

  test("explicit nulls override defaults the same way", () => {
    const r = parseOverridesConfig({ allow: null, deny: null, force: null });
    expect(r).toEqual({ ok: true, value: OVERRIDES_DEFAULT });
  });

  test("rejects unknown top-level fields", () => {
    const r = parseOverridesConfig({ allow: ["opencode"], extra: 1 });
    expect(r.ok).toBe(false);
  });

  test("rejects non-mapping top level", () => {
    const r = parseOverridesConfig(["opencode"]);
    expect(r.ok).toBe(false);
  });

  test("rejects empty string in allow list", () => {
    const r = parseOverridesConfig({ allow: ["opencode", ""] });
    expect(r.ok).toBe(false);
  });

  test("rejects non-array allow value", () => {
    const r = parseOverridesConfig({ allow: "opencode" });
    expect(r.ok).toBe(false);
  });

  test("rejects empty force string", () => {
    const r = parseOverridesConfig({ force: "" });
    expect(r.ok).toBe(false);
  });

  test("collects multiple errors", () => {
    const r = parseOverridesConfig({ allow: 1, deny: ["", "claude"], force: 5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe("loadOverridesConfig", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-ovr-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns defaults when file does not exist", () => {
    const r = loadOverridesConfig(join(dir, "missing.yml"));
    expect(r).toEqual({ ok: true, value: OVERRIDES_DEFAULT });
  });

  test("returns an error when file contains malformed YAML", () => {
    const path = join(dir, "bad.yml");
    writeFileSync(path, "allow:\n  - opencode\n  nope: [");

    const r = loadOverridesConfig(path);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0]).toContain("yaml parse error");
    }
  });

  test("loads and parses an existing file", () => {
    const path = join(dir, "overrides.yml");
    writeFileSync(path, "allow:\n  - opencode\n  - copilot\nforce: claude/opus@4.7\n");
    const r = loadOverridesConfig(path);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.allow).toEqual(["opencode", "copilot"]);
      expect(r.value.force).toBe("claude/opus@4.7");
      expect(r.value.deny).toBeNull();
    }
  });
});

describe("saveOverridesConfig", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-ovr-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("roundtrip: save then load yields equivalent overrides", () => {
    const path = join(dir, "overrides.yml");
    const original = {
      allow: ["opencode", "copilot"] as readonly string[],
      deny: null,
      force: "claude/opus@4.7",
    };
    saveOverridesConfig(path, original);

    const r = loadOverridesConfig(path);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(original);
  });

  test("omits null fields from the YAML file (keep it readable)", () => {
    const path = join(dir, "overrides.yml");
    saveOverridesConfig(path, { allow: ["opencode"], deny: null, force: null });
    const text = readFileSync(path, "utf-8");
    expect(text).toContain("allow:");
    expect(text).not.toContain("deny:");
    expect(text).not.toContain("force:");
  });

  test("save with all-null produces an empty mapping (no fields)", () => {
    const path = join(dir, "overrides.yml");
    saveOverridesConfig(path, OVERRIDES_DEFAULT);
    const text = readFileSync(path, "utf-8");
    expect(text.trim()).toBe("{}");
  });
});
