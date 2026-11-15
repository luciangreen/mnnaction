// The mnns algorithms MNN in Action shows. For each: what it does, its pseudocode (line ids
// match the "at" of the steps prolog/mnnaction.pl writes), what input it takes, and demos.

const P = (strings) => strings.join('\n');

const findallProgram = P(['num(1).', 'num(2).', 'num(3).', 'values(Vs) :- findall(X, num(X), Vs).']);
const filterProgram = P(['score(ann, 7).', 'score(bob, 4).', 'score(cal, 9).', 'score(dee, 5).', 'passed(Names) :- findall(N, (score(N, S), S >= 5), Names).']);
const betweenProgram = P(['squares(L) :- findall(Y, (between(1, 6, X), Y is X * X), L).']);
const memberProgram = P(['evens(L) :- findall(X, (member(X, [1, 2, 3, 4, 5, 6]), 0 is X mod 2), L).']);
const onceProgram = P(['choose(V) :- once((V = a ; V = b)).', 'first(X) :- once(member(X, [p, q, r])).', 'positive(X) :- integer(X), X > 0, !.']);
const tidyProgram = P(['p(X) :- true, q(X).', 'q(1).', 'q(2).', 'r :- once(true), (fail ; s).', 's.']);

export const GROUPS = ['Optimising', 'Analysing', 'Synthesising', 'AIOC', 'Views'];

export const ALGORITHMS = [
  {
    id: 'optimise', group: 'Optimising', title: 'Optimise a program (optimise.pl)',
    about: 'The overall optimise command: PLOp, then AIOC simplification, then Detlog, each kept only when mnns\'s proof checker accepts it.',
    pseudocode: [
      ['parse', 'read the program into the shared IR'],
      ['size', 'measure its structural size'],
      ['plop', 'PLOp: turn finite generators into loops', 1],
      ['plop', 'keep the result only if the proof is accepted', 2],
      ['simplify', 'simplify: drop true/fail and redundant once/1', 1],
      ['detlog', 'Detlog: compile once/1, remove green cuts', 1],
      ['size', 'measure the size again'],
      ['emit', 'write every clause of the optimised program']
    ],
    input: 'program',
    demos: [
      { name: 'findall over facts', input: { program: findallProgram } },
      { name: 'findall with a filter', input: { program: filterProgram } },
      { name: 'between/3 squares', input: { program: betweenProgram } },
      { name: 'once/1 and cuts', input: { program: onceProgram } },
      { name: 'true and fail to tidy', input: { program: tidyProgram } }
    ]
  },
  {
    id: 'loop2', group: 'Optimising', title: 'findall to loop (loop2)',
    about: 'loop2 converts findall/3 over a finite generator (facts, member/2, select/3, append/3, nth0/3, nth1/3, between/3, length/2), with arithmetic filters, into a deterministic list-copy loop that gives the same answers in the same order.',
    pseudocode: [
      ['parse', 'read the program'],
      ['find', 'find findall(Template, Generator, List)'],
      ['walk', 'for each item the generator gives:', 1],
      ['walk', 'if it passes the filter, add Template to the list', 2],
      ['convert', 'write a loop predicate over the same items'],
      ['convert', 'call the loop instead of findall/3', 1],
      ['check', 'run both programs: the answers must be the same']
    ],
    input: 'program+query',
    demos: [
      { name: 'facts', input: { program: findallProgram, query: 'values(Vs)' } },
      { name: 'facts with a filter', input: { program: filterProgram, query: 'passed(Names)' } },
      { name: 'member/2 with a filter', input: { program: memberProgram, query: 'evens(L)' } },
      { name: 'between/3', input: { program: betweenProgram, query: 'squares(L)' } }
    ]
  },
  {
    id: 'plop', group: 'Optimising', title: 'PLOp with proof checking',
    about: 'PLOp applies conversions only when the independent proof checker accepts the complete, sequential proof. Unsupported or ambiguous cases are left unchanged.',
    pseudocode: [
      ['parse', 'read the program'],
      ['candidates', 'try each supported conversion'],
      ['proof', 'record a proof step for each rewrite', 1],
      ['check', 'check the whole proof independently'],
      ['check', 'change the program only if it is accepted', 1]
    ],
    input: 'program',
    demos: [
      { name: 'findall over facts', input: { program: findallProgram } },
      { name: 'filtered findall', input: { program: filterProgram } },
      { name: 'nothing to convert', input: { program: P(['add(X, Y, Z) :- Z is X + Y.']) } }
    ]
  },
  {
    id: 'detlog', group: 'Analysing', title: 'Detlog: how many answers?',
    about: 'Detlog counts how many times each predicate can succeed when called with unbound arguments: 0, 1 or 2 (two or more). It evaluates ground built-ins and finite member/2, between/3, length/2, nth0/3, nth1/3, append/3 and select/3, and reports what it can\'t analyse instead of guessing.',
    pseudocode: [
      ['parse', 'read the program'],
      ['classify', 'for each predicate:', 1],
      ['classify', 'count its successes (0, 1, 2+) from its clauses', 2],
      ['classify', 'det, semidet, multi, nondet or failing', 2],
      ['report', 'report each class, or "unavailable"']
    ],
    input: 'program',
    demos: [
      { name: 'one, none or many', input: { program: P(['always(_).', 'maybe(a).', 'never(_) :- fail.', 'many(X) :- member(X, [a, b, c]).', 'count(N) :- between(1, 3, N).', 'first(X) :- once(member(X, [a, b])).']) } },
      { name: 'facts', input: { program: P(['colour(red).', 'colour(green).', 'size(big).']) } }
    ]
  },
  {
    id: 'detlog_transform', group: 'Optimising', title: 'Detlog: compiling once/1 and cuts',
    about: 'Detlog lowers once/1 over pure built-ins to if-then-else, removes a green cut after deterministic built-ins in a single-clause predicate, and lowers a terminal cut after a guard to committed if-then-else. Each rewrite becomes a proof step that the checker repeats.',
    pseudocode: [
      ['parse', 'read the program'],
      ['rewrite', 'for each once/1 or cut Detlog supports:', 1],
      ['rewrite', 'rewrite it as if-then-else (or remove it)', 2],
      ['check', 'check the rewrites as a proof']
    ],
    input: 'program',
    demos: [
      { name: 'once/1 and a cut', input: { program: onceProgram } },
      { name: 'a cut in two clauses (kept)', input: { program: P(['max(X, Y, X) :- X >= Y, !.', 'max(_, Y, Y).']) } }
    ]
  },
  {
    id: 'pid', group: 'Analysing', title: 'PID: recursion, measures, induction',
    about: 'PID finds recursive predicates from the call graph, looks for a measure every recursive call decreases (a strict subterm, or a guarded natural number), writes induction obligations, and checks tail recursion. These analyses are not full termination proofs.',
    pseudocode: [
      ['parse', 'build the call graph'],
      ['recursion', 'predicates in a cycle are recursive'],
      ['measure', 'find a decreasing measure for each cycle'],
      ['induction', 'write induction obligations, clause by clause'],
      ['tail', 'mark tail-recursive predicates']
    ],
    input: 'program',
    demos: [
      { name: 'lists and naturals', input: { program: P(['len([], 0).', 'len([_|T], N) :- len(T, N0), N is N0 + 1.', 'last([X], X).', 'last([_|T], X) :- last(T, X).', 'countdown(0).', 'countdown(N) :- integer(N), N > 0, M is N - 1, countdown(M).']) } },
      { name: 'even and odd', input: { program: P(['even(0).', 'even(N) :- integer(N), N > 0, M is N - 1, odd(M).', 'odd(N) :- integer(N), N > 0, M is N - 1, even(M).']) } }
    ]
  },
  {
    id: 's2a', group: 'Synthesising', title: 'Spec to algorithm (S2A)',
    about: 'From two or more input/output examples, s2a/4 finds an input part shared with every output (a projection), or an exact integer affine, quadratic or cubic relation. With "allow a table" it may fall back to a lookup table. The candidates reproduce the examples; they have no formal proof.',
    pseudocode: [
      ['examples', 'take the examples A -> B'],
      ['s2a', 'look for a part of A in every B, or a polynomial'],
      ['program', 'write the program'],
      ['check', 'run it on every example']
    ],
    input: 'examples',
    demos: [
      { name: 'take a part', input: { name: 'contents', examples: [['box(red, [5,6])', '[5,6]'], ['box(blue, [7,8])', '[7,8]']] } },
      { name: 'affine', input: { name: 'f', examples: [['1', '5'], ['2', '7'], ['4', '11']] } },
      { name: 'quadratic', input: { name: 'sq', examples: [['1', '1'], ['2', '4'], ['3', '9'], ['5', '25']] } },
      { name: 'reverse (too hard for s2a)', input: { name: 'rev', examples: [['[1,2]', '[2,1]'], ['[3,4,5]', '[5,4,3]']] } }
    ]
  },
  {
    id: 's2a2', group: 'Synthesising', title: 'S2A2 bridge',
    about: 'When s2a/4 finds nothing, the bridge asks S2A2\'s io_synth for a program (lists, recursion, invented helper predicates) and returns it in mnns\'s IR. Given a reference program, it also proves the two equal for every input of their types (induction_equivalence), and mnns\'s checker re-proves that with its own copy of the prover. On 12 shared tasks s2a/4 solves 4 and S2A2 all 12. Needs S2A2 (set its folder in Settings).',
    pseudocode: [
      ['examples', 'take the examples A -> B'],
      ['s2a', 'try mnns\'s s2a/4 first'],
      ['program', 'if it finds nothing, ask S2A2\'s io_synth', 1],
      ['proof', 'with a reference: prove them equal by induction', 1],
      ['proof', 'mnns\'s checker re-proves the proof', 2],
      ['check', 'run the program on every example']
    ],
    input: 'examples',
    demos: [
      { name: 'reverse a list', input: { name: 'rev', examples: [['[1,2]', '[2,1]'], ['[3,4,5]', '[5,4,3]'], ['[]', '[]']] } },
      { name: 'evens, proved against a reference', input: { name: 'evens', examples: [['[1,2,3,4]', '[2,4]'], ['[5,6]', '[6]'], ['[7]', '[]'], ['[-2,1]', '[-2]']], reference: P(['r([], []).', 'r([X|Xs], R) :- ( X mod 2 =:= 0 -> R = [X|R1] ; R = R1 ), r(Xs, R1).']) } },
      { name: 'length', input: { name: 'len', examples: [['[]', '0'], ['[a]', '1'], ['[a,b,c]', '3']] } },
      { name: 'solved by s2a already', input: { name: 'f', examples: [['1', '5'], ['2', '7'], ['4', '11']] } }
    ]
  },
  {
    id: 's2a2_optimise', group: 'Optimising', title: 'S2A2: learn and apply an optimisation',
    about: 'S2A2 learns an optimisation algorithm (operators, with conditions) from before/after pairs of programs, applies it to a new program, and its prover checks the targets give the same answers over every set of input facts. The result carries an edb_equivalence proof, which mnns\'s checker repeats with its own copy of S2A2\'s prover. Needs S2A2.',
    pseudocode: [
      ['pairs', 'take the before/after pairs'],
      ['learn', 'learn operators and conditions that explain them'],
      ['apply', 'apply them to a new program'],
      ['prove', 'prove the targets\' answers unchanged (every input)'],
      ['check', 'mnns\'s checker repeats the edb_equivalence proof']
    ],
    input: 'pairs',
    demos: [
      { name: 'unfold a wrapper', input: {
        pairs: [
          { name: 'col', targets: '[col/1]', before: P(['colour(red).', 'colour(blue).', 'q(X) :- colour(X).', 'col(X) :- q(X).']), after: P(['colour(red).', 'colour(blue).', 'q(X) :- colour(X).', 'col(X) :- colour(X).']) },
          { name: 'big', targets: '[big/1]', before: P(['size(s1).', 'size(s2).', 'size(s3).', 's(Y) :- size(Y).', 'big(Y) :- s(Y).']), after: P(['size(s1).', 'size(s2).', 'size(s3).', 's(Y) :- size(Y).', 'big(Y) :- size(Y).']) }
        ],
        name: 'conn', targets: '[conn/2]', program: P(['edge(a, b).', 'edge(b, c).', 'e(U, V) :- edge(U, V).', 'conn(U, V) :- e(U, V).'])
      } }
    ]
  },
  {
    id: 's2a2_derive', group: 'Synthesising', title: 'S2A2: derive a faster program',
    about: 'S2A2\'s fold.pl turns a clear specification into a faster program (an accumulator, a tupled or fused program, or a deforested one) by unfolding, folding and proving lemmas. It keeps one only when verify/5 finds it total and the specification functional, so they agree on every input of the mode. mnns\'s checker repeats the derivation (fold_derivation). Needs S2A2.',
    pseudocode: [
      ['spec', 'take the specification and its mode'],
      ['derive', 'choose a strategy; unfold, fold, prove lemmas'],
      ['verify', 'check total and functional; a bounded check'],
      ['check', 'mnns\'s checker repeats the derivation'],
      ['run', 'run both on sample inputs']
    ],
    input: 'derive',
    demos: [
      { name: 'sum with an accumulator', input: { name: 'sum', mode: '[in(list(int)), out]', bound: '', samples: '[[1,2,3], [], [10,-4]]', program: P(['sum([], 0).', 'sum([H|T], S) :- sum(T, S1), S is S1 + H.']) } },
      { name: 'flatten without append', input: { name: 'flat2', mode: '[in(list(list(any))), out]', bound: '3', samples: '[[[1,2],[3]], [[], [a]]]', program: P(['flat2([], []).', 'flat2([L|Ls], F) :- flat2(Ls, F0), app(L, F0, F).', 'app([], A, A).', 'app([X|Xs], B, [X|C]) :- app(Xs, B, C).']) } }
    ]
  },
  {
    id: 'algebraplop', group: 'Synthesising', title: 'AlgebraPLOp: sequence formulas',
    about: 'AlgebraPLOp recognises constant, affine, quadratic, higher-degree integer polynomial and integer-base geometric sequences, checks every sample, evaluates the formula at new positions and, where it can, finds the position of a value.',
    pseudocode: [
      ['samples', 'take the samples at positions 0, 1, 2, ...'],
      ['differences', 'take differences (or ratios)'],
      ['formula', 'fit the formula and check every sample'],
      ['evaluate', 'evaluate it at the next positions'],
      ['invert', 'find the position of a value']
    ],
    input: 'sequence',
    demos: [
      { name: 'odd numbers', input: { sequence: '1, 3, 5, 7, 9', value: '21' } },
      { name: 'squares', input: { sequence: '0, 1, 4, 9, 16, 25', value: '' } },
      { name: 'powers of two', input: { sequence: '1, 2, 4, 8, 16', value: '1024' } },
      { name: 'cubes', input: { sequence: '0, 1, 8, 27, 64', value: '' } },
      { name: 'Fibonacci (no formula)', input: { sequence: '1, 1, 2, 3, 5, 8, 13', value: '' } }
    ]
  },
  {
    id: 'qi', group: 'Optimising', title: 'Quantum-inspired search',
    about: 'Compares the original program with proof-checked whole-program and per-predicate PLOp candidates, updating amplitudes deterministically from a seed, and can export a schematic OpenQASM 3 selection register. It does not run quantum circuits.',
    pseudocode: [
      ['parse', 'read the program'],
      ['candidates', 'make proof-checked candidates'],
      ['amplitude', 'for each proposal: update the amplitudes', 1],
      ['select', 'select the best; export OpenQASM']
    ],
    input: 'program+seed',
    demos: [
      { name: 'findall over facts', input: { program: findallProgram, seed: '17' } },
      { name: 'two findalls', input: { program: P([findallProgram, 'pairs(Ps) :- findall(X-Y, (num(X), num(Y), X < Y), Ps).']), seed: '7' } }
    ]
  },
  {
    id: 'aioc_compile', group: 'AIOC', title: 'AIOC: decision trees and grammars',
    about: 'Data-only decision trees, context-free grammars and DCGs compile into the shared IR, each with a canonical-translation proof that the checker accepts independently.',
    pseudocode: [
      ['source', 'take the tree or grammar as data'],
      ['compile', 'compile each branch or production to a clause'],
      ['check', 'check the translation proof']
    ],
    input: 'grammar',
    demos: [
      { name: 'decision tree', input: { kind: 'dtree', name: 'classify', source: 'dtree(integer(Input), dtree(Input < 0, leaf(negative), dtree(Input =:= 0, leaf(zero), leaf(positive))), leaf(non_integer))' } },
      { name: 'balanced a…b (CFG)', input: { kind: 'cfg', name: 'balanced', source: 'cfg(s, [rule(s, [terminal(a), nonterminal(s), terminal(b)]), rule(s, [])])' } },
      { name: 'a x b (DCG)', input: { kind: 'dcg', name: 'parser', source: 'dcg(s, [(s --> [a], item, [b]), (item --> [x])])' } }
    ]
  },
  {
    id: 'aioc_allocate', group: 'AIOC', title: 'AIOC: dividing budgets',
    about: 'The resource allocator divides time, memory, workers, depth, data and effort between candidates in proportion to their assessment and cost (and amplitude, when quantum-inspired). It plans whole-number shares only.',
    pseudocode: [
      ['candidates', 'take the candidates and budgets'],
      ['weights', 'weigh each candidate'],
      ['divide', 'divide each budget by weight, in whole units']
    ],
    input: 'allocation',
    demos: [
      { name: 'two candidates', input: { quantum: 'off', candidates: [{ name: 'alpha', assessment: 2, cost: 0, amplitude: 0 }, { name: 'beta', assessment: 0, cost: 0, amplitude: 0 }], budgets: [{ resource: 'time', amount: 11 }, { resource: 'workers', amount: 3 }] } },
      { name: 'three, quantum-inspired', input: { quantum: 'inspired', candidates: [{ name: 'original', assessment: 1, cost: 2, amplitude: 1 }, { name: 'loop', assessment: 3, cost: 1, amplitude: 2 }, { name: 'table', assessment: 2, cost: 3, amplitude: 1 }], budgets: [{ resource: 'time', amount: 100 }, { resource: 'memory', amount: 64 }, { resource: 'workers', amount: 4 }] } }
    ]
  },
  {
    id: 'aioc_simplify', group: 'AIOC', title: 'AIOC: simplify and measure',
    about: 'The simplifier removes explicit true conjuncts and fail disjuncts and collapses once(true) and once(fail), checking each rewrite; the size metric counts clauses, goals, predicates and term nodes.',
    pseudocode: [
      ['parse', 'read and measure the program'],
      ['simplify', 'remove true/fail, collapse once(true)/once(fail)'],
      ['check', 'check each rewrite; measure again']
    ],
    input: 'program',
    demos: [
      { name: 'true, fail and once', input: { program: tidyProgram } },
      { name: 'already tidy', input: { program: findallProgram } }
    ]
  },
  {
    id: 'starlog', group: 'Views', title: 'Starlog view',
    about: 'Starlog writes values as expressions: : joins strings, & joins lists and • joins atoms. mnns turns them into predicate calls (string_concat/3, append/3, atom_concat/3) and back.',
    pseudocode: [
      ['parse', 'read the Starlog'],
      ['to_ir', 'turn each expression into a predicate call'],
      ['back', 'and back to the Starlog view']
    ],
    input: 'program',
    demos: [
      { name: 'strings, lists and atoms', input: { program: P(['greet(S) :- S is "hello" : " world".', 'both(L) :- L is [a] & [b].', 'name(A) :- A is hello • world.']) } }
    ]
  }
];

export const byId = (id) => ALGORITHMS.find((a) => a.id === id);

// The JSON request the driver reads, from an algorithm and its input (as the forms hold it).
export function request(algorithm, input) {
  const a = byId(algorithm);
  if (!a) throw new Error(`no algorithm ${algorithm}`);
  let i = { ...input };
  if (a.input === 'examples') i.examples = (input.examples ?? []).filter(([x, y]) => String(x).trim() && String(y).trim()).map(([x, y]) => ({ input: String(x).trim(), output: String(y).trim() }));
  if (a.input === 'sequence') i.sequence = String(input.sequence ?? '').split(/[\s,]+/).filter(Boolean).map(Number);
  return { algorithm, input: i };
}

// Checks an input before running it; returns a message, or '' when it can run.
export function problem(algorithm, input) {
  const a = byId(algorithm);
  if (a.input.startsWith('program') && !String(input.program ?? '').trim()) return 'Write a program first.';
  if (a.input === 'examples') {
    const rows = request(algorithm, input).input.examples;
    if (rows.length < 1) return 'Give at least one example (two or more for s2a).';
    if (!/^[a-z][a-zA-Z0-9_]*$/.test(input.name ?? '')) return 'The name must start with a lower-case letter (letters, digits and _).';
  }
  if (a.input === 'sequence') {
    const s = request(algorithm, input).input.sequence;
    if (s.length < 2) return 'Give at least two numbers.';
    if (s.some((n) => !Number.isFinite(n))) return 'The sequence should be numbers separated by commas.';
  }
  if (a.input === 'grammar' && !String(input.source ?? '').trim()) return 'Write the tree or grammar first.';
  if (a.input === 'allocation' && !(input.candidates ?? []).length) return 'Add a candidate.';
  if (a.input === 'pairs') {
    if (!(input.pairs ?? []).length) return 'Add a before/after pair.';
    if (!String(input.program ?? '').trim()) return 'Write the program to apply the algorithm to.';
  }
  if (a.input === 'derive' && !String(input.program ?? '').trim()) return 'Write the specification first.';
  return '';
}
