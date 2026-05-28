/**
 * Tests for artifacts-storage.ts — pure filesystem utilities for artifact persistence.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  saveArtifactFile,
  readArtifactFile,
  deleteArtifactFile,
  artifactFileExists,
} from "./artifacts-storage";

function withTempDir(fn: (dir: string) => void): void {
  const dir = `/tmp/aloop-artifact-storage-test-${crypto.randomUUID().slice(0, 8)}`;
  mkdirSync(dir, { recursive: true });
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("saveArtifactFile", () => {
  test("creates artifact subdirectory and writes file", () => {
    withTempDir((dir) => {
      const info = saveArtifactFile(dir, "artifact_abc", "report.txt", new TextEncoder().encode("hello world"));
      expect(info.path).toBe(join(dir, "artifact_abc", "report.txt"));
      expect(info.bytes).toBe(11);
      expect(existsSync(info.path)).toBe(true);
    });
  });

  test("returns correct byte length", () => {
    withTempDir((dir) => {
      const content = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
      const info = saveArtifactFile(dir, "art_1", "data.bin", content);
      expect(info.bytes).toBe(4);
    });
  });

  test("overwrites existing file in same artifact dir", () => {
    withTempDir((dir) => {
      const content1 = new TextEncoder().encode("v1");
      const content2 = new TextEncoder().encode("v2");
      saveArtifactFile(dir, "art_overwrite", "file.txt", content1);
      const info = saveArtifactFile(dir, "art_overwrite", "file.txt", content2);
      expect(info.bytes).toBe(2);
      expect(readArtifactFile(dir, "art_overwrite", "file.txt")).toEqual(new TextEncoder().encode("v2"));
    });
  });

  test("handles binary content correctly", () => {
    withTempDir((dir) => {
      const binary = new Uint8Array([0xff, 0x00, 0xfe, 0x0d, 0x0a]);
      const info = saveArtifactFile(dir, "art_binary", "raw.bin", binary);
      expect(info.bytes).toBe(5);
      expect(readArtifactFile(dir, "art_binary", "raw.bin")).toEqual(binary);
    });
  });
});

describe("readArtifactFile", () => {
  test("returns undefined when artifact dir does not exist", () => {
    withTempDir((dir) => {
      const result = readArtifactFile(dir, "nonexistent_artifact", "file.txt");
      expect(result).toBeUndefined();
    });
  });

  test("returns undefined when file does not exist in artifact dir", () => {
    withTempDir((dir) => {
      mkdirSync(join(dir, "art_exists"), { recursive: true });
      const result = readArtifactFile(dir, "art_exists", "missing.txt");
      expect(result).toBeUndefined();
    });
  });

  test("reads file content correctly", () => {
    withTempDir((dir) => {
      const content = new TextEncoder().encode("file contents here");
      saveArtifactFile(dir, "art_read", "myfile.txt", content);
      const result = readArtifactFile(dir, "art_read", "myfile.txt");
      expect(result).toEqual(content);
    });
  });

  test("reads binary file correctly", () => {
    withTempDir((dir) => {
      const binary = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
      saveArtifactFile(dir, "art_bin", "data.bin", binary);
      const result = readArtifactFile(dir, "art_bin", "data.bin");
      expect(result).toEqual(binary);
    });
  });

  test("handles empty file", () => {
    withTempDir((dir) => {
      saveArtifactFile(dir, "art_empty", "empty.txt", new Uint8Array(0));
      const result = readArtifactFile(dir, "art_empty", "empty.txt");
      expect(result).toEqual(new Uint8Array(0));
      expect(result?.byteLength).toBe(0);
    });
  });
});

describe("deleteArtifactFile", () => {
  test("removes file and artifact directory", () => {
    withTempDir((dir) => {
      saveArtifactFile(dir, "art_del", "file.txt", new TextEncoder().encode("to be deleted"));
      expect(existsSync(join(dir, "art_del", "file.txt"))).toBe(true);
      deleteArtifactFile(dir, "art_del", "file.txt");
      expect(existsSync(join(dir, "art_del", "file.txt"))).toBe(false);
      expect(existsSync(join(dir, "art_del"))).toBe(false);
    });
  });

  test("does not throw when file does not exist", () => {
    withTempDir((dir) => {
      expect(() => deleteArtifactFile(dir, "art_nonexistent", "missing.txt")).not.toThrow();
    });
  });

  test("does not throw when artifact dir does not exist", () => {
    withTempDir((dir) => {
      expect(() => deleteArtifactFile(dir, "nonexistent_art", "file.txt")).not.toThrow();
    });
  });

  test("deleting any file removes the entire artifact directory", () => {
    // The implementation uses rmSync(artifactDir, { recursive: true, force: true })
    // after removing the file, so the entire artifact directory is always deleted.
    withTempDir((dir) => {
      saveArtifactFile(dir, "art_del_all", "keep.txt", new TextEncoder().encode("keep"));
      saveArtifactFile(dir, "art_del_all", "delete.txt", new TextEncoder().encode("delete"));
      deleteArtifactFile(dir, "art_del_all", "delete.txt");
      // Both files are gone because the entire artifact directory is removed
      expect(existsSync(join(dir, "art_del_all", "keep.txt"))).toBe(false);
      expect(existsSync(join(dir, "art_del_all", "delete.txt"))).toBe(false);
      expect(existsSync(join(dir, "art_del_all"))).toBe(false);
    });
  });
});

describe("artifactFileExists", () => {
  test("returns false when artifact dir does not exist", () => {
    withTempDir((dir) => {
      expect(artifactFileExists(dir, "nonexistent", "file.txt")).toBe(false);
    });
  });

  test("returns false when file does not exist", () => {
    withTempDir((dir) => {
      mkdirSync(join(dir, "art_no_file"), { recursive: true });
      expect(artifactFileExists(dir, "art_no_file", "missing.txt")).toBe(false);
    });
  });

  test("returns true when file exists", () => {
    withTempDir((dir) => {
      saveArtifactFile(dir, "art_exists_check", "present.txt", new TextEncoder().encode("hello"));
      expect(artifactFileExists(dir, "art_exists_check", "present.txt")).toBe(true);
    });
  });

  test("returns false for file in wrong artifact dir", () => {
    withTempDir((dir) => {
      saveArtifactFile(dir, "art_a", "file.txt", new TextEncoder().encode("in art_a"));
      expect(artifactFileExists(dir, "art_b", "file.txt")).toBe(false);
    });
  });
});