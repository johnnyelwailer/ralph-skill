import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync, rmSync } from "node:fs";
import { join } from "node:path";

export type ArtifactFileInfo = {
  readonly path: string;
  readonly bytes: number;
};

export function saveArtifactFile(
  artifactsDir: string,
  artifactId: string,
  filename: string,
  content: Uint8Array,
): ArtifactFileInfo {
  const artifactDir = join(artifactsDir, artifactId);
  mkdirSync(artifactDir, { recursive: true });
  const filePath = join(artifactDir, filename);
  writeFileSync(filePath, content);
  return { path: filePath, bytes: content.byteLength };
}

export function readArtifactFile(
  artifactsDir: string,
  artifactId: string,
  filename: string,
): Uint8Array | undefined {
  const filePath = join(artifactsDir, artifactId, filename);
  if (!existsSync(filePath)) return undefined;
  return readFileSync(filePath);
}

export function deleteArtifactFile(
  artifactsDir: string,
  artifactId: string,
  filename: string,
): void {
  const filePath = join(artifactsDir, artifactId, filename);
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
  const artifactDir = join(artifactsDir, artifactId);
  rmSync(artifactDir, { recursive: true, force: true });
}

export function artifactFileExists(
  artifactsDir: string,
  artifactId: string,
  filename: string,
): boolean {
  return existsSync(join(artifactsDir, artifactId, filename));
}