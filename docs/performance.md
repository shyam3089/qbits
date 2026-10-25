# Phase 3A.1 performance and reactivity

Phase 3A.1 keeps the Phase 2D grammar and public mount API. The security-fix
revision adds reversible structural preparation and complete runtime numeric checks
without changing generated application syntax.

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

[Recorded observations](benchmarks/reactivity-2026-10-25-security-fixes.json) were
captured on 25 October 2026 with Firefox 157.0. The baseline is the pre-fix Phase 3A.1
runtime saved before implementation; the fixed candidate is the production runtime from
the same compiler fixtures. Each candidate ran in a separate page with three warmups,
21 timing samples, 1,000 operations per update sample, and 15 warmed reorder samples.
Results are machine observations, not universal guarantees.

| Scenario | Pre-fix median | Fixed median | Pre-fix p95 | Fixed p95 |
| --- | ---: | ---: | ---: | ---: |
| 1,000-row lightweight mount | 11 ms | 5 ms | 23 ms | 8 ms |
| 10,000-row lightweight mount | 49 ms | 43 ms | 126 ms | 58 ms |
| Isolated row update | 36 us | 15 us | 202 us | 69 us |
| Computed diamond/two-write chain | 13 us | 19 us | 34 us | 33 us |
| 1,000-row last-to-first reorder | 1 ms | 1 ms | 1 ms | 1 ms |
| Nested child-prop update | 12 us | 23 us | 227 us | 64 us |
| 4 distinct signal writes | 4 us | 4 us | 6 us | 6 us |
| 16 distinct signal writes | 6 us | 6 us | 6 us | 8 us |
| 64 distinct signal writes | 18 us | 20 us | 30 us | 26 us |
| 256 distinct signal writes | 62 us | 70 us | 74 us | 82 us |
| Heavy 1,000-row mount/dispose cycle | 56 ms | 62 ms | n/a | n/a |

The 10,000-row mount remains well below the 152 ms target and the isolated update
remains below 40 us. Computed median, nested median, high-cardinality writes, and the
heavy cycle regressed; these are accepted costs of the added validation and structural
transaction bookkeeping, while their p95 values stayed similar or improved except for
256 writes. Keyed reorder creates no elements or text writes and preserves focus, DOM
identity, and child-local state.

Firefox did not expose `performance.memory`. After explicit Playwright GC, the WeakRef
probe observed zero reachable supplied-prop objects and zero reachable rendered nodes
for both candidates while retaining 30 disposed handles. Listener balance and empty
mount targets were also verified; these observations are not a formal leak proof.

## Bundle and startup tradeoff

The runtime changed from 26,634 to 33,361 bytes raw and from 5,940 to 6,930 bytes gzip.
The example production JavaScript changed from 20.51 to 22.79 kB minified and from 5.50
to 6.27 kB gzip. The increase pays for staged structural commits, failure aggregation,
component disabling after failed recovery, and complete numeric validation. No new
dependency was added. Removing those paths would violate the documented safety behavior.

## Reproduce

Run `npm run build`, then `npm run bench:reactivity`. For a same-process comparison,
save a built baseline runtime and run:

```sh
npm run bench:reactivity -- --baseline /path/to/runtime.js --output docs/benchmarks/result.json
```

The benchmark uses Firefox only. Fixtures and instrumentation remain under `tests/`
and `scripts/` and are excluded from production modules. Timing is not a CI threshold;
correctness tests assert DOM operations, rollback, cleanup, and identity separately.
