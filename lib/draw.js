// Pure helpers for drawing the steps (no DOM), so they can be tested.

// Line diff (longest common subsequence): [{ text, kind: 'same' | 'added' | 'removed' }].
export function diffLines(before = [], after = []) {
  const n = before.length, m = after.length;
  const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = before[i] === after[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) { out.push({ text: after[j], kind: 'same' }); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) out.push({ text: before[i++], kind: 'removed' });
    else out.push({ text: after[j++], kind: 'added' });
  }
  while (i < n) out.push({ text: before[i++], kind: 'removed' });
  while (j < m) out.push({ text: after[j++], kind: 'added' });
  return out;
}

// Nodes on a circle (a single node in the middle), as { id: { x, y } }.
export function circleLayout(nodes, width, height, pad = 50) {
  const cx = width / 2, cy = height / 2, r = Math.max(10, Math.min(width, height) / 2 - pad);
  const out = {};
  nodes.forEach((id, k) => {
    if (nodes.length === 1) { out[id] = { x: cx, y: cy }; return; }
    const a = -Math.PI / 2 + (2 * Math.PI * k) / nodes.length;
    out[id] = { x: Math.round(cx + r * Math.cos(a)), y: Math.round(cy + r * Math.sin(a)) };
  });
  return out;
}

// A decision tree ({ test, yes, no } or { leaf }) laid out top-down: nodes and edges.
export function treeLayout(tree, { dx = 120, dy = 80 } = {}) {
  const nodes = [], edges = [];
  let nextLeafX = 0;
  const walk = (t, depth) => {
    const id = nodes.length;
    const node = { id, depth, label: t.leaf ?? t.test, leaf: t.leaf !== undefined, x: 0, y: depth * dy };
    nodes.push(node);
    if (node.leaf) { node.x = nextLeafX; nextLeafX += dx; return node; }
    const y = walk(t.yes, depth + 1), n = walk(t.no, depth + 1);
    edges.push({ from: id, to: y.id, label: 'yes' }, { from: id, to: n.id, label: 'no' });
    node.x = (y.x + n.x) / 2;
    return node;
  };
  if (tree) walk(tree, 0);
  const width = Math.max(dx, nextLeafX), height = (Math.max(0, ...nodes.map((n) => n.depth)) + 1) * dy;
  return { nodes, edges, width, height };
}

// loop2's walk: after `at` items, which have been seen and what the list holds.
export function flowState(items, at) {
  const seen = items.slice(0, at);
  return { seen, current: items[at - 1] ?? null, list: seen.filter(([, ok]) => ok === 'yes').map(([x]) => x), rest: items.slice(at) };
}

// The step player: which step comes next, clamped to the steps there are.
export const clampStep = (i, count) => Math.max(0, Math.min(count - 1, i));

// The pseudocode lines a step is at (the first line with that id, and its continuation lines).
export function linesAt(pseudocode, at) {
  const first = pseudocode.findIndex(([id]) => id === at);
  if (first < 0) return [];
  const out = [first];
  for (let k = first + 1; k < pseudocode.length && pseudocode[k][0] === at; k++) out.push(k);
  return out;
}

// Bars scaled to the largest value (with an optional set to compare against).
export function barScale(bars, compare = []) {
  const max = Math.max(1, ...bars.map((b) => Number(b.value) || 0), ...compare.map((b) => Number(b.value) || 0));
  return bars.map((b) => {
    const was = compare.find((c) => c.label === b.label);
    return { label: b.label, value: b.value, width: (Number(b.value) || 0) / max, was: was ? was.value : null, wasWidth: was ? (Number(was.value) || 0) / max : null };
  });
}
