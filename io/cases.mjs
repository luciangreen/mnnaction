// The functions behind the 200 inputs and outputs. Most run MNN in Action's driver
// (prolog/mnnaction.pl) on real mnns and S2A2, as the app does, on custom data made from a
// fixed seed: every algorithm the app shows, including S2A2 learn and apply, derive, and the
// reference proof. The rest run the app's own JavaScript (requests, checks, diffs, bars).
//   MNNS_DIR=../mnns S2A2_DIR=../S2A2 npm run ios
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ALGORITHMS, problem, request } from '../lib/algorithms.js';
import { barScale, diffLines, flowState, linesAt } from '../lib/draw.js';

export const title = 'MNN in Action';

const driver = fileURLToPath(new URL('../prolog/mnnaction.pl', import.meta.url));
const mnns = process.env.MNNS_DIR ?? '../mnns';
const s2a2 = process.env.S2A2_DIR ?? '../S2A2';

// Runs the driver on one request: the result and the pseudocode line of each step.
function drive(algorithm, input) {
  const r = spawnSync('swipl', ['-q', '-g', 'mnnaction_main', '-s', driver, '--', mnns, s2a2], { input: JSON.stringify(request(algorithm, input)) + '\n', encoding: 'utf8', timeout: 120000 });
  if (r.error) throw r.error;
  const line = (r.stdout ?? '').trim().split('\n').filter(Boolean).pop() ?? '';
  const reply = JSON.parse(line);
  return reply.ok ? { ok: true, result: reply.result, steps: reply.steps.map((s) => s.at) } : { ok: false, error: reply.error };
}

const P = (lines) => lines.join('\n');
const NAMES = ['ann', 'bob', 'cal', 'dee', 'eve', 'fay', 'gus'];
const nums = (r, lo, hi, n1, n2) => Array.from({ length: r.int(n1, n2) }, () => r.int(lo, hi));
const listText = (xs) => `[${xs.join(',')}]`;

// Programs with a findall, a filter, between/3, member/2, once/1, cuts, or true and fail.
function program(r, kinds = 8) {
  const vals = [...new Set(nums(r, 1, 20, 2, 5))];
  const k = r.int(2, 15);
  return [
    () => P([...vals.map((v) => `num(${v}).`), 'values(Vs) :- findall(X, num(X), Vs).']),
    () => P([...r.some(NAMES, 2, 4).map((n, i) => `score(${n}${i}, ${r.int(1, 10)}).`), `passed(Ns) :- findall(N, (score(N, S), S >= ${r.int(3, 7)}), Ns).`]),
    () => P([`squares(L) :- findall(Y, (between(1, ${r.int(2, 7)}, X), Y is X * X), L).`]),
    () => P([`picks(L) :- findall(X, (member(X, ${listText(vals)}), X > ${k}), L).`]),
    () => P([`choose(V) :- once((V = ${r.pick(['a', 'b'])} ; V = c)).`, `first(X) :- once(member(X, ${listText(vals)})).`, `positive(X) :- integer(X), X > ${r.int(0, 3)}, !.`]),
    () => P(['p(X) :- true, q(X).', ...vals.map((v) => `q(${v}).`), `r :- ${r.pick(['once(true)', 'true'])}, (fail ; s).`, 's.']),
    () => P(['len([], 0).', 'len([_|T], N) :- len(T, N0), N is N0 + 1.', `countdown(${r.int(0, 2)}).`, 'countdown(N) :- integer(N), N > 0, M is N - 1, countdown(M).']),
    () => P([`max(X, Y, X) :- X >= Y, !.`, 'max(_, Y, Y).', ...vals.map((v) => `c(${v}).`)])
  ][r.int(0, kinds - 1)]();
}

const queryOf = (prog) => (/^(\w+)\((\w+)\) :- findall/m.exec(prog) || /^(\w+)\((\w+)\) :- once/m.exec(prog) || [null, 'values', 'Vs']).slice(1);

const drivers = [
  ['optimise', (r) => ({ program: program(r) })],
  ['loop2', (r) => { const p = program(r, 4); const [f, v] = queryOf(p); return { program: p, query: `${f}(${v})` }; }],
  ['plop', (r) => ({ program: program(r) })],
  ['detlog', (r) => ({ program: program(r) })],
  ['detlog_transform', (r) => ({ program: program(r) })],
  ['pid', (r) => ({ program: program(r) })],
  ['s2a', (r) => {
    const a = r.int(-3, 4), b = r.int(-5, 5), c = r.int(0, 1) ? r.int(1, 2) : 0;
    const xs = [...new Set(nums(r, 0, 9, 3, 5))];
    return r.chance(0.8)
      ? { name: r.pick(['f', 'g', 'h']), examples: xs.map((x) => [String(x), String(c * x * x + a * x + b)]) }
      : { name: 'contents', examples: xs.map((x) => [`box(${r.pick(['red', 'blue', 'green'])}, [${x},${x + 1}])`, `[${x},${x + 1}]`]) };
  }],
  ['s2a2', (r) => {
    const lists = Array.from({ length: r.int(3, 4) }, () => nums(r, -3, 9, 0, 4));
    const kind = r.pick(['rev', 'len', 'evens', 'evens_ref', 'sum']);
    const out = { rev: (l) => listText([...l].reverse()), len: (l) => String(l.length), evens: (l) => listText(l.filter((x) => x % 2 === 0)), evens_ref: (l) => listText(l.filter((x) => x % 2 === 0)), sum: (l) => String(l.reduce((s, x) => s + x, 0)) }[kind];
    const input = { name: kind === 'evens_ref' ? 'evens' : kind, examples: lists.map((l) => [listText(l), out(l)]) };
    if (kind === 'evens_ref') input.reference = P(['r([], []).', 'r([X|Xs], R) :- ( X mod 2 =:= 0 -> R = [X|R1] ; R = R1 ), r(Xs, R1).']);
    return input;
  }],
  ['s2a2_optimise', (r) => {
    const facts = (f, xs) => xs.map((x) => `${f}(${x}).`);
    const pair = (name, base, wrap, top) => { const xs = r.some(['a', 'b', 'c', 'd', 'e'], 1, 3); return { name: top, targets: `[${top}/1]`, before: P([...facts(base, xs), `${wrap}(X) :- ${base}(X).`, `${top}(X) :- ${wrap}(X).`]), after: P([...facts(base, xs), `${wrap}(X) :- ${base}(X).`, `${top}(X) :- ${base}(X).`]) }; };
    const edges = Array.from({ length: r.int(1, 4) }, () => `edge(${r.pick(['a', 'b', 'c', 'd'])}, ${r.pick(['a', 'b', 'c', 'd'])}).`);
    return { pairs: [pair('col', 'colour', 'q', 'col'), pair('big', 'size', 's', 'big')].slice(0, r.int(1, 2)), name: 'conn', targets: '[conn/2]', program: P([...new Set(edges), 'e(U, V) :- edge(U, V).', 'conn(U, V) :- e(U, V).']) };
  }],
  ['s2a2_derive', (r) => {
    const samples = `[${Array.from({ length: r.int(1, 3) }, () => listText(nums(r, -9, 9, 0, 4))).join(', ')}]`;
    return r.pick([
      () => ({ name: 'sum', mode: '[in(list(int)), out]', bound: '', samples, program: P(['sum([], 0).', 'sum([H|T], S) :- sum(T, S1), S is S1 + H.']) }),
      () => ({ name: 'flat2', mode: '[in(list(list(any))), out]', bound: String(r.int(2, 3)), samples: `[[${listText(nums(r, 0, 9, 0, 2))},${listText(nums(r, 0, 9, 0, 2))}], [[], [a]]]`, program: P(['flat2([], []).', 'flat2([L|Ls], F) :- flat2(Ls, F0), app(L, F0, F).', 'app([], A, A).', 'app([X|Xs], B, [X|C]) :- app(Xs, B, C).']) }),
      () => ({ name: 'rev', mode: '[in(list(any)), out]', bound: String(r.int(2, 4)), samples, program: P(['rev([], []).', 'rev([H|T], R) :- rev(T, R0), app(R0, [H], R).', 'app([], A, A).', 'app([X|Xs], B, [X|C]) :- app(Xs, B, C).']) })
    ])();
  }],
  ['algebraplop', (r) => {
    const a = r.int(-4, 6), b = r.int(1, 5), c = r.int(1, 3), n = r.int(3, 7);
    const seq = r.pick([(i) => a + b * i, (i) => c * i * i + b * i + a, (i) => c * b ** i, (i) => i ** 3 + a, (i) => [1, 1, 2, 3, 5, 8, 13][i] + a]);
    const xs = Array.from({ length: n }, (_, i) => seq(i));
    return { sequence: xs.join(', '), value: r.chance(0.5) ? String(seq(n + r.int(0, 4))) : '' };
  }],
  ['qi', (r) => ({ program: program(r, 4), seed: String(r.int(1, 99)) })],
  ['aioc_compile', (r) => {
    const t = r.int(-5, 5), u = t + r.int(1, 6);
    return r.pick([
      () => ({ kind: 'dtree', name: 'classify', source: `dtree(integer(Input), dtree(Input < ${t}, leaf(low), dtree(Input =< ${u}, leaf(middle), leaf(high))), leaf(non_integer))` }),
      () => ({ kind: 'cfg', name: 'balanced', source: `cfg(s, [rule(s, [terminal(${r.pick(['a', 'x'])}), nonterminal(s), terminal(${r.pick(['b', 'y'])})]), rule(s, [])])` }),
      () => ({ kind: 'dcg', name: 'parser', source: `dcg(s, [(s --> [${r.pick(['a', 'p'])}], item, [${r.pick(['b', 'q'])}]), (item --> [${r.pick(['x', 'y', 'z'])}])])` })
    ])();
  }],
  ['aioc_allocate', (r) => ({
    quantum: r.pick(['off', 'inspired']),
    candidates: r.some(['original', 'loop', 'table', 'memo', 'fold'], 1, 3).filter((x, i, a) => a.indexOf(x) === i).map((name) => ({ name, assessment: r.int(0, 4), cost: r.int(0, 3), amplitude: r.int(0, 2) })),
    budgets: [{ resource: 'time', amount: r.int(5, 120) }, ...(r.chance(0.5) ? [{ resource: 'memory', amount: r.int(8, 64) }] : []), { resource: 'workers', amount: r.int(1, 4) }]
  })],
  ['aioc_simplify', (r) => ({ program: program(r) })],
  ['starlog', (r) => { const w = r.some(['hello', 'world', 'logic', 'green', 'tree'], 2, 2); return { program: P([`greet(S) :- S is "${w[0]}" : " ${w[1]}".`, `both(L) :- L is [${w[0]}] & [${w[1]}].`, `name(A) :- A is ${w[0]} • ${w[1]}.`].slice(0, r.int(1, 3))) }; }]
];

const js = [
  { name: 'problem', make: (r) => { const a = r.pick(ALGORITHMS); const d = r.pick(a.demos).input; const spoil = r.pick([null, 'program', 'name', 'sequence', 'examples']); const input = { ...d }; if (spoil && spoil in input) input[spoil] = spoil === 'name' ? 'Bad' : spoil === 'examples' ? [] : spoil === 'sequence' ? '4' : ' '; return [a.id, input]; }, run: (id, input) => problem(id, input) || 'ok' },
  { name: 'diffLines', make: (r) => { const a = r.some(['a.', 'b.', 'c.', 'd.', 'e.'], 1, 5); const b = r.chance(0.5) ? a.filter(() => r.chance(0.7)).concat(r.some(['f.', 'g.'], 0, 2)) : r.some(['a.', 'b.', 'c.', 'f.'], 1, 5); return [a, b]; }, run: (a, b) => diffLines(a, b) },
  { name: 'linesAt', make: (r) => { const a = r.pick(ALGORITHMS); return [a.id, r.pick([...a.pseudocode.map(([id]) => id), 'nowhere'])]; }, run: (id, at) => linesAt(ALGORITHMS.find((a) => a.id === id).pseudocode, at) },
  { name: 'barScale', make: (r) => { const ls = ['clauses', 'goals', 'predicates', 'total']; return [ls.map((label) => ({ label, value: r.int(0, 40) })), r.chance(0.5) ? ls.map((label) => ({ label, value: r.int(0, 40) })) : []]; }, run: (b, c) => barScale(b, c) },
  { name: 'flowState', make: (r) => { const items = Array.from({ length: r.int(1, 5) }, () => [r.int(1, 9), r.pick(['yes', 'no'])]); return [items, r.int(0, items.length)]; }, run: (items, at) => flowState(items, at) }
];

export const cases = [...drivers.map(([id, make]) => ({ name: id, make: (r) => [make(r)], run: (input) => drive(id, input) })), ...js];
