import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALGORITHMS, GROUPS, problem, request } from '../lib/algorithms.js';

test('every algorithm has pseudocode, a known group and demos that can run', () => {
  const ids = new Set();
  for (const a of ALGORITHMS) {
    assert.ok(!ids.has(a.id), a.id); ids.add(a.id);
    assert.ok(GROUPS.includes(a.group), a.id);
    assert.ok(a.pseudocode.length >= 3, a.id);
    assert.ok(a.demos.length >= 1, a.id);
    for (const d of a.demos) assert.equal(problem(a.id, d.input), '', `${a.id} / ${d.name}`);
  }
});

test('requests: examples and sequences are tidied for the driver', () => {
  assert.deepEqual(request('s2a', { name: 'f', examples: [['1', '5'], [' 2 ', '7'], ['', '']] }).input.examples, [{ input: '1', output: '5' }, { input: '2', output: '7' }]);
  assert.deepEqual(request('algebraplop', { sequence: '1, 3,5  7', value: '' }).input.sequence, [1, 3, 5, 7]);
  assert.equal(problem('algebraplop', { sequence: '4' }), 'Give at least two numbers.');
  assert.match(problem('s2a', { name: 'Bad', examples: [['1', '2']] }), /lower-case/);
  assert.equal(problem('optimise', { program: '  ' }), 'Write a program first.');
});
