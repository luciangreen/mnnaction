// MNN in Action: mnns's algorithms, animated step by step (in the manner of Algorithms in
// Action). Steps come from running the real mnns through SWI-Prolog in LucianOS
// (prolog/mnnaction.pl); without LucianOS, demos use runs recorded from the real mnns.
import { ALGORITHMS, GROUPS, byId, problem, request } from './lib/algorithms.js';
import { barScale, circleLayout, clampStep, diffLines, flowState, linesAt, treeLayout } from './lib/draw.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k.startsWith('aria-') || k === 'role' || k === 'for') n.setAttribute(k, v);
    else n[k] = v;
  }
  n.append(...kids.flat().filter((x) => x !== null && x !== undefined && x !== false).map((x) => (typeof x === 'object' ? x : String(x))));
  return n;
};
const svgEl = (tag, attrs = {}, ...kids) => {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  n.append(...kids.map((x) => (typeof x === 'object' ? x : document.createTextNode(String(x)))));
  return n;
};

// ------------------------------------------------------------------ state
let api = null; // LucianOS's API, when the app runs inside LucianOS
let settings = { mnns: 'Dropbox/GitHub-private2/mnns', s2a2: 'Dropbox/GitHub-private2/S2A2', useRecorded: false, algorithm: 'optimise', custom: {} };
let recorded = null;
let mode = 'demo';
let trace = null; // { steps, algorithm, source }
let at = 0;
let timer = null;

const alg = () => byId(settings.algorithm) ?? ALGORITHMS[0];
const demoIndex = () => Number($('demo').value) || 0;
const demoInput = () => alg().demos[demoIndex()]?.input ?? {};
const customInput = () => settings.custom[alg().id] ?? structuredClone(demoInput());

async function persist() {
  try { if (api) await api.state.set('mnnaction', settings); else localStorage.setItem('mnnaction', JSON.stringify(settings)); } catch { /* storage may be off */ }
}
async function restore() {
  try {
    const saved = api ? await api.state.get('mnnaction') : JSON.parse(localStorage.getItem('mnnaction') ?? 'null');
    if (saved) settings = { ...settings, ...saved, custom: saved.custom ?? {} };
  } catch { /* fresh start */ }
}

// ------------------------------------------------------------------ running
const say = (text, error = false) => { $('status').textContent = text; $('status').classList.toggle('error', error); };

async function driverPath() {
  const text = await (await fetch(new URL('./prolog/mnnaction.pl', import.meta.url))).text();
  const path = '.lucianos/mnnaction/mnnaction.pl';
  await api.files.write(path, text, { force: true, mkdirs: true });
  return path;
}

// Runs the driver in LucianOS: one JSON line in, the reply's JSON line out.
async function runOnMnns(req) {
  const path = await driverPath();
  const job = await api.jobs.start({ cmd: 'swipl', cwd: '', label: `MNN in Action: ${req.algorithm}`, stdin: true, args: ['-q', '-g', 'mnnaction_main', '-s', path, '--', settings.mnns, settings.s2a2 || ''] });
  const done = new Promise((resolve) => {
    let out = '', err = '';
    api.jobs.stream(job.id, { output: (c) => { if (c.stream === 'stderr') err += c.text; else out += c.text; }, end: (s) => resolve({ out, err, code: s?.exitCode }) });
  });
  await api.jobs.input(job.id, JSON.stringify(req) + '\n');
  const { out, err } = await done;
  const line = out.trim().split('\n').filter((l) => l.startsWith('{')).pop();
  if (!line) throw new Error(err.trim().split('\n').slice(-4).join(' ') || 'mnns gave no answer (is SWI-Prolog installed, and the mnns folder right in Settings?)');
  return JSON.parse(line);
}

async function loadRecorded() {
  if (recorded) return recorded;
  try { recorded = await (await fetch(new URL('./demos/recorded.json', import.meta.url))).json(); } catch { recorded = { traces: {} }; }
  return recorded;
}

async function run() {
  stop();
  const a = alg();
  const input = mode === 'demo' ? demoInput() : customInput();
  const p = problem(a.id, input);
  if (p) return say(p, true);
  const req = request(a.id, input);
  $('run').disabled = true;
  try {
    let reply, source;
    if (api && !(mode === 'demo' && settings.useRecorded)) {
      say('Running on mnns…');
      reply = await runOnMnns(req);
      source = 'mnns, just now';
    } else if (mode === 'demo') {
      const r = await loadRecorded();
      reply = r.traces[`${a.id}/${a.demos[demoIndex()].name}`];
      if (!reply) throw new Error('This demo has no recorded run yet.');
      source = `recorded from mnns${r.made ? ` on ${r.made}` : ''}`;
    } else {
      throw new Error('Custom data runs on your mnns, so open MNN in Action from LucianOS.');
    }
    if (!reply.ok) throw new Error(reply.error);
    trace = { steps: reply.steps, algorithm: a.id, source, result: reply.result };
    at = 0;
    say(`${reply.steps.length} steps (${source}).`);
    $('where').textContent = `Steps: ${source}`;
    show();
    play();
  } catch (err) {
    say(err.message, true);
  } finally {
    $('run').disabled = false;
  }
}

// ------------------------------------------------------------------ the player
function show() {
  const steps = trace?.steps ?? [];
  at = clampStep(at, steps.length);
  $('scrub').max = String(Math.max(0, steps.length - 1));
  $('scrub').value = String(at);
  $('count').textContent = `${steps.length ? at + 1 : 0} / ${steps.length}`;
  for (const id of ['first', 'prev']) $(id).disabled = !steps.length || at === 0;
  for (const id of ['next', 'last']) $(id).disabled = !steps.length || at >= steps.length - 1;
  $('play').disabled = !steps.length;
  const step = steps[at];
  const lines = step && trace.algorithm === alg().id ? linesAt(alg().pseudocode, step.at) : [];
  [...$('pseudocode').children].forEach((li, k) => li.classList.toggle('at', lines.includes(k)));
  $('note').textContent = step ? step.note : 'Choose an algorithm and a demo, or your own data, then press Run.';
  $('stage').replaceChildren(...(step ? drawStep(step) : []));
}
function play() {
  if (!trace?.steps.length) return;
  if (at >= trace.steps.length - 1) at = 0;
  $('play').textContent = '⏸';
  $('play').setAttribute('aria-label', 'Pause');
  const tick = () => {
    if (at >= trace.steps.length - 1) return stop();
    at++;
    show();
    timer = setTimeout(tick, Number($('speed').value));
  };
  show();
  timer = setTimeout(tick, Number($('speed').value));
}
function stop() {
  clearTimeout(timer);
  timer = null;
  $('play').textContent = '▶';
  $('play').setAttribute('aria-label', 'Play');
}
const go = (i) => { stop(); at = i; show(); };

// ------------------------------------------------------------------ drawing a step
const block = (title, ...kids) => el('div', { class: 'block' }, title ? el('h3', {}, title) : null, ...kids);
const good = (s) => /^(accepted|proved|same answers|found|✓|true|smaller)/.test(String(s)) || /formula\(/.test(String(s));

function drawStep(s) {
  const out = [];
  if (s.check) out.push(el('div', {}, el('span', { class: `badge${good(s.check) ? ' good' : ''}` }, s.check)));
  if (s.flow) out.push(block('Generator → filter → list', drawFlow(s.flow)));
  if (s.tree) out.push(block('Decision tree', drawTree(s.tree)));
  if (s.graph) out.push(block('Call graph', drawGraph(s.graph)));
  if (s.differences) out.push(block('Differences', drawDifferences(s.differences)));
  if (s.bars) out.push(block(s.compare ? 'Size (dashed: before)' : trace.algorithm === 'qi' ? 'Amplitudes' : 'Size', drawBars(s.bars, s.compare ?? [], s.focus)));
  if (s.program) out.push(block(s.before ? 'Program (changes marked)' : 'Program', drawProgram(s.program, s.before)));
  if (s.table) out.push(block('', drawTable(s.table, s.focus)));
  if (s.items?.length) out.push(block(s.current ? `Step ${s.current} of ${s.items.length}` : '', drawItems(s.items, s.current)));
  if (s.code) out.push(block('OpenQASM 3', el('pre', { class: 'qasm' }, s.code)));
  return out;
}

function drawProgram(program, before) {
  const lines = (cs) => cs.flatMap((c) => c.split('\n'));
  const rows = before ? diffLines(lines(before), lines(program)) : lines(program).map((text) => ({ text, kind: 'same' }));
  return el('pre', { class: 'code' }, rows.map((r) => el('span', { class: `ln ${r.kind}` }, r.text || ' ')));
}

function cell(v) {
  if (Array.isArray(v)) return v.map(String).join('\n');
  return v === null || v === undefined ? '' : String(v);
}
function drawTable({ head = [], rows = [] }, focus) {
  return el('table', { class: 'data' },
    el('thead', {}, el('tr', {}, head.map((h) => el('th', {}, h)))),
    el('tbody', {}, rows.map((r) => el('tr', { class: focus && r[0] === focus ? 'focus' : '' }, r.map((v) => el('td', { class: v === '✓' ? 'ok' : v === '✗' ? 'no' : '' }, cell(v)))))));
}

function drawItems(items, current) {
  return el('ol', { class: 'items' }, items.map((t, k) => el('li', { class: current ? (k + 1 === current ? 'current' : k + 1 > current ? 'later' : '') : '' }, t)));
}

function drawBars(bars, compare, focus) {
  return el('div', { class: 'bars' }, barScale(bars, compare).map((b) => el('div', { class: `bar${b.label === focus ? ' focus' : ''}` },
    el('span', {}, b.label),
    el('span', { class: 'track' }, b.wasWidth !== null ? el('span', { class: 'was', style: `width:${(b.wasWidth * 100).toFixed(1)}%` }) : null, el('span', { class: 'fill', style: `width:${(b.width * 100).toFixed(1)}%` })),
    el('span', { class: 'num' }, b.was !== null && b.was !== b.value ? `${b.value} (was ${b.was})` : b.value))));
}

function drawFlow({ items, at: k }) {
  const f = flowState(items, k);
  const chips = items.map(([x, ok], i) => el('span', { class: `chip${i < k - 1 ? ' seen' : ''}${i === k - 1 ? ` current ${ok === 'yes' ? 'pass' : 'fail'}` : ''}` }, x));
  return el('div', { class: 'flow' },
    el('div', {}, el('h4', {}, 'Generator'), el('div', { class: 'chips' }, chips)),
    el('div', { class: 'gate', 'aria-label': f.current ? (f.current[1] === 'yes' ? 'passes' : 'fails') : '' }, f.current ? (f.current[1] === 'yes' ? '✓ →' : '✗') : '→'),
    el('div', {}, el('h4', {}, 'List'), el('div', { class: 'chips' }, f.list.map((x) => el('span', { class: 'chip pass' }, x)))));
}

function drawTree(tree) {
  const t = treeLayout(tree, { dx: 130, dy: 86 });
  const W = t.width + 40, H = t.height + 20;
  const x = (n) => n.x + 20 + 65, y = (n) => n.y + 30;
  const g = svgEl('svg', { class: 'draw', viewBox: `0 0 ${W + 60} ${H}`, role: 'img', 'aria-label': 'Decision tree' });
  for (const e of t.edges) {
    const a = t.nodes[e.from], b = t.nodes[e.to];
    g.append(svgEl('line', { class: 'edge', x1: x(a), y1: y(a) + 14, x2: x(b), y2: y(b) - 14 }), svgEl('text', { class: 'elabel', x: (x(a) + x(b)) / 2 + 4, y: (y(a) + y(b)) / 2 }, e.label));
  }
  for (const n of t.nodes) {
    const w = Math.max(60, n.label.length * 7.4 + 16);
    g.append(svgEl('g', { class: `node${n.leaf ? ' leaf' : ''}` }, svgEl('rect', { x: x(n) - w / 2, y: y(n) - 14, width: w, height: 28, rx: n.leaf ? 14 : 6 }), svgEl('text', { x: x(n), y: y(n) + 4, 'text-anchor': 'middle' }, n.label)));
  }
  return g;
}

function drawGraph({ nodes = [], edges = [], classes = [] }) {
  const W = 560, H = Math.max(260, Math.min(400, 90 * Math.ceil(nodes.length / 2) + 120));
  const pos = circleLayout(nodes, W, H, 80);
  const half = (n) => Math.max(30, n.length * 4.2 + 12); // half the box's width, from its label
  const recursive = new Set(classes.filter(([, c]) => c === 'recursive').map(([p]) => p));
  const g = svgEl('svg', { class: 'draw', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Call graph' });
  g.append(svgEl('defs', {}, svgEl('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, svgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#8a94a6' }))));
  for (const [a, b] of edges) {
    const p = pos[a], q = pos[b];
    if (!p || !q) continue;
    if (a === b) g.append(svgEl('path', { class: 'edge', d: `M${p.x - 12},${p.y - 16} C${p.x - 46},${p.y - 66} ${p.x + 46},${p.y - 66} ${p.x + 12},${p.y - 16}`, 'marker-end': 'url(#arrow)' }));
    else {
      const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1;
      const cut = (n) => Math.min(Math.abs(half(n) / (dx / d || 1e-9)), Math.abs(18 / (dy / d || 1e-9)));
      g.append(svgEl('line', { class: 'edge', x1: p.x + (dx / d) * cut(a), y1: p.y + (dy / d) * cut(a), x2: q.x - (dx / d) * (cut(b) + 3), y2: q.y - (dy / d) * (cut(b) + 3), 'marker-end': 'url(#arrow)' }));
    }
  }
  for (const n of nodes) {
    const p = pos[n], w = half(n);
    g.append(svgEl('g', { class: `node${recursive.has(n) ? ' recursive' : ''}` }, svgEl('rect', { x: p.x - w, y: p.y - 16, width: 2 * w, height: 32, rx: 16 }), svgEl('text', { x: p.x, y: p.y + 4, 'text-anchor': 'middle' }, n)));
  }
  return g;
}

function drawDifferences(rows) {
  return el('table', { class: 'diff-tri' }, rows.map((r, k) => el('tr', {}, el('th', {}, k === 0 ? 'values' : `Δ${k}`), r.map((v, i) => el('td', { style: `padding-left:${i === 0 ? 10 + k * 18 : 10}px` }, v)))));
}

// ------------------------------------------------------------------ the left side
function fillAlgorithms() {
  const sel = $('algorithm');
  sel.replaceChildren(...GROUPS.map((g) => el('optgroup', { label: g }, ALGORITHMS.filter((a) => a.group === g).map((a) => el('option', { value: a.id, selected: a.id === settings.algorithm }, a.title)))));
}

function showAlgorithm() {
  const a = alg();
  stop();
  trace = null;
  at = 0;
  $('about').textContent = a.about;
  $('demo').replaceChildren(...a.demos.map((d, k) => el('option', { value: k }, d.name)));
  $('pseudocode').replaceChildren(...a.pseudocode.map(([, text, indent]) => el('li', { class: indent ? `indent${indent}` : '' }, text)));
  $('where').textContent = api ? `mnns: ~/${settings.mnns}` : 'recorded runs (open in LucianOS to run mnns)';
  showDemo();
  drawCustom();
  say('');
  show();
}

function describeInput(a, input) {
  switch (a.input) {
    case 'examples': return `${input.name}:\n${(input.examples ?? []).map(([x, y]) => `  ${x}  →  ${y}`).join('\n')}`;
    case 'sequence': return `${input.sequence}${input.value ? `\nposition of: ${input.value}` : ''}`;
    case 'grammar': return `${input.kind} ${input.name}:\n${input.source}`;
    case 'allocation': return `${(input.candidates ?? []).map((c) => `${c.name}: assessment ${c.assessment}, cost ${c.cost}, amplitude ${c.amplitude}`).join('\n')}\nbudgets: ${(input.budgets ?? []).map((b) => `${b.resource} ${b.amount}`).join(', ')}${input.quantum !== 'off' ? `\nquantum: ${input.quantum}` : ''}`;
    default: return `${input.program ?? ''}${input.query ? `\n\n?- ${input.query}.` : ''}${input.seed ? `\n\nseed: ${input.seed}` : ''}`;
  }
}
function showDemo() { $('demoPreview').textContent = describeInput(alg(), demoInput()); }

function setCustom(fn) {
  const a = alg();
  const input = customInput();
  fn(input);
  settings.custom = { ...settings.custom, [a.id]: input };
  persist();
}

function drawCustom() {
  const a = alg();
  const input = customInput();
  const f = $('customForm');
  const field = (label, node) => el('label', {}, label, node);
  const text = (key, label, rows = 1) => field(label, rows > 1
    ? el('textarea', { value: input[key] ?? '', spellcheck: false, rows, oninput: (e) => setCustom((i) => { i[key] = e.target.value; }) })
    : el('input', { type: 'text', value: input[key] ?? '', spellcheck: false, oninput: (e) => setCustom((i) => { i[key] = e.target.value; }) }));
  let kids = [];
  if (a.input.startsWith('program')) {
    kids.push(text('program', a.id === 'starlog' ? 'Starlog program' : 'Prolog program', 8));
    if (a.input === 'program+query') kids.push(text('query', 'Query to compare (optional)'));
    if (a.input === 'program+seed') kids.push(text('seed', 'Seed'));
  } else if (a.input === 'examples') {
    kids.push(text('name', 'Predicate name'));
    const rows = input.examples ?? [];
    kids.push(el('table', { class: 'grid-input' }, el('tr', {}, el('th', {}, 'input A'), el('th', {}, 'output B'), el('th', {})),
      rows.map(([x, y], k) => el('tr', {},
        el('td', {}, el('input', { type: 'text', value: x, 'aria-label': `Input ${k + 1}`, oninput: (e) => setCustom((i) => { i.examples[k][0] = e.target.value; }) })),
        el('td', {}, el('input', { type: 'text', value: y, 'aria-label': `Output ${k + 1}`, oninput: (e) => setCustom((i) => { i.examples[k][1] = e.target.value; }) })),
        el('td', {}, el('button', { type: 'button', class: 'ghost small', 'aria-label': `Remove example ${k + 1}`, onclick: () => { setCustom((i) => i.examples.splice(k, 1)); drawCustom(); } }, '×'))))));
    kids.push(el('button', { type: 'button', class: 'ghost small', onclick: () => { setCustom((i) => { i.examples = [...(i.examples ?? []), ['', '']]; }); drawCustom(); } }, '+ example'));
    if (a.id === 's2a') kids.push(el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: !!input.table, onchange: (e) => setCustom((i) => { i.table = e.target.checked; }) }), 'Allow a lookup table'));
  } else if (a.input === 'sequence') {
    kids.push(text('sequence', 'Numbers, from position 0 (commas between)'), text('value', 'Find the position of (optional)'));
  } else if (a.input === 'grammar') {
    kids.push(field('Kind', el('select', { onchange: (e) => setCustom((i) => { i.kind = e.target.value; }) }, ['dtree', 'cfg', 'dcg'].map((k) => el('option', { value: k, selected: input.kind === k }, { dtree: 'decision tree', cfg: 'context-free grammar', dcg: 'DCG' }[k])))));
    kids.push(text('name', 'Predicate name'), text('source', 'Tree or grammar (as a Prolog term; call the tree\'s input Input)', 5));
  } else if (a.input === 'allocation') {
    const cands = input.candidates ?? [];
    kids.push(el('table', { class: 'grid-input' }, el('tr', {}, ['name', 'assessment', 'cost', 'amplitude', ''].map((h) => el('th', {}, h))),
      cands.map((c, k) => el('tr', {}, ['name', 'assessment', 'cost', 'amplitude'].map((key) => el('td', {}, el('input', { type: key === 'name' ? 'text' : 'number', value: c[key], 'aria-label': `${key} ${k + 1}`, oninput: (e) => setCustom((i) => { i.candidates[k][key] = key === 'name' ? e.target.value : Number(e.target.value); }) }))),
        el('td', {}, el('button', { type: 'button', class: 'ghost small', 'aria-label': `Remove ${c.name}`, onclick: () => { setCustom((i) => i.candidates.splice(k, 1)); drawCustom(); } }, '×'))))));
    kids.push(el('button', { type: 'button', class: 'ghost small', onclick: () => { setCustom((i) => { i.candidates = [...(i.candidates ?? []), { name: `c${(i.candidates ?? []).length + 1}`, assessment: 1, cost: 1, amplitude: 0 }]; }); drawCustom(); } }, '+ candidate'));
    const budgets = input.budgets ?? [];
    kids.push(el('table', { class: 'grid-input' }, el('tr', {}, el('th', {}, 'budget'), el('th', {}, 'amount'), el('th', {})),
      budgets.map((b, k) => el('tr', {},
        el('td', {}, el('select', { 'aria-label': `Budget ${k + 1}`, onchange: (e) => setCustom((i) => { i.budgets[k].resource = e.target.value; }) }, ['time', 'memory', 'workers', 'depth', 'data', 'effort'].map((r) => el('option', { value: r, selected: r === b.resource }, r)))),
        el('td', {}, el('input', { type: 'number', value: b.amount, 'aria-label': `Amount ${k + 1}`, oninput: (e) => setCustom((i) => { i.budgets[k].amount = Number(e.target.value); }) })),
        el('td', {}, el('button', { type: 'button', class: 'ghost small', 'aria-label': `Remove budget ${k + 1}`, onclick: () => { setCustom((i) => i.budgets.splice(k, 1)); drawCustom(); } }, '×'))))));
    kids.push(el('button', { type: 'button', class: 'ghost small', onclick: () => { setCustom((i) => { i.budgets = [...(i.budgets ?? []), { resource: 'time', amount: 10 }]; }); drawCustom(); } }, '+ budget'));
    kids.push(field('Quantum-inspired', el('select', { onchange: (e) => setCustom((i) => { i.quantum = e.target.value; }) }, ['off', 'inspired'].map((q) => el('option', { value: q, selected: (input.quantum ?? 'off') === q }, q)))));
  }
  f.replaceChildren(...kids);
}

function setMode(m) {
  mode = m;
  $('tabDemo').classList.toggle('on', m === 'demo');
  $('tabCustom').classList.toggle('on', m === 'custom');
  $('tabDemo').setAttribute('aria-selected', String(m === 'demo'));
  $('tabCustom').setAttribute('aria-selected', String(m === 'custom'));
  $('demoPane').classList.toggle('hidden', m !== 'demo');
  $('customPane').classList.toggle('hidden', m !== 'custom');
  if (m === 'custom') drawCustom();
}

// ------------------------------------------------------------------ start
async function start() {
  try { ({ api } = await import('/shared/api.js')); await api.state.get('mnnaction'); } catch { api = null; }
  await restore();
  fillAlgorithms();
  showAlgorithm();
  $('algorithm').onchange = (e) => { settings.algorithm = e.target.value; persist(); showAlgorithm(); };
  $('demo').onchange = () => { showDemo(); stop(); };
  $('tabDemo').onclick = () => setMode('demo');
  $('tabCustom').onclick = () => setMode('custom');
  $('fromDemo').onclick = () => { setCustom((i) => { for (const k of Object.keys(i)) delete i[k]; Object.assign(i, structuredClone(demoInput())); }); drawCustom(); };
  $('run').onclick = run;
  $('first').onclick = () => go(0);
  $('prev').onclick = () => go(at - 1);
  $('next').onclick = () => go(at + 1);
  $('last').onclick = () => go((trace?.steps.length ?? 1) - 1);
  $('play').onclick = () => (timer ? stop() : play());
  $('scrub').oninput = (e) => go(Number(e.target.value));
  $('settingsBtn').onclick = () => {
    $('mnnsDir').value = settings.mnns; $('s2a2Dir').value = settings.s2a2; $('useRecorded').checked = !!settings.useRecorded;
    $('settings').showModal();
  };
  $('settings').addEventListener('close', () => {
    settings.mnns = $('mnnsDir').value.trim() || settings.mnns;
    settings.s2a2 = $('s2a2Dir').value.trim();
    settings.useRecorded = $('useRecorded').checked;
    persist();
    showAlgorithm();
  });
  addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select, dialog')) return;
    if (e.key === ' ') { e.preventDefault(); timer ? stop() : play(); }
    else if (e.key === 'ArrowRight') go(at + 1);
    else if (e.key === 'ArrowLeft') go(at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go((trace?.steps.length ?? 1) - 1);
  });
  // Open with a demo playing, so there is something to watch straight away.
  if (!api || settings.useRecorded) run();
}

start();
