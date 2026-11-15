/*  mnnaction.pl -- runs one mnns algorithm and writes the steps to animate, as JSON.

    swipl -q -g mnnaction_main -s prolog/mnnaction.pl -- MNNS_DIR [S2A2_DIR]

    Reads one line of JSON from standard input:
        {"algorithm": "optimise", "input": {...}}
    and writes one JSON object:
        {"ok": true, "algorithm": ..., "steps": [Step, ...], "result": {...}}
    or {"ok": false, "error": "..."}.

    Each step names the pseudocode line it is at ("at"), says what happened ("note"), and
    carries what to draw: "program" (clauses), "before" (the program it changed), "items"
    (lines), "table" ({head, rows}), "bars" ([{label, value}]), "tree", "code", "check".
    Everything comes from running the real mnns predicates; where a step shows Prolog
    running a program (a generator's items, a program's answers), mnns's sandboxed runner
    does the running.
*/

:- use_module(library(http/json)).
:- use_module(library(readutil)).
:- use_module(library(lists)).
:- use_module(library(apply)).
:- use_module(library(yall)).
:- use_module(library(time)).

:- dynamic mnns_dir/1, s2a2_dir/1.

mnnaction_main :-
    current_prolog_flag(argv, Argv),
    ( Argv = [Mnns | Rest] -> true ; Mnns = '../mnns', Rest = [] ),
    absolute_file_name(Mnns, MnnsAbs, [file_type(directory)]),
    assertz(mnns_dir(MnnsAbs)),
    ( Rest = [S2A2 | _], S2A2 \== '' -> absolute_file_name(S2A2, S2Abs), assertz(s2a2_dir(S2Abs)) ; true ),
    load_mnns,
    read_line_to_string(user_input, Line),
    catch(( atom_json_dict(Line, Request, []), run_request(Request, Reply) ),
          E, ( error_text(E, Msg), Reply = _{ok: false, error: Msg} )),
    json_write_dict(current_output, Reply, [width(0)]),
    nl,
    halt(0).

load_mnns :-
    mnns_dir(D),
    forall(member(M, ['prolog/ir/ir', 'prolog/runner/sandbox_runner', 'prolog/proof/proof_checker',
                      'prolog/optimise/optimise', 'prolog/loop2/loop2', 'prolog/plop/plop',
                      'prolog/detlog/detlog', 'prolog/detlog/detlog_transform', 'prolog/pid/pid',
                      'prolog/s2a/s2a', 'prolog/s2a/s2a2_bridge', 'prolog/algebraplop/algebraplop',
                      'prolog/quantum/qi_search', 'prolog/starlog/starlog',
                      'prolog/aioc/size', 'prolog/aioc/simplify', 'prolog/aioc/dtree', 'prolog/aioc/cfg',
                      'prolog/aioc/dcg', 'prolog/aioc/allocate', 'prolog/aioc/cycle']),
           ( atomic_list_concat([D, '/', M], F), use_module(F) )).

run_request(Request, Reply) :-
    atom_string(Alg, Request.algorithm),
    ( get_dict(input, Request, In) -> true ; In = _{} ),
    catch(( call_with_time_limit(60, algorithm(Alg, In, Steps, Result)) -> Outcome = done ; Outcome = failed ),
          E, Outcome = error(E)),
    (   Outcome == done
    ->  Reply = _{ok: true, algorithm: Alg, steps: Steps, result: Result}
    ;   Outcome = error(E1)
    ->  error_text(E1, Msg), Reply = _{ok: false, algorithm: Alg, error: Msg}
    ;   format(string(Msg), "mnns found nothing to show for this input (~w).", [Alg]),
        Reply = _{ok: false, algorithm: Alg, error: Msg}
    ).

error_text(time_limit_exceeded, "It took longer than 60 seconds, so it was stopped.") :- !.
error_text(error(syntax_error(What), Where), S) :- !, format(string(S), "Syntax error: ~w (~w)", [What, Where]).
error_text(error(Formal, _), S) :- !, show(Formal, S).
error_text(E, S) :- show(E, S).

% ------------------------------------------------------------------ helpers

% A term as text, with variables named A, B, ...
show(T, S) :-
    copy_term(T, T1),
    numbervars(T1, 0, _, [singletons(true)]),
    format(string(S), "~W", [T1, [quoted(true), numbervars(true), portray(true), spacing(next_argument), max_depth(0)]]).

shows(Ts, Ss) :- maplist(show, Ts, Ss).

% A program's clauses as Prolog text, one string each.
clauses(mnn_program(_, _, Preds, _, _), Cs) :-
    findall(C, ( member(mnn_pred(_, _, _, Clauses, _), Preds),
                 member(mnn_clause(_, H, B, _), Clauses),
                 clause_text(H, B, C) ), Cs).
clause_text(H, B, S) :-
    ( catch(mnn_ir:prolog_body(B, G), _, fail) -> true ; G = B ),
    ( G == true -> T = H ; T = (H :- G) ),
    copy_term(T, T1),
    with_output_to(string(S0), portray_clause(T1)),
    split_string(S0, "", "\n ", [S]).

% Program text -> an mnns program (through a file, as mnns reads files).
program_file(Text, File) :-
    tmp_file(mnnaction, F0), atom_concat(F0, '.pl', File),
    setup_call_cleanup(open(File, write, S, [encoding(utf8)]), write(S, Text), close(S)).
program_from_text(Text, P) :-
    program_file(Text, File),
    call_cleanup(mnn_ir:parse_program(File, P), delete_file(File)).

text(In, Key, Default, Text) :- ( get_dict(Key, In, V), V \== "" -> Text = V ; Text = Default ).
term(In, Key, Default, T) :-
    ( get_dict(Key, In, V), V \== "" -> term_string(T, V) ; T = Default ).

size_bars(program_size(clauses(C), goals(G), predicates(P), term_nodes(N), weighted_total(T)),
          [_{label: "clauses", value: C}, _{label: "goals", value: G}, _{label: "predicates", value: P},
           _{label: "term nodes", value: N}, _{label: "total", value: T}]).

step(At, Note, Extra, Step) :- put_dict(_{at: At, note: Note}, Extra, Step).

% Runs Goal against the program text in mnns's sandbox; the answers, as text.
sandbox_answers(Text, Goal, Max, Answers) :-
    program_file(Text, File),
    call_cleanup(
        ( catch(mnn_sandbox_runner:run_program(File, Goal, [max_answers(Max)], R), E, R = error(E)) ),
        delete_file(File)),
    ( R = answers(As) -> shows(As, Answers) ; show(R, A), Answers = [A] ).

% The first findall/3 in a program's clauses: Template, Goal (from the text, as Prolog reads it).
first_findall(Text, Template, Goal) :-
    open_string(Text, S),
    read_all(S, Terms),
    member(T, Terms), T = (_ :- Body),
    sub_term(findall(Template, Goal, _), Body), !.
read_all(S, Ts) :- read_term(S, T, []), ( T == end_of_file -> Ts = [] ; Ts = [T | R], read_all(S, R) ).

% Splits a findall goal into its generator and a filter (the goals after the first).
generator_filter((G, F), G, F) :- !.
generator_filter(G, G, true).

% The generator's items and whether each passes the filter, run in the sandbox.
items_through_filter(Text, Template, Goal, Rows) :-
    generator_filter(Goal, Gen, Filter),
    Helper0 = ('$mnnaction_item'(Template, Ok0) :- Gen, ( Filter -> Ok0 = yes ; Ok0 = no )),
    with_output_to(string(Helper), portray_clause(Helper0)),
    atomic_list_concat([Text, "\n", Helper], Text1),
    program_file(Text1, File),
    call_cleanup(( catch(mnn_sandbox_runner:run_program(File, '$mnnaction_item'(X, Ok), [max_answers(40)], R), _, R = none) ),
                 delete_file(File)),
    ( R = answers(As) -> findall([XS, OkS], ( member([X1, Ok1], As), show(X1, XS), show(Ok1, OkS) ), Rows)
    ; Rows = [] ),
    ignore((X = x, Ok = x)).

% ------------------------------------------------------------------ the algorithms

%  1. optimise.pl: the whole pipeline, stage by stage
algorithm(optimise, In, Steps, _{changed: Changed, line: Line, program: C3}) :-
    text(In, program, "", Text),
    program_from_text(Text, P0), clauses(P0, C0),
    mnn_aioc_size:measure_program_size(P0, S0), size_bars(S0, B0),
    mnn_optimise:plop_stage(P0, P1, plop(PS, PE)), clauses(P1, C1), shows(PE, PEs),
    mnn_optimise:simplify_stage(P1, P2, simplify(SC)), clauses(P2, C2),
    mnn_optimise:detlog_stage(P2, P3, detlog(DS, DSteps)), clauses(P3, C3), shows(DSteps, DSs),
    mnn_aioc_size:measure_program_size(P3, S3), size_bars(S3, B3),
    mnn_optimise:optimise_report_line(optimise_report([plop(PS, PE), simplify(SC), detlog(DS, DSteps)], size(S0, S3)), Line),
    ( sub_string(Line, _, _, _, "changed=true") -> Changed = true ; Changed = false ),
    show(PS, PSs), show(SC, SCs), show(DS, DSs0),
    step(parse, "Read the program into mnns's shared IR (each clause keeps its place).", _{program: C0}, St1),
    step(size, "Measure its structural size before optimising.", _{program: C0, bars: B0}, St2),
    format(string(N3), "PLOp converts finite generators (findall over facts, member/2, between/3, ...) into loops, and keeps the result only if the proof checker accepts it: ~w.", [PSs]),
    step(plop, N3, _{program: C1, before: C0, items: PEs, check: PSs}, St3),
    format(string(N4), "AIOC's simplifier removes true conjuncts, fail disjuncts and redundant once/1 wrappers, checking each rewrite: ~w change(s).", [SCs]),
    step(simplify, N4, _{program: C2, before: C1, check: SCs}, St4),
    format(string(N5), "Detlog compiles once/1 and removes green cuts where it can prove them safe: ~w.", [DSs0]),
    step(detlog, N5, _{program: C3, before: C2, items: DSs, check: DSs0}, St5),
    step(size, "Measure the size again.", _{program: C3, bars: B3, compare: B0}, St6),
    step(emit, Line, _{program: C3, before: C0}, St7),
    Steps = [St1, St2, St3, St4, St5, St6, St7].

%  2. loop2: findall/3 over a finite generator becomes a deterministic loop
algorithm(loop2, In, Steps, _{same: Same, original: OA, converted: CA}) :-
    text(In, program, "", Text), text(In, query, "", QText),
    program_from_text(Text, P0), clauses(P0, C0),
    ( first_findall(Text, Template, Goal) -> show(findall(Template, Goal, '_'), FS), items_through_filter(Text, Template, Goal, Rows) ; FS = "(no findall/3 found)", Rows = [] ),
    mnn_loop2:convert_program(P0, P1, Report), clauses(P1, C1), show(Report, RS),
    step(parse, "Read the program.", _{program: C0}, S1),
    format(string(N2), "Find the findall/3 to convert: ~w", [FS]),
    step(find, N2, _{program: C0, code: FS}, S2),
    findall(S, ( nth1(I, Rows, [X, Ok]),
                 ( Ok == "yes" -> format(string(Nt), "Item ~d from the generator: ~w passes the filter, so it goes into the list.", [I, X])
                 ;  format(string(Nt), "Item ~d from the generator: ~w fails the filter, so it is skipped.", [I, X]) ),
                 step(walk, Nt, _{flow: _{items: Rows, at: I}}, S) ), WalkSteps0),
    ( WalkSteps0 == [] -> step(walk, "The generator has no items to walk through here.", _{}, W0), WalkSteps = [W0] ; WalkSteps = WalkSteps0 ),
    step(convert, "Write a loop predicate that copies the same items in the same order, and call it instead.", _{program: C1, before: C0, items: [RS]}, S4),
    ( QText \== "" -> term_string(Q, QText) ; first_head_query(P0, Q) ),
    show(Q, QS),
    clauses_text(C1, Text1),
    sandbox_answers(Text, Q, 20, OA), sandbox_answers(Text1, Q, 20, CA),
    ( OA == CA -> Same = true, Ck = "same answers" ; Same = false, Ck = "different answers" ),
    format(string(N5), "Run ~w on both programs in the sandbox: ~w.", [QS, Ck]),
    step(check, N5, _{table: _{head: ["original", "converted"], rows: [[OA, CA]]}, check: Ck}, S5),
    append([[S1, S2], WalkSteps, [S4, S5]], Steps).

clauses_text(Cs, Text) :- atomic_list_concat(Cs, '\n', T0), string_concat(T0, "\n", Text).
% a query for the program's last predicate, with fresh variables
first_head_query(mnn_program(_, _, Preds, _, _), Q) :-
    last(Preds, mnn_pred(Name/Arity, _, _, _, _)), functor(Q, Name, Arity).

%  3. PLOp: conversions kept only with a checked proof
algorithm(plop, In, Steps, _{status: SS, steps: PSs}) :-
    text(In, program, "", Text),
    program_from_text(Text, P0), clauses(P0, C0),
    mnn_plop:optimize_program(P0, P1, plop_report(Applied, Proof, Status)), clauses(P1, C1),
    show(Status, SS), shows(Applied, As),
    ( Proof = proof(PSteps) -> true ; PSteps = [] ), shows(PSteps, PSs),
    step(parse, "Read the program.", _{program: C0}, S1),
    step(candidates, "Try each supported conversion (finite generators to loops).", _{program: C0, items: As}, S2),
    findall(S, ( nth1(I, PSs, P), format(string(N), "Proof step ~d: ~w", [I, P]),
                 step(proof, N, _{items: PSs, current: I}, S) ), ProofSteps),
    format(string(N4), "The independent proof checker re-checks the whole sequence: ~w. The program is changed only when it accepts.", [SS]),
    step(check, N4, _{program: C1, before: C0, check: SS}, S4),
    append([[S1, S2], ProofSteps, [S4]], Steps).

%  4. Detlog: how many answers can each predicate give?
algorithm(detlog, In, Steps, _{rows: Rows}) :-
    text(In, program, "", Text),
    program_from_text(Text, P0), clauses(P0, C0),
    mnn_detlog:analyze_determinism(P0, detlog_report(Items)),
    findall([PI, Cl, Cn], ( member(predicate(N/A, _, determinism(Class), success_counts(Counts)), Items),
                            format(string(PI), "~w/~w", [N, A]), show(Class, Cl), show(Counts, Cn) ), Rows),
    step(parse, "Read the program. Each predicate is called with all its arguments unbound.", _{program: C0}, S1),
    findall(S, ( nth1(I, Rows, [PI, Cl, Cn]),
                 format(string(Nt), "~w can succeed ~w time(s): ~w.", [PI, Cn, Cl]),
                 I1 is I, length(Done, I1), append(Done, _, Rows),
                 step(classify, Nt, _{program: C0, table: _{head: ["predicate", "determinism", "success counts"], rows: Done}, focus: PI}, S) ), Ss),
    step(report, "Counts are 0, 1 or 2 (two or more). Goals Detlog can't analyse are reported, not guessed.", _{table: _{head: ["predicate", "determinism", "success counts"], rows: Rows}}, S9),
    append([[S1], Ss, [S9]], Steps).

%  5. Detlog's transform: once/1 and cuts compiled to if-then-else
algorithm(detlog_transform, In, Steps, _{events: Es}) :-
    text(In, program, "", Text),
    program_from_text(Text, P0), clauses(P0, C0),
    mnn_detlog_transform:transform_program(P0, P1, detlog_transform_report(Events)), clauses(P1, C1),
    shows(Events, Es),
    mnn_optimise:detlog_proof_steps(Events, 1, PSteps),
    ( PSteps == [] -> Verdict = unchanged ; mnn_proof_checker:check_proof(P1, P0, proof(PSteps), Verdict) ),
    show(Verdict, VS),
    step(parse, "Read the program.", _{program: C0}, S1),
    findall(S, ( nth1(I, Es, E), format(string(N), "Rewrite ~d: ~w", [I, E]), step(rewrite, N, _{program: C0, items: Es, current: I}, S) ), RSteps),
    ( RSteps == [] -> step(rewrite, "Nothing here that Detlog can compile (once/1 over pure built-ins, or a cut after a deterministic guard).", _{program: C0}, R0), RSteps1 = [R0] ; RSteps1 = RSteps ),
    format(string(N3), "The proof checker re-checks the rewrites: ~w.", [VS]),
    step(check, N3, _{program: C1, before: C0, check: VS}, S3),
    append([[S1], RSteps1, [S3]], Steps).

%  6. PID: recursion, measures, induction obligations and tail calls
algorithm(pid, In, Steps, _{classes: Cls}) :-
    text(In, program, "", Text),
    program_from_text(Text, P0), clauses(P0, C0),
    mnn_pid:analyze_program(P0, pid_report(Classes)),
    catch(mnn_pid:analyze_measures(P0, Measures), _, Measures = unavailable),
    catch(mnn_pid:analyze_induction(P0, Induction), _, Induction = unavailable),
    catch(mnn_pid:analyze_tail_recursion(P0, Tail), _, Tail = unavailable),
    findall([PI, Cl], ( member(predicate(N/A, Class), Classes), format(string(PI), "~w/~w", [N, A]), show(Class, Cl) ), Cls),
    call_graph(P0, Nodes, Edges),
    report_items(Measures, MIs), report_items(Induction, IIs), report_items(Tail, TIs),
    step(parse, "Read the program and draw its call graph.", _{program: C0, graph: _{nodes: Nodes, edges: Edges}}, S1),
    step(recursion, "Predicates in a call cycle are recursive.", _{graph: _{nodes: Nodes, edges: Edges, classes: Cls}, table: _{head: ["predicate", "class"], rows: Cls}}, S2),
    step(measure, "Look for a measure that every recursive call decreases (a strict subterm, or a guarded natural number).", _{items: MIs, graph: _{nodes: Nodes, edges: Edges, classes: Cls}}, S3),
    step(induction, "Write the induction obligations: one per clause, with a hypothesis for each recursive call.", _{items: IIs}, S4),
    step(tail, "Check which recursive calls are in tail position.", _{items: TIs}, S5),
    Steps = [S1, S2, S3, S4, S5].

report_items(R, Items) :-
    ( R = unavailable -> Items = ["(not available for this program)"]
    ; R =.. [_, L], is_list(L) -> shows(L, Items)
    ; show(R, S), Items = [S] ).

call_graph(mnn_program(_, _, Preds, _, _), Nodes, Edges) :-
    findall(PI, ( member(mnn_pred(N/A, _, _, _, _), Preds), format(string(PI), "~w/~w", [N, A]) ), Nodes),
    findall([F, T], ( member(mnn_pred(N/A, _, _, Clauses, _), Preds), format(string(F), "~w/~w", [N, A]),
                      member(mnn_clause(_, _, Body, _), Clauses), sub_term(G, Body), callable(G),
                      functor(G, GN, GA), format(string(T), "~w/~w", [GN, GA]), memberchk(T, Nodes) ), E0),
    sort(E0, Edges).

%  7. S2A: from examples to a program
algorithm(s2a, In, Steps, Result) :- spec_algorithm(s2a, In, Steps, Result).
%  8. S2A2 bridge: when s2a/4 finds nothing, S2A2's io_synth
algorithm(s2a2, In, Steps, Result) :- spec_algorithm(s2a2, In, Steps, Result).

spec_algorithm(Which, In, Steps, _{program: Cs, solved_by: By}) :-
    text(In, name, "f", NameS), atom_string(Name, NameS),
    get_dict(examples, In, Examples),
    findall(I-O, ( member(E, Examples), term_string(I, E.input), term_string(O, E.output) ), Pairs),
    Pairs \== [],
    findall([[input, [['A', I]]], [output, [['B', O]]]], member(I-O, Pairs), Spec),
    ( get_dict(table, In, true) -> Opts0 = [allow_table(true)] ; Opts0 = [] ),
    % S2A2 bridge: a reference program to prove the found program equal to
    ( Which == s2a2, text(In, reference, "", RefText), RefText \== "", clause_terms(RefText, RefCs), RefCs = [RC | _]
    -> clause_head(RC, RH), functor(RH, RefName, _), RefOpts = [reference(RefCs, RefName)] ; RefOpts = [] ),
    append(Opts0, RefOpts, Opts1),
    ( s2a2_dir(D) -> Opts = [s2a2_home(D) | Opts1] ; Opts = Opts1 ),
    findall([IS, OS], ( member(I-O, Pairs), show(I, IS), show(O, OS) ), Rows),
    step(examples, "The examples: each input A and the output B it should give.", _{table: _{head: ["A", "B"], rows: Rows}}, S1),
    mnn_s2a:s2a(Name, Spec, Opts0, R0),
    (   R0 = mnn_program(_, _, _, _, _)
    ->  Program = R0, By = s2a,
        step(s2a, "mnns's s2a/4 found a rule: a part of the input shared by every output, or an exact integer polynomial.", _{check: "found"}, S2)
    ;   show(R0, R0S),
        format(string(N2), "mnns's s2a/4 found nothing: ~w.", [R0S]),
        step(s2a, N2, _{check: R0S}, S2),
        (   Which == s2a2
        ->  ( mnn_s2a2:s2a2(Name, Spec, Opts, R1) -> true ; R1 = no_algorithm(s2a2_failed) ),
            ( R1 = mnn_program(_, _, _, _, trace(Tr)), memberchk(s2a2_io_synth(_, Kind, _), Tr) -> show(Kind, KindS) ; KindS = "" ),
            ( R1 = mnn_program(_, _, _, _, _) -> Program = R1, By = s2a2 ; Program = none, By = none, show(R1, R1S) )
        ;   Program = none, By = none, R1S = R0S
        )
    ),
    (   Program \== none
    ->  clauses(Program, Cs),
        ( By == s2a2, KindS \== "" -> format(string(N3), "The program, found by S2A2's io_synth (method: ~w), in mnns's IR:", [KindS]) ; format(string(N3), "The program (found by ~w):", [By]) ),
        step(program, N3, _{program: Cs}, S3),
        proof_steps_for(Which, Program, ProofSteps),
        clauses_text(Cs, PText),
        findall([IS, Want, Got, Ok],
                ( member(I-O, Pairs), show(I, IS), show(O, Want),
                  G =.. [Name, I, Out],
                  sandbox_answers(PText, G, 1, Ans),
                  ( Ans = [A1 | _], sub_string(A1, _, _, _, "[") -> answer_value(A1, Got) ; Got = "(no answer)" ),
                  ( Got == Want -> Ok = "✓" ; Ok = "✗" ), ignore(Out = x) ), Checks),
        step(check, "Run it on every example in the sandbox.", _{table: _{head: ["A", "wanted", "got", ""], rows: Checks}}, S4),
        append([[S1, S2, S3], ProofSteps, [S4]], Steps0)
    ;   ( Which == s2a2 -> format(string(N3), "S2A2 found nothing either: ~w.", [R1S]) ; N3 = "Try the S2A2 bridge for lists, recursion and invented helpers." ),
        step(program, N3, _{}, S3), Cs = [],
        Steps0 = [S1, S2, S3]
    ),
    Steps = Steps0.

% With a reference program, the S2A2 bridge proves the found program equal to it
% (induction_equivalence), and mnns's own checker re-proves the claim.
proof_steps_for(s2a2, Program, [Step]) :-
    Program = mnn_program(_, _, _, Proof, trace(Tr)),
    memberchk(s2a2_reference(RefIR), Tr), !,
    clauses(RefIR, RefCs),
    (   Proof = proof([PS | _])
    ->  show(PS, PSS),
        ( catch(mnn_proof_checker:check_proof(Program, RefIR, Proof, V0), _, V0 = rejected) -> true ; V0 = rejected ),
        show(V0, V),
        format(string(N), "Prove it equals the reference (shown) for every input of its types: ~w. mnns's checker re-proves the claim with its own copy of the prover.", [PSS])
    ;   N = "No proof was found that it equals the reference (shown).", V = "not proved"
    ),
    step(proof, N, _{program: RefCs, check: V}, Step).
proof_steps_for(_, _, []).

% the clauses in a text, as terms
clause_terms(Text, Cs) :- open_string(Text, S), read_all(S, Cs).
clause_head((H :- _), H) :- !.
clause_head(H, H).

% "[[a, 5]]" -> the last value in the first answer
% (each answer lists the values of the goal's variables, here just the output)
answer_value(A, V) :- term_string(T, A), ( T = [X] -> show(X, V) ; is_list(T), last(T, X) -> show(X, V) ; show(T, V) ).

%  9. AlgebraPLOp: a formula for a sequence
algorithm(algebraplop, In, Steps, _{formula: FS, next: Next}) :-
    get_dict(sequence, In, Seq0), maplist([X, N]>>( number(X) -> N = X ; number_string(N, X) ), Seq0, Seq),
    ( get_dict(value, In, V0), V0 \== "" -> ( number(V0) -> V = V0 ; number_string(V, V0) ) ; V = none ),
    differences(Seq, Rows),
    show(Seq, SeqS),
    format(string(N1), "The sequence, from position 0: ~w.", [SeqS]),
    step(samples, N1, _{table: _{head: ["position", "value"], rows: Positions}}, S1),
    findall([P, X], nth0(P, Seq, X), Positions),
    step(differences, "Take differences until they are constant (polynomial) or look for a constant ratio (geometric).", _{differences: Rows}, S2),
    (   mnn_algebraplop:infer_sequence_formula(Seq, F), F \= no_formula, F \= no_formula(_)
    ->  show(F, FS),
        format(string(N3), "AlgebraPLOp's formula, checked on every sample: ~w.", [FS]),
        step(formula, N3, _{check: FS}, S3),
        length(Seq, L), L2 is L + 2,
        findall([P, VS], ( between(L, L2, P), mnn_algebraplop:evaluate_sequence_formula(F, P, R), ( R = value(X) -> show(X, VS) ; show(R, VS) ) ), Next),
        step(evaluate, "Evaluate it at the next positions.", _{table: _{head: ["position", "value"], rows: Next}}, S4),
        (   V \== none
        ->  ( catch(mnn_algebraplop:invert_sequence_formula(F, V, IR), _, fail) -> ( IR = position(Pos) -> format(string(IRS), "position ~w", [Pos]) ; show(IR, IRS) ) ; IRS = "no inverse for this formula" ),
            format(string(N5), "Which position gives ~w? ~w", [V, IRS]),
            step(invert, N5, _{check: IRS}, S5), More = [S5]
        ;   More = []
        ),
        append([[S1, S2, S3, S4], More], Steps)
    ;   FS = "none", Next = [],
        step(formula, "No supported formula fits every sample (constant, affine, polynomial or geometric).", _{check: "no formula"}, S3),
        Steps = [S1, S2, S3]
    ).

differences(Seq, [Row | Rows]) :-
    findall(X, member(X, Seq), Row),
    ( Seq = [_, _ | _], \+ all_equal(Seq) -> diffs(Seq, D), differences(D, Rows) ; Rows = [] ).
diffs([A, B | T], [D | Ds]) :- !, D is B - A, diffs([B | T], Ds).
diffs(_, []).
all_equal([X | T]) :- maplist(==(X), T).

% 10. Quantum-inspired search over proof-checked PLOp candidates
algorithm(qi, In, Steps, _{selected: Sel, qasm: Qasm}) :-
    text(In, program, "", Text),
    ( get_dict(seed, In, Seed0), Seed0 \== "" -> ( number(Seed0) -> Seed = Seed0 ; number_string(Seed, Seed0) ) ; Seed = 17 ),
    program_from_text(Text, P0), clauses(P0, C0),
    mnn_qi_search:qi_search(P0, [seed(Seed)], Best, Report), clauses(Best, CB),
    Report = qi_report(_, _, _, History, selected(Sel0), _, _, rewrites_tried(Tried)),
    show(Sel0, Sel),
    step(parse, "Read the program.", _{program: C0}, S1),
    format(string(N2), "Make the candidates: the original, the whole program through PLOp, and each predicate on its own (~w proposals). Each needs an accepted proof.", [Tried]),
    step(candidates, N2, _{program: C0}, S2),
    qi_steps(History, [], HSteps),
    tmp_file(qasm, QF),
    ( catch(mnn_qi_search:qi_export(P0, qasm, QF), _, fail) -> read_file_to_string(QF, Qasm, []), delete_file(QF) ; Qasm = "" ),
    format(string(N4), "Select the candidate with the highest amplitude (then the lowest cost): ~w. The OpenQASM 3 register below encodes the choice; no quantum circuit is run.", [Sel]),
    last_bars(HSteps, Bars),
    step(select, N4, _{program: CB, before: C0, code: Qasm, bars: Bars, focus: Sel}, S4),
    append([[S1, S2], HSteps, [S4]], Steps).

% one step per history entry, with the amplitudes so far as bars
qi_steps([], _, []).
qi_steps([H | Hs], Bars0, [S | Ss]) :-
    qi_entry(H, Name, Amp, Note),
    show(Name, NameS),
    ( selectchk(_{label: NameS, value: _}, Bars0, Rest) -> true ; Rest = Bars0 ),
    append(Rest, [_{label: NameS, value: Amp}], Bars1),
    step(amplitude, Note, _{bars: Bars1, focus: NameS}, S),
    qi_steps(Hs, Bars1, Ss).

qi_entry(original(Amp, Cost), original, Amp, Note) :- !,
    format(string(Note), "The original program starts with amplitude ~w (from the seed); its cost is ~w.", [Amp, Cost]).
qi_entry(event(Name, _, Verdict, Update, amplitude(Amp), cost(Cost), proof_steps(PS), _, evidence(supporting(For), opposing(Against))), Name, Amp, Note) :- !,
    show(Verdict, VS), show(For, FS), show(Against, AS),
    format(string(Note), "~w: the proof is ~w (~w step(s)), so its amplitude is ~w to ~w. Cost ~w. For: ~w. Against: ~w.", [Name, VS, PS, Update, Amp, Cost, FS, AS]).
qi_entry(E, other, 0, Note) :- show(E, Note).

last_bars(Steps, Bars) :- ( last(Steps, S), get_dict(bars, S, Bars) -> true ; Bars = [] ).

% 11. AIOC: decision trees, CFGs and DCGs compiled to IR with checked proofs
algorithm(aioc_compile, In, Steps, _{verdict: VS}) :-
    text(In, kind, "dtree", Kind), text(In, name, "classify", NameS), atom_string(Name, NameS),
    text(In, source, "", Src),
    term_string(T, Src, [variable_names(Vs)]),
    (   Kind == "dtree"
    ->  ( memberchk('Input' = Input, Vs) -> true ; term_variables(T, [Input | _]) ),
        mnn_aioc_dtree:incorporate_dtree(Name, Input, T, P, Proof), Source = dtree_source(Name, Input, T),
        % drawn with the input's name (a variable met once would otherwise print as _)
        copy_term(Input-T, I2-T2), I2 = '$VAR'('Input'), tree_json(T2, TreeJ), Draw = _{tree: TreeJ}
    ;   Kind == "cfg"
    ->  mnn_aioc_cfg:incorporate_cfg(Name, T, P, Proof), Source = cfg_source(Name, T), Draw = _{items: [Src]}
    ;   mnn_aioc_dcg:incorporate_dcg(Name, T, P, Proof), Source = dcg_source(Name, T), Draw = _{items: [Src]}
    ),
    clauses(P, Cs),
    ( catch(mnn_proof_checker:check_proof(P, Source, Proof, Verdict), _, Verdict = rejected) -> true ; Verdict = rejected ),
    show(Verdict, VS),
    kind_name(Kind, KindName),
    format(string(N1), "The ~w, as data.", [KindName]),
    step(source, N1, Draw, S1),
    step(compile, "Compile it to mnns's shared IR, one clause per branch or production.", _{program: Cs}, S2),
    format(string(N3), "The proof checker confirms the IR is the canonical translation: ~w.", [VS]),
    step(check, N3, _{program: Cs, check: VS}, S3),
    Steps = [S1, S2, S3].

kind_name("dtree", "decision tree") :- !.
kind_name("cfg", "context-free grammar") :- !.
kind_name(_, "DCG").

tree_json(dtree(C, Y, N), _{test: CS, yes: YJ, no: NJ}) :- !, show(C, CS), tree_json(Y, YJ), tree_json(N, NJ).
tree_json(leaf(V), _{leaf: VS}) :- !, show(V, VS).
tree_json(X, _{leaf: S}) :- show(X, S).

% 12. AIOC: dividing budgets between candidates
algorithm(aioc_allocate, In, Steps, _{allocations: Rows}) :-
    get_dict(candidates, In, Cands),
    findall(candidate(Id, assessment(A), cost(C), amplitude(Amp)),
            ( member(D, Cands), atom_string(Id, D.name), num(D.assessment, A), num(D.cost, C), num(D.amplitude, Amp) ), Cs),
    get_dict(budgets, In, Bs),
    findall(budget(R, V), ( member(B, Bs), atom_string(R, B.resource), num(B.amount, V) ), Budgets),
    text(In, quantum, "off", QS), atom_string(Q, QS),
    ( Q == off -> Opts = Budgets ; Opts = [seed(7), quantum(Q) | Budgets] ),
    mnn_aioc_allocate:allocate_resources(Cs, Opts, allocation_report(_, _, _, Allocs)),
    findall([IdS, WS | Vals], ( member(candidate_allocation(Id, _, _, _, weight(W), allocation(Shares), _), Allocs),
                                show(Id, IdS), show(W, WS), findall(VS, ( member(budget(R, _), Budgets), memberchk(R-V, Shares), show(V, VS) ), Vals) ), Rows),
    findall(RS, ( member(budget(R, _), Budgets), show(R, RS) ), Heads),
    findall([IdS, AS, CS, AmS], ( member(candidate(Id, assessment(A), cost(C), amplitude(Am)), Cs), maplist(show, [Id, A, C, Am], [IdS, AS, CS, AmS]) ), CRows),
    step(candidates, "The candidates, with their assessment, cost and amplitude.", _{table: _{head: ["candidate", "assessment", "cost", "amplitude"], rows: CRows}}, S1),
    step(weights, "Each candidate's weight comes from its assessment and cost (and amplitude, when quantum-inspired).", _{table: _{head: ["candidate", "weight"], rows: WRows}}, S2),
    findall([I, W], member([I, W | _], Rows), WRows),
    append(["candidate", "weight"], Heads, Head),
    step(divide, "Divide each budget in proportion to the weights, in whole units.", _{table: _{head: Head, rows: Rows}}, S3),
    Steps = [S1, S2, S3].

num(X, N) :- ( number(X) -> N = X ; number_string(N, X) ).

% 13. AIOC: simplify with checked rewrites, and measure
algorithm(aioc_simplify, In, Steps, _{effect: ES}) :-
    text(In, program, "", Text),
    program_from_text(Text, P0), clauses(P0, C0),
    mnn_aioc_simplify:simplify_program(P0, P1, Proof, simplification_report(changes(N), Size0, Size1, structural_effect(E))),
    clauses(P1, C1), size_bars(Size0, B0), size_bars(Size1, B1), show(E, ES),
    ( Proof = proof(PSteps) -> shows(PSteps, PSs) ; PSs = [] ),
    ( catch(mnn_proof_checker:check_proof(P1, P0, Proof, V), _, V = rejected) -> true ; V = rejected ), show(V, VS),
    step(parse, "Read the program and measure it.", _{program: C0, bars: B0}, S1),
    format(string(N2), "Remove true conjuncts and fail disjuncts, and collapse once(true) and once(fail): ~w change(s).", [N]),
    step(simplify, N2, _{program: C1, before: C0, items: PSs}, S2),
    format(string(N3), "Each rewrite is re-checked: ~w. Measure again: ~w.", [VS, ES]),
    step(check, N3, _{program: C1, bars: B1, compare: B0, check: VS}, S3),
    Steps = [S1, S2, S3].

% 14. Starlog: function expressions to predicate calls and back
algorithm(starlog, In, Steps, _{ir: CI, back: Back}) :-
    text(In, program, "", Text),
    % Starlog's operators, so the text can be read; then written in plain functional form for mnns
    op(500, yfx, '&'), op(500, yfx, '•'),
    open_string(Text, Str), read_all(Str, Terms),
    with_output_to(string(Canon), forall(member(T, Terms), ( write_term(T, [quoted(true), ignore_ops(true)]), write('.\n') ))),
    program_from_text(Canon, P0), clauses(P0, C0),
    mnn_starlog:starlog_to_ir(P0, P1), clauses(P1, CI),
    mnn_starlog:ir_to_starlog(P1, P2), clauses(P2, Back),
    step(parse, "Read the Starlog: : joins strings, & joins lists and • joins atoms, written as values.", _{program: C0}, S1),
    step(to_ir, "Turn each expression into the predicate call that computes it.", _{program: CI, before: C0}, S2),
    step(back, "And back again, to the readable Starlog view.", _{program: Back, before: CI}, S3),
    Steps = [S1, S2, S3].

% 15. S2A2's optimisation: learn rewrite rules from before/after pairs, apply them, and
%     re-check the edb_equivalence proof
algorithm(s2a2_optimise, In, Steps, _{verdict: VS, check: CS}) :-
    get_dict(pairs, In, PairsIn),
    findall(pair(B, A, Ts), ( member(Pr, PairsIn), atom_string(N, Pr.name), clause_terms(Pr.before, BC), clause_terms(Pr.after, AC),
                              term_string(Ts, Pr.targets), mnn_s2a2:ir_of(N, BC, mnnaction, [], proof([]), B), mnn_s2a2:ir_of(N, AC, mnnaction, [], proof([]), A) ), Pairs),
    text(In, name, "conn", NameS), atom_string(Name, NameS),
    clause_terms(In.program, PC), term_string(Targets, In.targets),
    mnn_s2a2:ir_of(Name, PC, mnnaction, [], proof([]), P),
    home_options(HO),
    findall(Sx, ( nth1(I, Pairs, pair(B, A, Ts)), clauses(B, BCs), clauses(A, ACs), show(Ts, TsS),
                  format(string(Nx), "Pair ~d: before and after (the answers of ~w stay the same).", [I, TsS]),
                  step(pairs, Nx, _{program: ACs, before: BCs}, Sx) ), PairSteps),
    ( mnn_s2a2:s2a2_learn(Pairs, HO, Alg) -> show(Alg, AlgS) ; Alg = none, AlgS = "nothing learned" ),
    format(string(NL), "S2A2's learn/2 finds the operators and the conditions that explain every pair: ~w", [AlgS]),
    step(learn, NL, _{check: AlgS}, SL),
    clauses(P, C0),
    (   Alg \== none, mnn_s2a2:s2a2_apply(Alg, P, Targets, HO, R)
    ->  R = mnn_program(_, _, _, Proof, trace(Tr)), clauses(R, C1),
        ( memberchk(s2a2_apply(ApSteps), Tr) -> shows(ApSteps, ApS) ; ApS = [] ),
        ( memberchk(s2a2_prover(Verdict), Tr) -> show(Verdict, VS) ; VS = "unknown" ),
        step(apply, "Apply the learned algorithm to a new program.", _{program: C1, before: C0, items: ApS}, SA),
        format(string(NV), "S2A2's prover compares the answers of the targets before and after, over every set of input facts: ~w.", [VS]),
        step(prove, NV, _{check: VS}, SP),
        (   Proof = proof([PS | _])
        ->  show(PS, PSS),
            ( catch(mnn_proof_checker:check_proof(R, P, Proof, V0), _, V0 = rejected) -> true ; V0 = rejected ), show(V0, CS),
            format(string(NC), "mnns's checker repeats the proof (~w) with its own copy of S2A2's prover: ~w.", [PSS, CS])
        ;   CS = "no proof", NC = "No proof: the prover did not prove the targets' answers equal, so mnns keeps the program without one."
        ),
        step(check, NC, _{check: CS}, SC),
        append([PairSteps, [SL, SA, SP, SC]], Steps)
    ;   VS = "not applied", CS = "none",
        step(apply, "Nothing to apply.", _{program: C0}, SA),
        append([PairSteps, [SL, SA]], Steps)
    ).

home_options(O) :- ( s2a2_dir(D) -> O = [s2a2_home(D)] ; O = [] ).

% 16. S2A2's fold.pl: a faster program derived from a specification, with a fold_derivation
%     proof that mnns re-checks
algorithm(s2a2_derive, In, Steps, _{strategy: StS, check: CS}) :-
    text(In, name, "sum", NameS), atom_string(Name, NameS),
    clause_terms(In.program, SC), term_string(Mode, In.mode),
    mnn_s2a2:ir_of(Name, SC, mnnaction, [], proof([]), Spec), clauses(Spec, C0),
    ( get_dict(bound, In, B0), B0 \== "" -> num(B0, Bound), O0 = [bound(Bound)] ; O0 = [] ),
    home_options(HO), append(O0, HO, Opts),
    show(Mode, ModeS),
    format(string(N1), "The specification: a clear program, for inputs of mode ~w.", [ModeS]),
    step(spec, N1, _{program: C0}, S1),
    (   mnn_s2a2:s2a2_derive(Spec, Mode, Opts, R), R = mnn_program(_, _, _, Proof, trace(Tr))
    ->  clauses(R, C1),
        ( memberchk(s2a2_fold(St, Lemmas, Total, Functional, _, Bounded), Tr) -> true ; St = unknown, Lemmas = [], Total = unknown, Functional = unknown, Bounded = unknown ),
        show(St, StS), ( is_list(Lemmas) -> shows(Lemmas, LS) ; show(Lemmas, L1), LS = [L1] ),
        maplist(show, [Total, Functional, Bounded], [TS, FS, BS]),
        format(string(N2), "fold.pl chooses a strategy (~w) and unfolds, folds and proves lemmas to reach a faster program.", [StS]),
        step(derive, N2, _{program: C1, before: C0, items: LS}, S2),
        format(string(N3), "verify/5: the program is ~w and the specification ~w, so they agree on every input of the mode. A bounded check: ~w.", [TS, FS, BS]),
        step(verify, N3, _{table: _{head: ["check", "result"], rows: [["total", TS], ["functional", FS], ["bounded check", BS]]}}, S3),
        (   Proof = proof([PS | _])
        ->  show(PS, PSS), ( catch(mnn_proof_checker:check_proof(R, Spec, Proof, V0), _, V0 = rejected) -> true ; V0 = rejected ), show(V0, CS),
            format(string(N4), "mnns's checker repeats the derivation (~w) with its own copy of fold.pl: ~w.", [PSS, CS])
        ;   CS = "no proof", N4 = "No proof came back."
        ),
        step(check, N4, _{check: CS}, S4),
        % both programs on sample inputs, in the sandbox
        ( get_dict(samples, In, SamplesS), SamplesS \== "" -> term_string(Samples, SamplesS) ; Samples = [] ),
        clauses_text(C0, T0), clauses_text(C1, T1),
        findall([IS, A0, A1], ( member(X, Samples), show(X, IS), G =.. [Name, X, _],
                                sandbox_answers(T0, G, 1, Ans0), sandbox_answers(T1, G, 1, Ans1),
                                first_value(Ans0, A0), first_value(Ans1, A1) ), Rows),
        ( Rows == [] -> Steps = [S1, S2, S3, S4]
        ; step(run, "Run the specification and the derived program on sample inputs.", _{table: _{head: ["input", "specification", "derived"], rows: Rows}}, S5),
          Steps = [S1, S2, S3, S4, S5] )
    ;   StS = "none", CS = "none",
        step(derive, "fold.pl found no faster program it could prove.", _{check: "no derivation"}, S2),
        Steps = [S1, S2]
    ).

first_value([A | _], V) :- sub_string(A, 0, 1, _, "["), !, answer_value(A, V).
first_value(_, "(no answer)").
