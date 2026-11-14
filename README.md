# MNN in Action

[mnns](https://github.com/luciangreen/mnns)'s algorithms, animated step by step, in the manner of [Algorithms in Action](https://dl.acm.org/doi/10.1145/3587102.3588827): the pseudocode on the left with the current line highlighted, a picture of what the algorithm is doing on the right, and controls to play, pause and step forwards and back.

Every step comes from running your real mnns through SWI-Prolog (in LucianOS). Nothing is simulated in the browser.

## The algorithms

| Group | Algorithm | What you see |
|---|---|---|
| Optimising | **Optimise a program** (`optimise.pl`) | The program after each stage (PLOp, AIOC simplify, Detlog), the changes marked, and its size before and after |
| | **findall to loop** (loop2) | The generator's items going through the filter into the list, the loop predicate written, and both programs' answers compared in the sandbox |
| | **PLOp with proof checking** | Each proof step, then the independent checker's verdict |
| | **Detlog: compiling once/1 and cuts** | Each rewrite, then the proof check |
| | **Quantum-inspired search** | Candidates' amplitudes rising and falling, update by update, with the evidence for and against; the selected program and its OpenQASM 3 register |
| Analysing | **Detlog: how many answers?** | Each predicate's success counts (0, 1, 2+) and class |
| | **PID** | The call graph with recursive predicates marked, measures, induction obligations and tail calls |
| Synthesising | **Spec to algorithm** (S2A) | The examples, the program found, and a check on every example |
| | **S2A2 bridge** | s2a/4 first, then S2A2's io_synth (lists, recursion, helpers), checked on every example |
| | **AlgebraPLOp** | The differences table, the formula checked on every sample, the next values, and the position of a value |
| AIOC | **Decision trees and grammars** | The tree drawn (or the grammar), the IR it compiles to, and the translation proof |
| | **Dividing budgets** | Candidates, weights, and each budget's whole-number shares |
| | **Simplify and measure** | The rewrites, their proof, and the size before and after |
| Views | **Starlog** | Expressions turned into predicate calls and back |

Each algorithm has **demos** and **custom data**: your own program, examples, sequence, tree or grammar, or candidates and budgets.

## Running it

MNN in Action is a LucianOS app. The suite installer (`lucianoffice/scripts/install.sh`) puts it in `lucianos/apps/mnnaction`, mnns and S2A2 beside lucianos, and it opens from the desktop like the other apps.

- **Settings (⚙):** the mnns folder and the S2A2 folder, from your home folder. They default to `Dropbox/GitHub-private2/mnns` and `Dropbox/GitHub-private2/S2A2`.
- **Requirements:** SWI-Prolog (`swipl`) on the computer running LucianOS, with `swipl` in `allowedCommands` in LucianOS's `config.json` (as for the other Prolog apps). Each run writes a copy of the driver to `~/.mnnaction/mnnaction.pl` for swipl to load.
- **Outside LucianOS** (opened as a plain page, or on a phone away from your computer), the demos play runs recorded from the real mnns (`demos/recorded.json`). Custom data needs LucianOS.

The Prolog driver can also be run on its own:

```sh
echo '{"algorithm":"algebraplop","input":{"sequence":[1,3,5,7]}}' | \
  swipl -q -g mnnaction_main -s prolog/mnnaction.pl -- ../mnns ../S2A2
```

It reads one line of JSON (`algorithm` and `input`) and writes the steps as JSON: each names its pseudocode line (`at`), says what happened (`note`), and carries what to draw (`program`, `before`, `table`, `bars`, `items`, `flow`, `tree`, `graph`, `differences`, `code`, `check`).

## Tests

- `npm test`: the algorithm definitions, inputs and drawing helpers.
- `npm run demos`: runs every demo on real mnns (`MNNS_DIR` and `S2A2_DIR` say where they are) and writes `demos/recorded.json`. CI does this on every push, against the latest mnns and S2A2.
