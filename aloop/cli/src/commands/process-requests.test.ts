import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAgentReviewResult,
  parseReviewVerdictFromOutput,
} from './process-requests.js';

describe('normalizeAgentReviewResult', () => {
  it('parses valid review result with inline comments and filters malformed comment entries', () => {
    const parsed = normalizeAgentReviewResult({
      pr_number: 999,
      verdict: 'request-changes',
      summary: 'Two fixes required.',
      comments: [
        {
          path: 'src/file.ts',
          line: 42,
          end_line: 44,
          body: 'Replace this block.',
          suggestion: 'const x = 1;',
        },
        {
          path: 'src/invalid.ts',
          line: 0,
          body: 'invalid line should be dropped',
        },
      ],
    }, 123);

    assert.deepStrictEqual(parsed, {
      pr_number: 123,
      verdict: 'request-changes',
      summary: 'Two fixes required.',
      comments: [
        {
          path: 'src/file.ts',
          line: 42,
          end_line: 44,
          body: 'Replace this block.',
          suggestion: 'const x = 1;',
        },
      ],
    });
  });

  it('parses valid review result without inline comments', () => {
    const parsed = normalizeAgentReviewResult({
      pr_number: 77,
      verdict: 'approve',
      summary: 'Looks good.',
    }, 88);

    assert.deepStrictEqual(parsed, {
      pr_number: 88,
      verdict: 'approve',
      summary: 'Looks good.',
    });
  });

  it('returns null for malformed review schema', () => {
    assert.equal(normalizeAgentReviewResult({
      verdict: 'approve',
      comments: [],
    }, 1), null);
    assert.equal(normalizeAgentReviewResult({
      verdict: 'unsupported',
      summary: 'nope',
    }, 1), null);
  });
});

describe('parseReviewVerdictFromOutput', () => {
  it('extracts fallback verdict and summary from plain text output', () => {
    const parsed = parseReviewVerdictFromOutput(
      'Review for PR #101\n**Verdict: request-changes**\nSummary: tighten null checks.',
      101,
    );
    assert.deepStrictEqual(parsed, {
      pr_number: 101,
      verdict: 'request-changes',
      summary: 'tighten null checks.',
    });
  });

  it('returns null when output does not mention the target PR number', () => {
    const parsed = parseReviewVerdictFromOutput(
      '**Verdict: approve**\nSummary: all good.',
      202,
    );
    assert.equal(parsed, null);
  });
});
