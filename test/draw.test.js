import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barScale, circleLayout, clampStep, diffLines, flowState, linesAt, treeLayout } from '../lib/draw.js';

test('diffLines keeps order and marks what changed', () => {
  const d = diffLines(['a.', 'b :- findall(X, a(X), L).'], ['a.', 'b :- loop(L).', 'loop([]).']);
  assert.deepEqual(d.map((x) => x.kind), ['same', 'removed', 'added', 'added']);
  assert.deepEqual(diffLines([], ['x']), [{ text: 'x', kind: 'added' }]);
  assert.deepEqual(diffLines(['x'], ['x']), [{ text: 'x', kind: 'same' }]);
});

test('layouts: circle and tree', () => {
  const c = circleLayout(['a', 'b', 'c', 'd'], 400, 300);
  assert.equal(Object.keys(c).length, 4);
  assert.deepEqual(circleLayout(['solo'], 400, 300), { solo: { x: 200, y: 150 } });
  const t = treeLayout({ test: 'integer(X)', yes: { test: 'X < 0', yes: { leaf: 'negative' }, no: { leaf: 'positive' } }, no: { leaf: 'non_integer' } });
  assert.equal(t.nodes.length, 5);
  assert.equal(t.edges.length, 4);
  assert.equal(t.nodes.filter((n) => n.leaf).length, 3);
  assert.ok(t.nodes[0].x > 0 && t.nodes[0].x < t.width);
});

test('flow, steps, lines and bars', () => {
  const items = [['ann', 'yes'], ['bob', 'no'], ['cal', 'yes']];
  assert.deepEqual(flowState(items, 2), { seen: items.slice(0, 2), current: ['bob', 'no'], list: ['ann'], rest: [['cal', 'yes']] });
  assert.deepEqual(flowState(items, 3).list, ['ann', 'cal']);
  assert.equal(clampStep(-1, 5), 0);
  assert.equal(clampStep(9, 5), 4);
  assert.deepEqual(linesAt([['a', 'x'], ['b', 'y'], ['b', 'z'], ['c', 'w']], 'b'), [1, 2]);
  assert.deepEqual(linesAt([['a', 'x']], 'q'), []);
  const b = barScale([{ label: 'total', value: 10 }], [{ label: 'total', value: 20 }]);
  assert.deepEqual(b, [{ label: 'total', value: 10, width: 0.5, was: 20, wasWidth: 1 }]);
});
