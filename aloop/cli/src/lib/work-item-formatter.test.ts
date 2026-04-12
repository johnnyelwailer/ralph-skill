import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatWorkItemHeader,
  formatWorkItemContext,
  sanitizePromptText,
  checkForForbiddenTokens,
} from './work-item-formatter.js';

describe('formatWorkItemHeader', () => {
  it('formats header with work item number and title', () => {
    const result = formatWorkItemHeader(42, 'Implement feature X');
    assert.equal(result, '## Work Item 42: Implement feature X');
  });

  it('does not include "Issue" or "#" prefix', () => {
    const result = formatWorkItemHeader(42, 'Test');
    assert.ok(!result.includes('Issue'));
    assert.ok(!result.match(/#\d+/));
  });
});

describe('formatWorkItemContext', () => {
  it('formats context with all fields', () => {
    const result = formatWorkItemContext(
      42,
      'Test Issue',
      'Body content',
      1,
      [1, 2, 3],
    );
    assert.ok(result.includes('## Work Item 42: Test Issue'));
    assert.ok(result.includes('Body content'));
    assert.ok(result.includes('**Wave:** 1'));
    assert.ok(result.includes('**Dependencies:** [1], [2], [3]'));
  });

  it('formats context with no dependencies', () => {
    const result = formatWorkItemContext(1, 'Test', 'Body', 2, []);
    assert.ok(result.includes('**Dependencies:** none'));
  });

  it('does not contain forbidden platform tokens', () => {
    const result = formatWorkItemContext(42, 'Test', 'Body', 1, [1, 2]);
    const forbidden = checkForForbiddenTokens(result);
    assert.equal(forbidden.length, 0, `Found forbidden tokens: ${forbidden.join(', ')}`);
  });
});

describe('sanitizePromptText', () => {
  it('replaces "GitHub" with work item', () => {
    const input = 'This is a GitHub issue tracker';
    const result = sanitizePromptText(input);
    assert.ok(!result.includes('GitHub'));
  });

  it('replaces "PR" with change request', () => {
    const input = 'Create a PR for this';
    const result = sanitizePromptText(input);
    assert.ok(!result.match(/\bPR\b/i));
  });

  it('replaces "pull request" with change request', () => {
    const input = 'This is a pull request';
    const result = sanitizePromptText(input);
    assert.ok(!result.match(/pull request/i));
  });

  it('replaces /issues/ URLs', () => {
    const input = 'See https://github.com/owner/repo/issues/123';
    const result = sanitizePromptText(input);
    assert.ok(!result.match(/\/issues\//i));
  });

  it('replaces /pull/ URLs', () => {
    const input = 'See https://github.com/owner/repo/pull/456';
    const result = sanitizePromptText(input);
    assert.ok(!result.match(/\/pull\//i));
  });

  it('replaces Issue #N patterns', () => {
    const input = 'This is Issue #42 that needs fixing';
    const result = sanitizePromptText(input);
    assert.ok(!result.match(/Issue #\d+/i));
  });
});

describe('checkForForbiddenTokens', () => {
  it('detects GitHub', () => {
    const result = checkForForbiddenTokens('This is GitHub');
    assert.ok(result.some(t => /github/i.test(t)));
  });

  it('detects PR', () => {
    const result = checkForForbiddenTokens('Create a PR');
    assert.ok(result.some(t => /\bpr\b/i.test(t)));
  });

  it('detects pull request', () => {
    const result = checkForForbiddenTokens('This is a pull request');
    assert.ok(result.some(t => /pull request/i.test(t)));
  });

  it('detects /issues/', () => {
    const result = checkForForbiddenTokens('See /issues/123');
    assert.ok(result.some(t => /\/issues\//i.test(t)));
  });

  it('detects /pull/', () => {
    const result = checkForForbiddenTokens('See /pull/456');
    assert.ok(result.some(t => /\/pull\//i.test(t)));
  });

  it('detects Issue #N patterns', () => {
    const result = checkForForbiddenTokens('Issue #42');
    assert.ok(result.some(t => /issue #\d+/i.test(t)));
  });

  it('returns empty for clean text', () => {
    const result = checkForForbiddenTokens('This is work item 42 for the feature');
    assert.equal(result.length, 0);
  });
});
