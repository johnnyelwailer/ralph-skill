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
  const errors: string[] = [];

  test("returns default when value is undefined", () => {
    expect(stringField(undefined, "field.name", "default", errors)).toBe("default");
  });

  test("returns value when it is a non-empty string", () => {
    expect(stringField("hello", "field.name", "default", errors)).toBe("hello");
  });

  test("records error and returns default for non-string", () => {
    errors.length = 0;
    const result = stringField(42, "field.name", "default", errors);
    expect(result).toBe("default");
    expect(errors).toContain("field.name: must be a non-empty string");
  });

  test("records error and returns default for empty string", () => {
    errors.length = 0;
    const result = stringField("", "field.name", "default", errors);
    expect(result).toBe("default");
    expect(errors).toContain("field.name: must be a non-empty string");
  });

  test("records error with correct path", () => {
    errors.length = 0;
    stringField(123, "nested.field", "default", errors);
    expect(errors[0]).toStartWith("nested.field:");
  });
});

describe("boolField", () => {
  const errors: string[] = [];

  test("returns default when value is undefined", () => {
    expect(boolField(undefined, "field.name", true, errors)).toBe(true);
    expect(boolField(undefined, "field.name", false, errors)).toBe(false);
  });

  test("returns true when value is boolean true", () => {
    expect(boolField(true, "field.name", false, errors)).toBe(true);
  });

  test("returns false when value is boolean false", () => {
    expect(boolField(false, "field.name", true, errors)).toBe(false);
  });

  test("records error and returns default for non-boolean", () => {
    errors.length = 0;
    const result = boolField("yes", "field.name", false, errors);
    expect(result).toBe(false);
    expect(errors).toContain("field.name: must be a boolean");
  });

  test("records error for number zero", () => {
    errors.length = 0;
    const result = boolField(0, "field.name", true, errors);
    expect(result).toBe(true);
    expect(errors).toContain("field.name: must be a boolean");
  });

  test("records error for null", () => {
    errors.length = 0;
    const result = boolField(null, "field.name", false, errors);
    expect(result).toBe(false);
    expect(errors).toContain("field.name: must be a boolean");
  });
});

describe("posIntField", () => {
  const errors: string[] = [];

  test("returns default when value is undefined", () => {
    expect(posIntField(undefined, "field.name", 10, errors)).toBe(10);
  });

  test("returns value when it is a positive integer", () => {
    expect(posIntField(5, "field.name", 0, errors)).toBe(5);
    expect(posIntField(1, "field.name", 0, errors)).toBe(1);
    expect(posIntField(999999, "field.name", 0, errors)).toBe(999999);
  });

  test("records error and returns default for non-number", () => {
    errors.length = 0;
    const result = posIntField("5", "field.name", 0, errors);
    expect(result).toBe(0);
    expect(errors).toContain("field.name: must be a positive integer");
  });

  test("records error and returns default for zero", () => {
    errors.length = 0;
    const result = posIntField(0, "field.name", 99, errors);
    expect(result).toBe(99);
    expect(errors).toContain("field.name: must be a positive integer");
  });

  test("records error and returns default for negative integer", () => {
    errors.length = 0;
    const result = posIntField(-1, "field.name", 99, errors);
    expect(result).toBe(99);
    expect(errors).toContain("field.name: must be a positive integer");
  });

  test("records error and returns default for floating point number", () => {
    errors.length = 0;
    const result = posIntField(1.5, "field.name", 99, errors);
    expect(result).toBe(99);
    expect(errors).toContain("field.name: must be a positive integer");
  });

  test("records error and returns default for NaN", () => {
    errors.length = 0;
    const result = posIntField(NaN, "field.name", 99, errors);
    expect(result).toBe(99);
    expect(errors).toContain("field.name: must be a positive integer");
  });
});

describe("nonNegIntField", () => {
  const errors: string[] = [];

  test("returns default when value is undefined", () => {
    expect(nonNegIntField(undefined, "field.name", 10, errors)).toBe(10);
  });

  test("returns value when it is zero", () => {
    expect(nonNegIntField(0, "field.name", 99, errors)).toBe(0);
  });

  test("returns value when it is a positive integer", () => {
    expect(nonNegIntField(42, "field.name", 0, errors)).toBe(42);
  });

  test("records error and returns default for negative integer", () => {
    errors.length = 0;
    const result = nonNegIntField(-1, "field.name", 99, errors);
    expect(result).toBe(99);
    expect(errors).toContain("field.name: must be a non-negative integer");
  });

  test("records error and returns default for floating point", () => {
    errors.length = 0;
    // Note: YAML parses 1.0 as number 1 in JavaScript (IEEE 754 double — 1.0 === 1).
    // The yaml library normalizes it before the validator sees it, so the validator
    // correctly accepts it as a non-negative integer. This test verifies the
    // validator correctly rejects values that are genuinely non-integer floats.
    const result = nonNegIntField(1.5, "field.name", 99, errors);
    expect(result).toBe(99);
    expect(errors).toContain("field.name: must be a non-negative integer");
  });
});

describe("posNumField", () => {
  const errors: string[] = [];

  test("returns default when value is undefined", () => {
    expect(posNumField(undefined, "field.name", 1.5, errors)).toBe(1.5);
  });

  test("returns value when it is a positive finite number", () => {
    expect(posNumField(0.1, "field.name", 0, errors)).toBe(0.1);
    expect(posNumField(100, "field.name", 0, errors)).toBe(100);
  });

  test("records error and returns default for zero", () => {
    errors.length = 0;
    const result = posNumField(0, "field.name", 99, errors);
    expect(result).toBe(99);
    expect(errors).toContain("field.name: must be a positive number");
  });

  test("records error and returns default for negative number", () => {
    errors.length = 0;
    const result = posNumField(-5, "field.name", 99, errors);
    expect(result).toBe(99);
    expect(errors).toContain("field.name: must be a positive number");
  });

  test("records error and returns default for Infinity", () => {
    errors.length = 0;
    const result = posNumField(Infinity, "field.name", 99, errors);
    expect(result).toBe(99);
    expect(errors).toContain("field.name: must be a positive number");
  });

  test("records error and returns default for NaN", () => {
    errors.length = 0;
    const result = posNumField(NaN, "field.name", 99, errors);
    expect(result).toBe(99);
    expect(errors).toContain("field.name: must be a positive number");
  });
});

describe("pctField", () => {
  const errors: string[] = [];

  test("returns default when value is undefined", () => {
    expect(pctField(undefined, "field.name", 50, errors)).toBe(50);
  });

  test("returns value when within [0, 100] inclusive", () => {
    expect(pctField(0, "field.name", 99, errors)).toBe(0);
    expect(pctField(50, "field.name", 99, errors)).toBe(50);
    expect(pctField(100, "field.name", 99, errors)).toBe(100);
  });

  test("records error and returns default for negative", () => {
    errors.length = 0;
    const result = pctField(-1, "field.name", 99, errors);
    expect(result).toBe(99);
    expect(errors).toContain("field.name: must be a number in [0, 100]");
  });

  test("records error and returns default for value over 100", () => {
    errors.length = 0;
    const result = pctField(101, "field.name", 99, errors);
    expect(result).toBe(99);
    expect(errors).toContain("field.name: must be a number in [0, 100]");
  });
});

describe("portField", () => {
  const errors: string[] = [];

  test("returns default when value is undefined", () => {
    expect(portField(undefined, "field.name", 8080, errors)).toBe(8080);
  });

  test("returns 0 when value is null (auto-assign)", () => {
    expect(portField(null, "field.name", 8080, errors)).toBe(0);
  });

  test("returns value when it is a valid port number", () => {
    expect(portField(80, "field.name", 0, errors)).toBe(80);
    expect(portField(65535, "field.name", 0, errors)).toBe(65535);
  });

  test("records error and returns default for negative port", () => {
    errors.length = 0;
    const result = portField(-1, "field.name", 8080, errors);
    expect(result).toBe(8080);
    expect(errors).toContain("field.name: must be an integer in [0, 65535] or null");
  });

  test("records error and returns default for port > 65535", () => {
    errors.length = 0;
    const result = portField(65536, "field.name", 8080, errors);
    expect(result).toBe(8080);
    expect(errors).toContain("field.name: must be an integer in [0, 65535] or null");
  });

  test("records error and returns default for non-integer port", () => {
    errors.length = 0;
    const result = portField(8080.5, "field.name", 8080, errors);
    expect(result).toBe(8080);
    expect(errors).toContain("field.name: must be an integer in [0, 65535] or null");
  });

  test("records error and returns default for non-number", () => {
    errors.length = 0;
    const result = portField("8080", "field.name", 8080, errors);
    expect(result).toBe(8080);
    expect(errors).toContain("field.name: must be an integer in [0, 65535] or null");
  });
});

describe("durationField", () => {
  const errors: string[] = [];

  describe("numeric seconds", () => {
    test("returns default when value is undefined", () => {
      expect(durationField(undefined, "field.name", 30, errors)).toBe(30);
    });

    test("returns value when it is a non-negative integer", () => {
      expect(durationField(0, "field.name", 99, errors)).toBe(0);
      expect(durationField(60, "field.name", 99, errors)).toBe(60);
      expect(durationField(3600, "field.name", 99, errors)).toBe(3600);
    });

    test("records error and returns default for negative integer", () => {
      errors.length = 0;
      const result = durationField(-1, "field.name", 99, errors);
      expect(result).toBe(99);
      expect(errors).toContain("field.name: numeric duration must be a non-negative integer (seconds)");
    });

    test("records error and returns default for floating point", () => {
      errors.length = 0;
      const result = durationField(1.5, "field.name", 99, errors);
      expect(result).toBe(99);
      expect(errors).toContain("field.name: numeric duration must be a non-negative integer (seconds)");
    });
  });

  describe("string durations", () => {
    test("parses seconds suffix", () => {
      expect(durationField("30s", "field.name", 0, errors)).toBe(30);
      expect(durationField("0s", "field.name", 99, errors)).toBe(0);
      expect(durationField("3600s", "field.name", 0, errors)).toBe(3600);
    });

    test("parses minutes suffix", () => {
      expect(durationField("5m", "field.name", 0, errors)).toBe(300);
      expect(durationField("1m", "field.name", 0, errors)).toBe(60);
    });

    test("parses hours suffix", () => {
      expect(durationField("2h", "field.name", 0, errors)).toBe(7200);
      expect(durationField("1h", "field.name", 0, errors)).toBe(3600);
    });

    test("parses days suffix", () => {
      expect(durationField("1d", "field.name", 0, errors)).toBe(86400);
      expect(durationField("3d", "field.name", 0, errors)).toBe(259200);
    });

    test("parses unit-less string as seconds", () => {
      expect(durationField("45", "field.name", 0, errors)).toBe(45);
    });

    test("parses with leading/trailing whitespace", () => {
      expect(durationField("  30s  ", "field.name", 0, errors)).toBe(30);
    });

    test("records error and returns default for malformed string", () => {
      errors.length = 0;
      const result = durationField("1.5h", "field.name", 99, errors);
      expect(result).toBe(99);
      expect(errors).toContain("field.name: must be a duration string like \"30s\", \"5m\", \"2h\", or \"1d\"");
    });

    test("records error and returns default for non-duration string", () => {
      errors.length = 0;
      const result = durationField("fast", "field.name", 99, errors);
      expect(result).toBe(99);
      expect(errors).toContain("field.name: must be a duration string like \"30s\", \"5m\", \"2h\", or \"1d\"");
    });

    test("records error and returns default for empty string", () => {
      errors.length = 0;
      const result = durationField("", "field.name", 99, errors);
      expect(result).toBe(99);
      expect(errors).toContain("field.name: must be a duration string like \"30s\", \"5m\", \"2h\", or \"1d\"");
    });
  });

  describe("invalid types", () => {
    test("records error and returns default for non-string/non-number", () => {
      errors.length = 0;
      const result = durationField(true, "field.name", 99, errors);
      expect(result).toBe(99);
      expect(errors).toContain("field.name: must be a duration string or a non-negative integer (seconds)");
    });

    test("records error and returns default for array", () => {
      errors.length = 0;
      const result = durationField(["30s"], "field.name", 99, errors);
      expect(result).toBe(99);
      expect(errors).toContain("field.name: must be a duration string or a non-negative integer (seconds)");
    });
  });
});
