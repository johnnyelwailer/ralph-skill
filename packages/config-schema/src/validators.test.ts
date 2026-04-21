import { describe, expect, test } from "bun:test";
import {
  boolField,
  durationField,
  nonNegIntField,
  pctField,
  portField,
  posIntField,
  posNumField,
  stringField,
} from "./validators.ts";

describe("stringField", () => {
  test("returns default when value is undefined", () => {
    const errors: string[] = [];
    expect(stringField(undefined, "path.name", "default", errors)).toBe("default");
    expect(errors).toHaveLength(0);
  });

  test("returns value when valid non-empty string", () => {
    const errors: string[] = [];
    expect(stringField("hello", "path.name", "default", errors)).toBe("hello");
    expect(errors).toHaveLength(0);
  });

  test("records error and returns default for empty string", () => {
    const errors: string[] = [];
    expect(stringField("", "path.name", "default", errors)).toBe("default");
    expect(errors).toContain("path.name: must be a non-empty string");
  });

  test("records error and returns default for non-string value", () => {
    const errors: string[] = [];
    expect(stringField(42, "path.name", "default", errors)).toBe("default");
    expect(errors).toContain("path.name: must be a non-empty string");
  });

  test("records error only once per call (idempotent errors array)", () => {
    const e: string[] = [];
    stringField("", "a", "x", e);
    stringField("", "a", "x", e);
    expect(e.filter((s) => s === "a: must be a non-empty string")).toHaveLength(2);
  });
});

describe("boolField", () => {
  test("returns default when value is undefined", () => {
    const errors: string[] = [];
    expect(boolField(undefined, "path.name", true, errors)).toBe(true);
    expect(boolField(undefined, "path.name", false, errors)).toBe(false);
    expect(errors).toHaveLength(0);
  });

  test("returns value when boolean", () => {
    const errors: string[] = [];
    expect(boolField(true, "path.name", false, errors)).toBe(true);
    expect(boolField(false, "path.name", true, errors)).toBe(false);
    expect(errors).toHaveLength(0);
  });

  test("records error and returns default for non-boolean", () => {
    const errors: string[] = [];
    expect(boolField("yes" as unknown as boolean, "path.name", false, errors)).toBe(false);
    expect(boolField(1 as unknown as boolean, "path.name", false, errors)).toBe(false);
    expect(errors).toContain("path.name: must be a boolean");
  });
});

describe("posIntField", () => {
  test("returns default when value is undefined", () => {
    const errors: string[] = [];
    expect(posIntField(undefined, "path.name", 99, errors)).toBe(99);
    expect(errors).toHaveLength(0);
  });

  test("returns value when positive integer", () => {
    const errors: string[] = [];
    expect(posIntField(1, "path.name", 99, errors)).toBe(1);
    expect(posIntField(100, "path.name", 99, errors)).toBe(100);
    expect(errors).toHaveLength(0);
  });

  test("records error and returns default for zero", () => {
    const errors: string[] = [];
    expect(posIntField(0, "path.name", 99, errors)).toBe(99);
    expect(errors).toContain("path.name: must be a positive integer");
  });

  test("records error and returns default for negative", () => {
    const errors: string[] = [];
    expect(posIntField(-1, "path.name", 99, errors)).toBe(99);
    expect(errors).toContain("path.name: must be a positive integer");
  });

  test("records error and returns default for non-integer", () => {
    const errors: string[] = [];
    expect(posIntField(1.5, "path.name", 99, errors)).toBe(99);
    expect(errors).toContain("path.name: must be a positive integer");
  });

  test("records error and returns default for non-number", () => {
    const errors: string[] = [];
    expect(posIntField("5" as unknown as number, "path.name", 99, errors)).toBe(99);
    expect(errors).toContain("path.name: must be a positive integer");
  });
});

describe("nonNegIntField", () => {
  test("returns default when value is undefined", () => {
    const errors: string[] = [];
    expect(nonNegIntField(undefined, "path.name", 5, errors)).toBe(5);
    expect(errors).toHaveLength(0);
  });

  test("returns value when zero", () => {
    const errors: string[] = [];
    expect(nonNegIntField(0, "path.name", 99, errors)).toBe(0);
    expect(errors).toHaveLength(0);
  });

  test("returns value when positive integer", () => {
    const errors: string[] = [];
    expect(nonNegIntField(42, "path.name", 99, errors)).toBe(42);
    expect(errors).toHaveLength(0);
  });

  test("records error and returns default for negative", () => {
    const errors: string[] = [];
    expect(nonNegIntField(-1, "path.name", 99, errors)).toBe(99);
    expect(errors).toContain("path.name: must be a non-negative integer");
  });

  test("records error and returns default for non-integer", () => {
    const errors: string[] = [];
    expect(nonNegIntField(1.5, "path.name", 99, errors)).toBe(99);
    expect(errors).toContain("path.name: must be a non-negative integer");
  });
});

describe("posNumField", () => {
  test("returns default when value is undefined", () => {
    const errors: string[] = [];
    expect(posNumField(undefined, "path.name", 3.14, errors)).toBe(3.14);
    expect(errors).toHaveLength(0);
  });

  test("returns value when positive finite number", () => {
    const errors: string[] = [];
    expect(posNumField(0.1, "path.name", 99, errors)).toBe(0.1);
    expect(posNumField(1e10, "path.name", 99, errors)).toBe(1e10);
    expect(errors).toHaveLength(0);
  });

  test("records error and returns default for zero", () => {
    const errors: string[] = [];
    expect(posNumField(0, "path.name", 99, errors)).toBe(99);
    expect(errors).toContain("path.name: must be a positive number");
  });

  test("records error and returns default for negative", () => {
    const errors: string[] = [];
    expect(posNumField(-0.001, "path.name", 99, errors)).toBe(99);
    expect(errors).toContain("path.name: must be a positive number");
  });

  test("records error and returns default for Infinity", () => {
    const errors: string[] = [];
    expect(posNumField(Infinity, "path.name", 99, errors)).toBe(99);
    expect(errors).toContain("path.name: must be a positive number");
  });

  test("records error and returns default for NaN", () => {
    const errors: string[] = [];
    expect(posNumField(NaN, "path.name", 99, errors)).toBe(99);
    expect(errors).toContain("path.name: must be a positive number");
  });
});

describe("pctField", () => {
  test("returns default when value is undefined", () => {
    const errors: string[] = [];
    expect(pctField(undefined, "path.name", 50, errors)).toBe(50);
    expect(errors).toHaveLength(0);
  });

  test("returns value when in [0, 100]", () => {
    const errors: string[] = [];
    expect(pctField(0, "path.name", 99, errors)).toBe(0);
    expect(pctField(50, "path.name", 99, errors)).toBe(50);
    expect(pctField(100, "path.name", 99, errors)).toBe(100);
    expect(errors).toHaveLength(0);
  });

  test("records error and returns default for below 0", () => {
    const errors: string[] = [];
    expect(pctField(-0.1, "path.name", 99, errors)).toBe(99);
    expect(errors).toContain("path.name: must be a number in [0, 100]");
  });

  test("records error and returns default for above 100", () => {
    const errors: string[] = [];
    expect(pctField(100.1, "path.name", 99, errors)).toBe(99);
    expect(pctField(999, "path.name", 99, errors)).toBe(99);
    expect(errors).toContain("path.name: must be a number in [0, 100]");
  });

  test("records error and returns default for non-finite", () => {
    const errors: string[] = [];
    expect(pctField(NaN, "path.name", 99, errors)).toBe(99);
    expect(pctField(Infinity, "path.name", 99, errors)).toBe(99);
    expect(errors).toContain("path.name: must be a number in [0, 100]");
  });
});

describe("portField", () => {
  test("returns default when value is undefined", () => {
    const errors: string[] = [];
    expect(portField(undefined, "path.name", 8080, errors)).toBe(8080);
    expect(errors).toHaveLength(0);
  });

  test("returns 0 for explicit null (auto-assign)", () => {
    const errors: string[] = [];
    expect(portField(null, "path.name", 8080, errors)).toBe(0);
    expect(errors).toHaveLength(0);
  });

  test("returns value when valid port [0, 65535]", () => {
    const errors: string[] = [];
    expect(portField(0, "path.name", 8080, errors)).toBe(0);
    expect(portField(80, "path.name", 8080, errors)).toBe(80);
    expect(portField(65535, "path.name", 8080, errors)).toBe(65535);
    expect(errors).toHaveLength(0);
  });

  test("records error and returns default for negative", () => {
    const errors: string[] = [];
    expect(portField(-1, "path.name", 8080, errors)).toBe(8080);
    expect(errors).toContain("path.name: must be an integer in [0, 65535] or null");
  });

  test("records error and returns default for port > 65535", () => {
    const errors: string[] = [];
    expect(portField(65536, "path.name", 8080, errors)).toBe(8080);
    expect(portField(100000, "path.name", 8080, errors)).toBe(8080);
    expect(errors).toContain("path.name: must be an integer in [0, 65535] or null");
  });

  test("records error and returns default for non-integer", () => {
    const errors: string[] = [];
    expect(portField(80.5, "path.name", 8080, errors)).toBe(8080);
    expect(errors).toContain("path.name: must be an integer in [0, 65535] or null");
  });
});

describe("durationField", () => {
  test("returns default when value is undefined", () => {
    const errors: string[] = [];
    expect(durationField(undefined, "path.name", 300, errors)).toBe(300);
    expect(errors).toHaveLength(0);
  });

  test("returns value when raw non-negative integer (seconds)", () => {
    const errors: string[] = [];
    expect(durationField(0, "path.name", 99, errors)).toBe(0);
    expect(durationField(60, "path.name", 99, errors)).toBe(60);
    expect(durationField(3600, "path.name", 99, errors)).toBe(3600);
    expect(errors).toHaveLength(0);
  });

  test("records error and returns default for negative integer", () => {
    const errors: string[] = [];
    expect(durationField(-1, "path.name", 99, errors)).toBe(99);
    expect(errors).toContain("path.name: numeric duration must be a non-negative integer (seconds)");
  });

  test("records error and returns default for non-integer numeric", () => {
    const errors: string[] = [];
    expect(durationField(1.5, "path.name", 99, errors)).toBe(99);
    expect(errors).toContain("path.name: numeric duration must be a non-negative integer (seconds)");
  });

  test("parses 'Ns' duration strings", () => {
    const errors: string[] = [];
    expect(durationField("30s", "path.name", 99, errors)).toBe(30);
    expect(errors).toHaveLength(0);
    const errors2: string[] = [];
    expect(durationField("0s", "path.name", 99, errors2)).toBe(0);
    expect(errors2).toHaveLength(0);
  });

  test("parses 'Nm' duration strings (minutes)", () => {
    const errors: string[] = [];
    expect(durationField("5m", "path.name", 99, errors)).toBe(300);
    expect(durationField("1m", "path.name", 99, errors)).toBe(60);
    expect(errors).toHaveLength(0);
  });

  test("parses 'Nh' duration strings (hours)", () => {
    const errors: string[] = [];
    expect(durationField("2h", "path.name", 99, errors)).toBe(7200);
    expect(durationField("1h", "path.name", 99, errors)).toBe(3600);
    expect(errors).toHaveLength(0);
  });

  test("parses 'Nd' duration strings (days)", () => {
    const errors: string[] = [];
    expect(durationField("1d", "path.name", 99, errors)).toBe(86400);
    expect(durationField("3d", "path.name", 99, errors)).toBe(259200);
    expect(errors).toHaveLength(0);
  });

  test("treats bare number string as seconds", () => {
    const errors: string[] = [];
    expect(durationField("60", "path.name", 99, errors)).toBe(60);
    expect(errors).toHaveLength(0);
  });

  test("records error and returns default for malformed duration string", () => {
    const errors: string[] = [];
    expect(durationField("soon", "path.name", 99, errors)).toBe(99);
    expect(durationField("30min", "path.name", 99, errors)).toBe(99);
    expect(durationField("1w", "path.name", 99, errors)).toBe(99);
    expect(errors).toContain("path.name: must be a duration like \"30s\", \"5m\", \"2h\", or \"1d\"");
  });

  test("strips whitespace from duration string", () => {
    const errors: string[] = [];
    expect(durationField("  30s  ", "path.name", 99, errors)).toBe(30);
    expect(errors).toHaveLength(0);
  });

  test("records error and returns default for non-string non-number", () => {
    const errors: string[] = [];
    expect(durationField(true as unknown as string, "path.name", 99, errors)).toBe(99);
    expect(errors).toContain("path.name: must be a duration string or a non-negative integer (seconds)");
  });
});
