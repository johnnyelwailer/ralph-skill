import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYaml, parseYamlScalar } from './yaml.js';

test('parseYaml — parses simple key-value pairs', () => {
  const content = `
project_name: 'Aloop'
version: 1
  `;
  const result = parseYaml(content);
  assert.equal(result.project_name, 'Aloop');
  assert.equal(result.version, 1);
});

test('parseYaml — parses lists of objects', () => {
  const content = `
pipeline:
  - agent: plan
  - agent: build
    repeat: 3
  - agent: proof
  `;
  const result = parseYaml(content);
  assert.ok(Array.isArray(result.pipeline));
  assert.equal(result.pipeline.length, 3);
  assert.equal(result.pipeline[0].agent, 'plan');
  assert.equal(result.pipeline[1].agent, 'build');
  assert.equal(result.pipeline[1].repeat, 3);
  assert.equal(result.pipeline[2].agent, 'proof');
});

test('parseYaml — parses nested objects', () => {
  const content = `
agent: plan
reasoning:
  effort: high
  `;
  const result = parseYaml(content);
  assert.equal(result.agent, 'plan');
  assert.ok(typeof result.reasoning === 'object');
  assert.equal(result.reasoning.effort, 'high');
});

test('parseYaml — handles empty and comments', () => {
  const content = `
# This is a comment
foo: bar

# Another one
  `;
  const result = parseYaml(content);
  assert.equal(result.foo, 'bar');
});

test('parseYaml — strips inline comments', () => {
  const content = `
name: hello # this is a comment
count: 42 # another comment
  `;
  const result = parseYaml(content);
  assert.equal(result.name, 'hello');
  assert.equal(result.count, 42);
});

test('parseYaml — preserves hash inside double-quoted strings', () => {
  const content = `
color: "red #FF0000"
  `;
  const result = parseYaml(content);
  assert.equal(result.color, 'red #FF0000');
});

test('parseYamlScalar — parses double-quoted strings', () => {
  assert.equal(parseYamlScalar('"hello world"'), 'hello world');
  assert.equal(parseYamlScalar('"escaped \\"quote\\""'), 'escaped "quote"');
});

test('parseYamlScalar — parses null, booleans, and empty', () => {
  assert.equal(parseYamlScalar('null'), null);
  assert.equal(parseYamlScalar('true'), true);
  assert.equal(parseYamlScalar('false'), false);
  assert.equal(parseYamlScalar(''), '');
});

test('parseYaml — parses lists of scalars', () => {
  const content = `
tags:
  - alpha
  - beta
  - gamma
  `;
  const result = parseYaml(content);
  assert.ok(Array.isArray(result.tags));
  assert.deepEqual(result.tags, ['alpha', 'beta', 'gamma']);
});

test('parseYaml — hash without preceding space is not a comment', () => {
  const content = `
channel: foo#bar
  `;
  const result = parseYaml(content);
  assert.equal(result.channel, 'foo#bar');
});
