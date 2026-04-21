#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const PACKAGES_DIR = join(ROOT, "packages");

const FILE_LOC_MAX = 150;
const CORE_LOC_MAX = 2000;
const EXTENSION_LOC_MAX = 800;

const packageDirs = readdirSync(PACKAGES_DIR)
  .map((name) => join(PACKAGES_DIR, name))
  .filter((dir) => statSync(dir).isDirectory())
  .filter((dir) => statSync(join(dir, "src")).isDirectory());

const packageStats = packageDirs.map((dir) => {
  const srcDir = join(dir, "src");
  const files = walkTsRuntimeFiles(srcDir);
  const totals = files.map((file) => ({ file, loc: countLines(readFileSync(file, "utf8")) }));
  return {
    name: relative(PACKAGES_DIR, dir),
    totals,
    totalLoc: totals.reduce((sum, entry) => sum + entry.loc, 0),
  };
});

const fileViolations = [];
const packageViolations = [];

for (const pkg of packageStats) {
  for (const entry of pkg.totals) {
    if (entry.loc > FILE_LOC_MAX) {
      fileViolations.push({
        path: relative(ROOT, entry.file),
        loc: entry.loc,
      });
    }
  }

  const max = pkg.name === "core" ? CORE_LOC_MAX : EXTENSION_LOC_MAX;
  if (pkg.totalLoc > max) {
    packageViolations.push({
      package: pkg.name,
      loc: pkg.totalLoc,
      max,
    });
  }
}

const sortedPackages = [...packageStats].sort((a, b) => a.name.localeCompare(b.name));
console.log("Constitution LOC summary (runtime .ts, excluding *.test.ts):");
for (const pkg of sortedPackages) {
  const max = pkg.name === "core" ? CORE_LOC_MAX : EXTENSION_LOC_MAX;
  console.log(`- ${pkg.name}: ${pkg.totalLoc} / ${max}`);
}

if (fileViolations.length === 0 && packageViolations.length === 0) {
  console.log("PASS: LOC limits satisfied.");
  process.exit(0);
}

if (packageViolations.length > 0) {
  console.error("\nPackage LOC violations:");
  for (const violation of packageViolations.sort((a, b) => a.package.localeCompare(b.package))) {
    console.error(`- packages/${violation.package}/src: ${violation.loc} > ${violation.max}`);
  }
}

if (fileViolations.length > 0) {
  console.error("\nFile LOC violations:");
  for (const violation of fileViolations.sort((a, b) => a.path.localeCompare(b.path))) {
    console.error(`- ${violation.path}: ${violation.loc} > ${FILE_LOC_MAX}`);
  }
}

process.exit(1);

function walkTsRuntimeFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTsRuntimeFiles(full));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".ts")) continue;
    if (entry.name.endsWith(".test.ts")) continue;
    out.push(full);
  }
  return out;
}

function countLines(text) {
  if (text.length === 0) return 0;
  return text.split(/\r?\n/).length;
}
