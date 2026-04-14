import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAloopMetadataSection,
  ensureMetadataSection,
  buildPrBody,
  buildIssueLabels,
} from './issue-metadata.js';

describe('buildAloopMetadataSection', () => {
  it('returns empty string for empty metadata', () => {
    assert.equal(buildAloopMetadataSection({}), '');
  });

  it('includes wave when provided', () => {
    const result = buildAloopMetadataSection({ wave: 2 });
    assert.ok(result.includes('- Wave: 2'));
  });

  it('includes type when provided', () => {
    const result = buildAloopMetadataSection({ type: 'vertical-slice' });
    assert.ok(result.includes('- Type: vertical-slice'));
  });

  it('formats files as inline code', () => {
    const result = buildAloopMetadataSection({ files: ['src/foo.ts', 'src/bar.ts'] });
    assert.ok(result.includes('- Files: `src/foo.ts`, `src/bar.ts`'));
  });

  it('includes complexity', () => {
    const result = buildAloopMetadataSection({ complexity: 'L' });
    assert.ok(result.includes('- Complexity: L'));
  });

  it('formats dependencies as issue references', () => {
    const result = buildAloopMetadataSection({ depends_on: [10, 20] });
    assert.ok(result.includes('- Dependencies: #10, #20'));
  });

  it('includes child session', () => {
    const result = buildAloopMetadataSection({ child_session: 'session-123' });
    assert.ok(result.includes('- Session: `session-123`'));
  });

  it('includes labels', () => {
    const result = buildAloopMetadataSection({ labels: ['aloop/epic', 'component/cli'] });
    assert.ok(result.includes('- Labels: aloop/epic, component/cli'));
  });

  it('builds full section with all fields', () => {
    const result = buildAloopMetadataSection({
      wave: 1,
      type: 'epic',
      files: ['src/index.ts'],
      complexity: 'M',
      depends_on: [5],
      child_session: 'sess-abc',
      labels: ['aloop/epic'],
    });
    assert.ok(result.startsWith('## Aloop Metadata'));
    assert.ok(result.includes('- Wave: 1'));
    assert.ok(result.includes('- Type: epic'));
    assert.ok(result.includes('- Files: `src/index.ts`'));
    assert.ok(result.includes('- Complexity: M'));
    assert.ok(result.includes('- Dependencies: #5'));
    assert.ok(result.includes('- Session: `sess-abc`'));
    assert.ok(result.includes('- Labels: aloop/epic'));
  });

  it('omits empty arrays', () => {
    const result = buildAloopMetadataSection({ wave: 1, files: [], depends_on: [], labels: [] });
    assert.ok(!result.includes('Files:'));
    assert.ok(!result.includes('Dependencies:'));
    assert.ok(!result.includes('Labels:'));
    assert.ok(result.includes('- Wave: 1'));
  });
});

describe('ensureMetadataSection', () => {
  it('appends metadata to body without existing section', () => {
    const body = '## Scope\nSome scope description.';
    const result = ensureMetadataSection(body, { wave: 2 });
    assert.ok(result.includes('## Scope'));
    assert.ok(result.includes('## Aloop Metadata'));
    assert.ok(result.includes('- Wave: 2'));
  });

  it('replaces existing metadata section', () => {
    const body = '## Scope\nScope text.\n\n## Aloop Metadata\n- Wave: 1\n\n## Acceptance Criteria\n- [ ] Done';
    const result = ensureMetadataSection(body, { wave: 3 });
    assert.ok(result.includes('- Wave: 3'));
    assert.ok(!result.includes('- Wave: 1'));
    assert.ok(result.includes('## Acceptance Criteria'));
  });

  it('replaces metadata at end of file', () => {
    const body = '## Scope\nScope text.\n\n## Aloop Metadata\n- Wave: 1';
    const result = ensureMetadataSection(body, { wave: 5 });
    assert.ok(result.includes('- Wave: 5'));
    assert.ok(!result.includes('- Wave: 1'));
  });

  it('returns body unchanged when metadata is empty', () => {
    const body = '## Scope\nSome text.';
    const result = ensureMetadataSection(body, {});
    assert.equal(result, body);
  });
});

describe('buildPrBody', () => {
  it('includes issue reference', () => {
    const result = buildPrBody({ issue_number: 42, issue_title: 'Fix bug' });
    assert.ok(result.startsWith('Closes #42'));
  });

  it('includes scope when provided', () => {
    const result = buildPrBody({
      issue_number: 1,
      issue_title: 'Test',
      scope_summary: 'Added user registration flow',
    });
    assert.ok(result.includes('## Scope'));
    assert.ok(result.includes('Added user registration flow'));
  });

  it('includes metadata section when metadata present', () => {
    const result = buildPrBody({
      issue_number: 1,
      issue_title: 'Test',
      wave: 2,
      complexity: 'L',
      labels: ['aloop/epic'],
      file_hints: ['src/auth.ts'],
    });
    assert.ok(result.includes('## Aloop Metadata'));
    assert.ok(result.includes('- Wave: 2'));
    assert.ok(result.includes('- Complexity: L'));
    assert.ok(result.includes('- Labels: aloop/epic'));
    assert.ok(result.includes('- Files: `src/auth.ts`'));
  });

  it('includes verification section', () => {
    const result = buildPrBody({
      issue_number: 1,
      issue_title: 'Test',
      verification_notes: 'Tests pass, screenshots captured.',
    });
    assert.ok(result.includes('## Verification'));
    assert.ok(result.includes('Tests pass, screenshots captured.'));
  });

  it('uses default verification message when not provided', () => {
    const result = buildPrBody({ issue_number: 1, issue_title: 'Test' });
    assert.ok(result.includes('## Verification'));
    assert.ok(result.includes('Automated implementation'));
  });

  it('includes session reference', () => {
    const result = buildPrBody({
      issue_number: 1,
      issue_title: 'Test',
      child_session: 'sess-xyz',
    });
    assert.ok(result.includes('Session: `sess-xyz`'));
  });

  it('builds full PR body with all fields', () => {
    const result = buildPrBody({
      issue_number: 42,
      issue_title: 'User auth',
      wave: 1,
      complexity: 'M',
      labels: ['aloop/epic', 'component/cli'],
      child_session: 'sess-1',
      file_hints: ['src/auth.ts'],
      scope_summary: 'Added login endpoint.',
      verification_notes: 'All tests green.',
    });
    assert.ok(result.includes('Closes #42'));
    assert.ok(result.includes('## Scope'));
    assert.ok(result.includes('## Aloop Metadata'));
    assert.ok(result.includes('## Verification'));
    assert.ok(result.includes('Session: `sess-1`'));
  });

  it('omits metadata section when no metadata fields present', () => {
    const result = buildPrBody({ issue_number: 1, issue_title: 'Test' });
    assert.ok(!result.includes('## Aloop Metadata'));
    assert.ok(result.includes('## Verification'));
  });
});

describe('buildIssueLabels', () => {
  it('always includes aloop base label', () => {
    const result = buildIssueLabels({});
    assert.ok(result.includes('aloop'));
  });

  it('adds wave labels when wave provided', () => {
    const result = buildIssueLabels({ wave: 3 });
    assert.ok(result.includes('aloop/wave-3'));
    assert.ok(result.includes('wave/3'));
  });

  it('adds epic label when is_epic', () => {
    const result = buildIssueLabels({ is_epic: true });
    assert.ok(result.includes('aloop/epic'));
  });

  it('adds sub-issue label when is_sub_issue', () => {
    const result = buildIssueLabels({ is_sub_issue: true });
    assert.ok(result.includes('aloop/sub-issue'));
  });

  it('adds spec-question label when is_spec_question', () => {
    const result = buildIssueLabels({ is_spec_question: true });
    assert.ok(result.includes('aloop/spec-question'));
  });

  it('adds blocked label when is_blocked', () => {
    const result = buildIssueLabels({ is_blocked: true });
    assert.ok(result.includes('aloop/blocked-on-human'));
  });

  it('adds auto-resolved label when is_auto_resolved', () => {
    const result = buildIssueLabels({ is_auto_resolved: true });
    assert.ok(result.includes('aloop/auto-resolved'));
  });

  it('includes component labels', () => {
    const result = buildIssueLabels({ component_labels: ['component/cli', 'component/dashboard'] });
    assert.ok(result.includes('component/cli'));
    assert.ok(result.includes('component/dashboard'));
  });

  it('deduplicates labels', () => {
    const result = buildIssueLabels({ wave: 1, component_labels: ['aloop'] });
    const aloopCount = result.filter(l => l === 'aloop').length;
    assert.equal(aloopCount, 1);
  });

  it('builds full label set for epic', () => {
    const result = buildIssueLabels({
      wave: 2,
      is_epic: true,
      component_labels: ['component/orchestrator'],
    });
    assert.ok(result.includes('aloop'));
    assert.ok(result.includes('aloop/wave-2'));
    assert.ok(result.includes('wave/2'));
    assert.ok(result.includes('aloop/epic'));
    assert.ok(result.includes('component/orchestrator'));
    assert.equal(result.length, 5);
  });
});
