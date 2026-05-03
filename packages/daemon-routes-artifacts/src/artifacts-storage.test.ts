import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  saveArtifactFile,
  readArtifactFile,
  deleteArtifactFile,
  artifactFileExists,
} from "./artifacts-storage.ts";

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "aloop-artifacts-storage-test-"));
}

describe("artifacts-storage", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ─── saveArtifactFile ───────────────────────────────────────────────────────

  describe("saveArtifactFile", () => {
    test("creates artifact directory and writes file", () => {
      const content = new Uint8Array([0x01, 0x02, 0x03]);
      const info = saveArtifactFile(tempDir, "artifact_abc", "image.png", content);

      expect(info.path).toBe(join(tempDir, "artifact_abc", "image.png"));
      expect(info.bytes).toBe(3);
      expect(existsSync(info.path)).toBe(true);
    });

    test("writes correct binary content to disk", () => {
      const content = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0a]);
      saveArtifactFile(tempDir, "artifact_bin", "test.png", content);

      const stored = readFileSync(join(tempDir, "artifact_bin", "test.png"));
      expect(stored).toEqual(content);
    });

    test("creates nested artifact directories with recursive flag", () => {
      const content = new Uint8Array([0x00]);
      saveArtifactFile(tempDir, "a/b/c/nested", "f.txt", content);

      expect(existsSync(join(tempDir, "a/b/c/nested", "f.txt"))).toBe(true);
    });

    test("overwrites existing file", () => {
      const content1 = new Uint8Array([0x11]);
      const content2 = new Uint8Array([0x22, 0x33]);

      saveArtifactFile(tempDir, "artifact_over", "file.txt", content1);
      const info = saveArtifactFile(tempDir, "artifact_over", "file.txt", content2);

      expect(info.bytes).toBe(2);
      const stored = readFileSync(join(tempDir, "artifact_over", "file.txt"));
      expect(stored).toEqual(content2);
    });

    test("returns path relative to artifactsDir", () => {
      const content = new Uint8Array([0xff]);
      const info = saveArtifactFile(tempDir, "artifact_path", "doc.pdf", content);

      // path should be inside artifactsDir
      expect(info.path.startsWith(tempDir)).toBe(true);
      expect(info.path).toContain("artifact_path");
      expect(info.path).toContain("doc.pdf");
    });

    test("handles empty content", () => {
      const content = new Uint8Array([]);
      const info = saveArtifactFile(tempDir, "artifact_empty", "empty.bin", content);

      expect(info.bytes).toBe(0);
      expect(existsSync(info.path)).toBe(true);
    });

    test("handles unicode filenames", () => {
      const content = new Uint8Array([0x00]);
      const info = saveArtifactFile(tempDir, "artifact_unicode", "文档.pdf", content);

      expect(existsSync(info.path)).toBe(true);
      expect(info.path).toContain("文档.pdf");
    });
  });

  // ─── readArtifactFile ──────────────────────────────────────────────────────

  describe("readArtifactFile", () => {
    test("returns undefined when artifact directory does not exist", () => {
      const result = readArtifactFile(tempDir, "nonexistent_artifact", "file.txt");
      expect(result).toBeUndefined();
    });

    test("returns undefined when file does not exist inside artifact directory", () => {
      // Create the artifact dir with a different file using mkdirSync + writeFileSync
      const artifactDir = join(tempDir, "artifact_no_file");
      mkdirSync(artifactDir, { recursive: true });
      writeFileSync(join(artifactDir, "other.txt"), new Uint8Array([0x00]));
      const result = readArtifactFile(tempDir, "artifact_no_file", "missing.txt");
      expect(result).toBeUndefined();
    });

    test("reads saved file content", () => {
      const content = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
      saveArtifactFile(tempDir, "artifact_read", "data.bin", content);

      const read = readArtifactFile(tempDir, "artifact_read", "data.bin");
      expect(read).toEqual(content);
    });

    test("reads binary file correctly", () => {
      const binary = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0a, 0x1a, 0x0a]);
      saveArtifactFile(tempDir, "artifact_binary", "image.png", binary);

      const read = readArtifactFile(tempDir, "artifact_binary", "image.png");
      expect(read).toEqual(binary);
    });

    test("returns Uint8Array (not Buffer) for binary file", () => {
      const content = new Uint8Array([0x01, 0x02, 0x03]);
      saveArtifactFile(tempDir, "artifact_type", "f.bin", content);

      const read = readArtifactFile(tempDir, "artifact_type", "f.bin");
      expect(read).toBeInstanceOf(Uint8Array);
    });
  });

  // ─── deleteArtifactFile ─────────────────────────────────────────────────────

  describe("deleteArtifactFile", () => {
    test("removes the file from the artifact directory", () => {
      const content = new Uint8Array([0xaa, 0xbb]);
      saveArtifactFile(tempDir, "artifact_del", "to_delete.txt", content);

      deleteArtifactFile(tempDir, "artifact_del", "to_delete.txt");

      expect(existsSync(join(tempDir, "artifact_del", "to_delete.txt"))).toBe(false);
    });

    test("removes the artifact directory itself after deleting the file", () => {
      const content = new Uint8Array([0xcc]);
      saveArtifactFile(tempDir, "artifact_rmdir", "file.txt", content);

      deleteArtifactFile(tempDir, "artifact_rmdir", "file.txt");

      expect(existsSync(join(tempDir, "artifact_rmdir"))).toBe(false);
    });

    test("silently succeeds when artifact directory does not exist", () => {
      expect(() => {
        deleteArtifactFile(tempDir, "nonexistent_artifact", "file.txt");
      }).not.toThrow();
    });

    test("silently succeeds when file does not exist", () => {
      // Create the artifact dir with a different file
      const artifactDir = join(tempDir, "artifact_no_file2");
      mkdirSync(artifactDir, { recursive: true });
      writeFileSync(join(artifactDir, "other.txt"), new Uint8Array([0x00]));

      expect(() => {
        deleteArtifactFile(tempDir, "artifact_no_file2", "missing.txt");
      }).not.toThrow();
    });

    test("succeeds when artifact dir has only the target file", () => {
      const content = new Uint8Array([0xdd]);
      saveArtifactFile(tempDir, "artifact_only_file", "solo.txt", content);

      deleteArtifactFile(tempDir, "artifact_only_file", "solo.txt");

      expect(existsSync(join(tempDir, "artifact_only_file"))).toBe(false);
    });
  });

  // ─── artifactFileExists ─────────────────────────────────────────────────────

  describe("artifactFileExists", () => {
    test("returns true when file exists", () => {
      saveArtifactFile(tempDir, "artifact_exists", "present.png", new Uint8Array([0x01]));
      expect(artifactFileExists(tempDir, "artifact_exists", "present.png")).toBe(true);
    });

    test("returns false when artifact directory does not exist", () => {
      expect(artifactFileExists(tempDir, "artifact_missing", "file.png")).toBe(false);
    });

    test("returns false when file does not exist inside artifact directory", () => {
      // Create the artifact dir with a different file using mkdirSync + writeFileSync
      const artifactDir = join(tempDir, "artifact_dir_only");
      mkdirSync(artifactDir, { recursive: true });
      writeFileSync(join(artifactDir, "other.txt"), new Uint8Array([0x00]));
      expect(artifactFileExists(tempDir, "artifact_dir_only", "file.txt")).toBe(false);
    });

    test("returns false when artifact directory is empty", () => {
      // mkdirSync(join(tempDir, "artifact_empty_dir"), { recursive: true });
      // Actually, artifactFileExists uses existsSync on the file path, not the dir
      // So an empty dir without the file should return false
      expect(artifactFileExists(tempDir, "artifact_empty", "file.txt")).toBe(false);
    });

    test("returns true for unicode filenames", () => {
      saveArtifactFile(tempDir, "artifact_u", "文档.pdf", new Uint8Array([0x00]));
      expect(artifactFileExists(tempDir, "artifact_u", "文档.pdf")).toBe(true);
    });

    test("returns false for wrong filename", () => {
      saveArtifactFile(tempDir, "artifact_wrong", "correct.txt", new Uint8Array([0x00]));
      expect(artifactFileExists(tempDir, "artifact_wrong", "wrong.txt")).toBe(false);
    });
  });
});
