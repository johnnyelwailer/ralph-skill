import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { getDirectorySizeBytes, pruneLargeV8CacheDir } from './process-requests.js';

describe('process-requests V8 cache helpers', () => {
  it('getDirectorySizeBytes sums nested file sizes', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'aloop-v8-size-'));
    try {
      await mkdir(path.join(root, 'nested'), { recursive: true });
      await writeFile(path.join(root, 'a.bin'), Buffer.alloc(1024));
      await writeFile(path.join(root, 'nested', 'b.bin'), Buffer.alloc(2048));

      const total = await getDirectorySizeBytes(root);
      assert.equal(total, 3072);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('pruneLargeV8CacheDir does not prune when below threshold', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'aloop-v8-small-'));
    try {
      await writeFile(path.join(root, 'cache.bin'), Buffer.alloc(2048));

      const result = await pruneLargeV8CacheDir(root, 10 * 1024);
      assert.equal(result.pruned, false);
      assert.equal(result.sizeBytes, 2048);
      assert.equal(existsSync(root), true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('pruneLargeV8CacheDir removes cache dir when above threshold', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'aloop-v8-large-'));
    try {
      await writeFile(path.join(root, 'cache.bin'), Buffer.alloc(4096));

      const result = await pruneLargeV8CacheDir(root, 1024);
      assert.equal(result.pruned, true);
      assert.equal(result.sizeBytes, 4096);
      assert.equal(existsSync(root), false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('pruneLargeV8CacheDir is a no-op when directory is missing', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'aloop-v8-missing-'));
    const missing = path.join(root, 'missing');
    try {
      const result = await pruneLargeV8CacheDir(missing, 1);
      assert.deepEqual(result, { sizeBytes: 0, pruned: false });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
