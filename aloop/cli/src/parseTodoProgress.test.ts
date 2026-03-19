import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseTodoProgress } from './lib/parseTodoProgress.js';

describe('parseTodoProgress', () => {
  test('returns zero counts for empty string', () => {
    const result = parseTodoProgress('');
    assert.deepStrictEqual(result, { completed: 0, total: 0 });
  });

  test('returns zero counts for content with no tasks', () => {
    const result = parseTodoProgress('# Heading\nSome text\n- plain list item\n');
    assert.deepStrictEqual(result, { completed: 0, total: 0 });
  });

  test('counts uncompleted tasks', () => {
    const result = parseTodoProgress('- [ ] task one\n- [ ] task two\n');
    assert.deepStrictEqual(result, { completed: 0, total: 2 });
  });

  test('counts completed tasks with lowercase x', () => {
    const result = parseTodoProgress('- [x] done one\n- [x] done two\n');
    assert.deepStrictEqual(result, { completed: 2, total: 2 });
  });

  test('counts completed tasks with uppercase X', () => {
    const result = parseTodoProgress('- [X] done one\n- [X] done two\n');
    assert.deepStrictEqual(result, { completed: 2, total: 2 });
  });

  test('handles mixed completed and uncompleted tasks', () => {
    const content = [
      '# TODO',
      '- [x] first done',
      '- [ ] second pending',
      '- [X] third done uppercase',
      '- [ ] fourth pending',
    ].join('\n');
    const result = parseTodoProgress(content);
    assert.deepStrictEqual(result, { completed: 2, total: 4 });
  });

  test('handles indented tasks with spaces', () => {
    const content = '  - [x] indented done\n  - [ ] indented pending\n';
    const result = parseTodoProgress(content);
    assert.deepStrictEqual(result, { completed: 1, total: 2 });
  });

  test('handles indented tasks with tabs', () => {
    const content = '\t- [x] tab-indented done\n\t- [ ] tab-indented pending\n';
    const result = parseTodoProgress(content);
    assert.deepStrictEqual(result, { completed: 1, total: 2 });
  });

  test('ignores non-task markdown content mixed with tasks', () => {
    const content = [
      '# Project TODO',
      '',
      '## Section',
      '- [x] a completed task',
      '- plain list item (no checkbox)',
      '- [ ] an open task',
      '',
      'Some paragraph text.',
      '> blockquote',
    ].join('\n');
    const result = parseTodoProgress(content);
    assert.deepStrictEqual(result, { completed: 1, total: 2 });
  });
});
