# Phase 3A.3 performance and reactivity

The Phase 3A.3 Firefox A/B record is
[reactivity-2026-10-25-phase3a3.json](benchmarks/reactivity-2026-10-25-phase3a3.json).
An independent repeat is
[reactivity-2026-10-25-phase3a3-repeat.json](benchmarks/reactivity-2026-10-25-phase3a3-repeat.json).
It uses the unchanged Phase 3A.2 runtime as baseline, identical production modules,
Firefox 157.0, three warmups, 21 timing samples, 1,000 update operations and 15 reorder
samples. The checked-in validator record is
[validator-2026-10-25-phase3a3.json](benchmarks/validator-2026-10-25-phase3a3.json).

Validator duplicate checking now has 4k/8k/16k medians of 1.48/1.59/7.73 ms
(p95 1.84/3.44/10.75 ms), replacing the confirmed quadratic 164/655/2,477 ms behavior.
Full parse/validate/generate compilation medians are 25.37/46.62/109.11 ms
(p95 43.01/61.90/132.07 ms) for the same sources.
Runtime budget checks add constant-time
integer accounting at allocation and effect boundaries; rollback and cleanup guarantees
were not removed for performance.

| Production Firefox scenario | 3A.2 median/p95 | 3A.3 median/p95 |
| --- | ---: | ---: |
| 1,000-row mount | 6/9 ms | 4/9 ms |
| 10,000-row mount | 36/77 ms | 35/49 ms |
| Isolated reactive update | 18/98 us | 22/82 us |
| Computed chain | 15/46 us | 11/68 us |
| Keyed reconciliation | 1/1 ms | 0/1 ms |
| Nested component prop update | 15/85 us | 15/155 us |
| 1,000-row mount/dispose cycle | 47/57 ms | 49/57 ms |

The repeat produced 6/12 to 4/7 ms (1k mount), 40/89 to 34/43 ms (10k mount),
15/98 to 11/78 us (isolated update), 17/74 to 10/27 us (computed), 1/1 to 1/1 ms
(reconcile), 12/109 to 13/53 us (nested), and 48 to 51 ms cycle medians. The p95
nested spike in the primary run did not repeat, so it is reported as Firefox variance,
not optimized by weakening checks. Runtime size changes from 35,871 to 41,064 raw bytes
and 7,435 to 8,251 gzip bytes (+5,193 raw, +816 gzip). No dependency was added.

Phase 3A.2 keeps the Phase 2D grammar and existing four-argument mount calls. Optional
compiler and runtime limit objects add bounded work without changing generated application
syntax. All Phase 3A.1 rollback, validation, cleanup, and identity guarantees remain.

## Measured causes and retained optimizations

Profiling found avoidable literal-binding effects, whole-state transaction snapshots,
redundant DOM property writes, child remounts, and non-minimal keyed moves. The runtime
therefore keeps compiler-marked static bindings, first-write transaction journaling,
computed-before-DOM scheduling, equality checks, child prop refresh, and longest-
increasing-subsequence keyed movement.

The H1 failures came from destroying committed keyed records and conditional branches
before replacement mounting had succeeded. Replacements now mount into detached
fragments and register transaction commit/rollback hooks. Successful commits update the
DOM and reconciliation map before removed scopes are disposed. Cleanup failures after
commit are reported as post-commit errors; they do not trigger a false rollback.

The transaction journal uses reused arrays and records only the first old value of each
directly written signal. A reusable identity `Set` was evaluated in Firefox against the
same fixed runtime. At 4/16/64/256 distinct writes, the linear journal medians were
2/6/14/54 us versus 2/6/18/58 us for the thresholded set variant. The set also added
565 raw and 102 gzip bytes, so it was not retained. The checked-in benchmark includes
the distinct-write cases so this decision can be revisited if transaction sizes change.

## Firefox measurements

[Primary](benchmarks/reactivity-2026-10-25-phase3a2.json) and
[repeat](benchmarks/reactivity-2026-10-25-phase3a2-repeat.json) observations were captured
on 25 October 2026 with Firefox 157.0. The baseline is the exact Phase 3A.1 runtime at
commit `56a202f`; the candidate is the Phase 3A.2 production runtime. Each candidate ran
in a separate page with identical fixtures, three warmups, 21 timing samples, 1,000
operations per update sample, and 15 warmed reorder samples.

| Scenario | 3A.1 medians | 3A.2 medians | 3A.1 p95 | 3A.2 p95 |
| --- | ---: | ---: | ---: | ---: |
| 1,000-row lightweight mount | 6 / 6 ms | 4 / 4 ms | 10 / 12 ms | 10 / 6 ms |
| 10,000-row lightweight mount | 35 / 36 ms | 43 / 36 ms | 93 / 71 ms | 51 / 52 ms |
| Isolated row update | 22 / 26 us | 22 / 34 us | 79 / 148 us | 118 / 131 us |
| Computed diamond/two-write chain | 17 / 12 us | 12 / 9 us | 23 / 34 us | 35 / 20 us |
| Nested child-prop update | 19 / 18 us | 13 / 22 us | 107 / 255 us | 164 / 594 us |
| Heavy 1,000-row mount/dispose cycle | 59 / 51 ms | 55 / 55 ms | n/a | n/a |

The earlier 13 to 19 us computed, 12 to 23 us nested-prop, and 56 to 62 ms heavy-cycle
regressions did not reproduce consistently. Across the paired runs, computed improved,
nested props crossed in opposite directions, and the heavy cycle stayed within four
milliseconds. The security-limit overhead is therefore reported as the complete A/B
delta above: the only repeatable cost is bundle size; timing deltas were smaller than
run-to-run Firefox variance. No rollback or cleanup path was removed to chase noise.

Firefox did not expose `performance.memory`. After explicit Playwright GC, the WeakRef
probe observed zero reachable supplied-prop objects and zero reachable rendered nodes
for both candidates while retaining 30 disposed handles. Listener balance and empty
mount targets were also verified; these observations are not a formal leak proof.

## Bundle and startup tradeoff

Phase 3A.2 changes the runtime from 33,361 to 35,871 bytes raw and from 6,930 to 7,435
bytes gzip (+505 bytes). The example production JavaScript is 24.22 kB minified and 6.63
kB gzip. The increase pays for validated configurable limits, scheduler accounting,
component-depth propagation, and guarded list operations. No dependency was added.

## Reproduce

Run `npm run build`, then `npm run bench:reactivity`. For a same-process comparison,
save a built baseline runtime and run:

```sh
npm run bench:reactivity -- --baseline /path/to/runtime.js --output docs/benchmarks/result.json
```

The benchmark uses Firefox only. Fixtures and instrumentation remain under `tests/`
and `scripts/` and are excluded from production modules. Timing is not a CI threshold;
correctness tests assert DOM operations, rollback, cleanup, and identity separately.
